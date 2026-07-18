import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  Prisma,
  VoicePhoneNumberLifecycle,
  VoicePhoneRegulatoryStatus,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { TwilioTenantProvisioningService } from '@modules/twilio/provisioning/twilio-tenant-provisioning.service';
import { PrismaService } from '@shared/database/prisma.service';
import { maskE164 } from '@modules/twilio/provisioning/twilio-provisioning.masking';
import {
  VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE,
  type VoicePhoneOnboardingPath,
  type VoicePhoneOnboardingRecord,
  type VoicePhoneOnboardingStatus,
  type VoicePhoneOnboardingView,
} from './voice-phone-onboarding.types';

const DEFAULT_RECORD: VoicePhoneOnboardingRecord = {
  path: null,
  status: 'not_started',
  updatedAt: new Date(0).toISOString(),
};

@Injectable()
export class VoicePhoneOnboardingService {
  private readonly logger = new Logger(VoicePhoneOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twilioProvisioning: TwilioTenantProvisioningService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async getOnboarding(orgId: string): Promise<VoicePhoneOnboardingView> {
    const assistant = await this.requireAssistant(orgId);
    const record = this.parseRecord(assistant.phoneOnboarding);
    const phone = await this.latestOrgPhone(orgId);
    const job = await this.latestProvisioningJob(orgId);
    const preview = await this.twilioProvisioning.previewProvisioning(orgId).catch(() => null);
    const regulatory = preview?.regulatory ?? null;

    const derivedStatus = this.deriveStatus({
      record,
      phone,
      job,
      assistantPhone: assistant.phoneNumber,
      regulatoryOverall: regulatory?.overall ?? null,
    });

    const status = this.mergeStatus(record.status, derivedStatus);
    const synqTarget = assistant.phoneNumber
      ? maskE164(assistant.phoneNumber)
      : phone?.maskedPhoneNumber ?? null;

    return {
      organizationId: orgId,
      path: record.path,
      status,
      statusLabelKey: `voice.phone.status.${status}`,
      maskedAssignedNumber: assistant.phoneNumber
        ? maskE164(assistant.phoneNumber)
        : phone?.maskedPhoneNumber ?? null,
      synqDriveTargetNumber: synqTarget,
      provisioningJob: job
        ? {
            id: job.id,
            status: job.status,
            currentStep: job.currentStep,
            progressPct: job.progressPct,
            errorMessage: job.errorMessage,
          }
        : null,
      regulatory: regulatory
        ? {
            overall: regulatory.overall,
            bundle: regulatory.bundle,
            address: regulatory.address,
            endUser: regulatory.endUser,
          }
        : null,
      regulatoryRequirements: this.defaultRegulatoryRequirements(),
      monthlyNumberCostCents: VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE,
      trialPurchaseBlocked: preview?.trialRestricted ?? false,
      canPurchase: Boolean(preview?.ready && !preview.trialRestricted),
      record: { ...record, status },
    };
  }

  async selectPath(
    orgId: string,
    path: VoicePhoneOnboardingPath,
    actorUserId?: string,
  ): Promise<VoicePhoneOnboardingView> {
    const record = await this.updateRecord(orgId, {
      path,
      status: path === 'sip_pbx' ? 'under_review' : 'path_selected',
      ...(path === 'port_number' ? { port: { checklistAcknowledged: false, estimatedWeeks: 4 } } : {}),
      ...(path === 'sip_pbx' ? { sip: { supportRequestedAt: new Date().toISOString() } } : {}),
    });
    await this.audit(orgId, actorUserId, 'VOICE_PHONE_ONBOARDING_PATH_SELECTED', { path });
    return this.getOnboarding(orgId);
  }

  async searchNumbers(orgId: string, input: { areaCode?: string; numberType?: 'local' | 'mobile'; limit?: number }) {
    await this.assertPath(orgId, 'new_synqdrive_number');
    const result = await this.twilioProvisioning.searchPhoneNumbers({
      organizationId: orgId,
      areaCode: input.areaCode,
      numberType: input.numberType ?? 'local',
      limit: input.limit ?? 10,
    });
    return {
      ...result,
      monthlyCostCents: VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE,
    };
  }

  async previewPurchase(orgId: string, selectionToken: string, actorUserId?: string) {
    await this.assertPath(orgId, 'new_synqdrive_number');
    const result = await this.twilioProvisioning.purchasePhoneNumberBySelectionToken({
      organizationId: orgId,
      selectionToken,
      actor: {
        userId: actorUserId,
        idempotencyKey: `preview:${orgId}:${selectionToken}`,
        confirm: true,
        dryRun: true,
      },
    });
    await this.updateRecord(orgId, {
      newNumber: {
        country: 'DE',
        selectedMasked: result.maskedPhoneNumber,
        selectionToken,
        monthlyCostCents: VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE,
      },
      status: 'path_selected',
    });
    return {
      maskedPhoneNumber: result.maskedPhoneNumber,
      monthlyCostCents: VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE,
      regulatoryStatus: result.regulatoryStatus,
      lifecycle: result.lifecycle,
      trialBlocked: false,
    };
  }

  async confirmPurchase(
    orgId: string,
    selectionToken: string,
    confirm: boolean,
    idempotencyKey: string,
    actorUserId?: string,
  ) {
    if (!confirm) {
      throw new BadRequestException('Explicit confirmation is required to purchase a phone number.');
    }
    await this.assertPath(orgId, 'new_synqdrive_number');
    const view = await this.getOnboarding(orgId);
    if (view.trialPurchaseBlocked) {
      throw new ForbiddenException('Phone number purchase is not available during trial.');
    }
    if (!view.canPurchase) {
      throw new BadRequestException('Provisioning prerequisites are not met.');
    }

    const result = await this.twilioProvisioning.purchasePhoneNumberBySelectionToken({
      organizationId: orgId,
      selectionToken,
      actor: {
        userId: actorUserId,
        idempotencyKey,
        confirm: true,
        dryRun: false,
      },
    });

    await this.updateRecord(orgId, {
      status:
        result.regulatoryStatus === 'PENDING' || result.regulatoryStatus === 'IN_REVIEW'
          ? 'evidence_required'
          : 'reserved',
      newNumber: {
        country: 'DE',
        selectedMasked: result.maskedPhoneNumber,
        selectionToken,
        monthlyCostCents: VOICE_PHONE_ONBOARDING_MONTHLY_COST_CENTS_DE,
      },
    });

    await this.audit(orgId, actorUserId, 'VOICE_PHONE_NUMBER_PURCHASE_REQUESTED', {
      phoneNumberId: result.phoneNumberId,
      maskedPhoneNumber: result.maskedPhoneNumber,
      jobId: result.job.id,
    });

    return result;
  }

  async updateForward(orgId: string, input: { carrierNotes?: string; loopProtectionAcknowledged?: boolean }) {
    await this.assertPath(orgId, 'forward_existing');
    await this.updateRecord(orgId, {
      status: input.loopProtectionAcknowledged ? 'path_selected' : 'evidence_required',
      forward: input,
    });
    return this.getOnboarding(orgId);
  }

  async recordForwardTest(orgId: string, result: 'passed' | 'failed', actorUserId?: string) {
    await this.assertPath(orgId, 'forward_existing');
    await this.updateRecord(orgId, {
      status: result === 'passed' ? 'active' : 'failed',
      forward: { testStatus: result },
    });
    await this.audit(orgId, actorUserId, 'VOICE_PHONE_FORWARD_TEST_RECORDED', { result });
    return this.getOnboarding(orgId);
  }

  async updatePort(orgId: string, input: { checklistAcknowledged: boolean; documentsSubmitted?: boolean }) {
    await this.assertPath(orgId, 'port_number');
    const status: VoicePhoneOnboardingStatus = input.documentsSubmitted
      ? 'under_review'
      : input.checklistAcknowledged
        ? 'evidence_required'
        : 'path_selected';
    await this.updateRecord(orgId, {
      status,
      port: {
        checklistAcknowledged: input.checklistAcknowledged,
        documentsSubmitted: input.documentsSubmitted,
        estimatedWeeks: 4,
      },
    });
    return this.getOnboarding(orgId);
  }

  async requestSip(orgId: string, contactEmail?: string, actorUserId?: string) {
    await this.updateRecord(orgId, {
      path: 'sip_pbx',
      status: 'under_review',
      sip: { supportRequestedAt: new Date().toISOString(), contactEmail },
    });
    await this.audit(orgId, actorUserId, 'VOICE_PHONE_SIP_SUPPORT_REQUESTED', { contactEmail });
    return this.getOnboarding(orgId);
  }

  private async assertPath(orgId: string, expected: VoicePhoneOnboardingPath) {
    const view = await this.getOnboarding(orgId);
    if (view.path !== expected) {
      throw new BadRequestException('Phone onboarding path does not match this action.');
    }
  }

  private async requireAssistant(orgId: string) {
    const assistant = await this.prisma.voiceAssistant.findUnique({ where: { organizationId: orgId } });
    if (!assistant) {
      throw new BadRequestException('Voice assistant is not configured for this organization.');
    }
    return assistant;
  }

  private async latestOrgPhone(orgId: string) {
    return this.prisma.voicePhoneNumber.findFirst({
      where: { organizationId: orgId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async latestProvisioningJob(orgId: string) {
    return this.prisma.voiceProvisioningJob.findFirst({
      where: {
        organizationId: orgId,
        jobType: {
          in: [
            VoiceProvisioningJobType.TWILIO_NUMBER_PURCHASE,
            VoiceProvisioningJobType.TWILIO_SUBACCOUNT_CREATE,
            VoiceProvisioningJobType.ELEVENLABS_NUMBER_IMPORT,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private parseRecord(value: Prisma.JsonValue | null): VoicePhoneOnboardingRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ...DEFAULT_RECORD };
    }
    const raw = value as Partial<VoicePhoneOnboardingRecord>;
    return {
      ...DEFAULT_RECORD,
      ...raw,
      path: raw.path ?? null,
      status: raw.status ?? 'not_started',
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
    };
  }

  private async updateRecord(
    orgId: string,
    patch: Partial<VoicePhoneOnboardingRecord>,
  ): Promise<VoicePhoneOnboardingRecord> {
    const assistant = await this.requireAssistant(orgId);
    const current = this.parseRecord(assistant.phoneOnboarding);
    const next: VoicePhoneOnboardingRecord = {
      ...current,
      ...patch,
      forward: { ...current.forward, ...patch.forward },
      port: { ...current.port, ...patch.port },
      sip: { ...current.sip, ...patch.sip },
      newNumber: { ...current.newNumber, ...patch.newNumber },
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: { phoneOnboarding: next as Prisma.InputJsonValue },
    });
    return next;
  }

  private deriveStatus(input: {
    record: VoicePhoneOnboardingRecord;
    phone: { lifecycle: VoicePhoneNumberLifecycle; regulatoryStatus: VoicePhoneRegulatoryStatus } | null;
    job: { status: VoiceProvisioningJobStatus; errorMessage: string | null } | null;
    assistantPhone: string | null;
    regulatoryOverall: VoicePhoneRegulatoryStatus | null;
  }): VoicePhoneOnboardingStatus {
    if (input.assistantPhone || input.phone?.lifecycle === VoicePhoneNumberLifecycle.ACTIVE) {
      return 'active';
    }
    if (input.phone?.lifecycle === VoicePhoneNumberLifecycle.SUSPENDED) {
      return 'suspended';
    }
    if (input.job?.status === VoiceProvisioningJobStatus.FAILED) {
      return 'failed';
    }
    if (
      input.phone?.lifecycle === VoicePhoneNumberLifecycle.PROVISIONING ||
      input.job?.status === VoiceProvisioningJobStatus.IN_PROGRESS ||
      input.job?.status === VoiceProvisioningJobStatus.PENDING
    ) {
      return 'reserved';
    }
    if (
      input.regulatoryOverall === VoicePhoneRegulatoryStatus.PENDING ||
      input.regulatoryOverall === VoicePhoneRegulatoryStatus.IN_REVIEW ||
      input.phone?.regulatoryStatus === VoicePhoneRegulatoryStatus.PENDING ||
      input.phone?.regulatoryStatus === VoicePhoneRegulatoryStatus.IN_REVIEW
    ) {
      return input.record.path === 'port_number' ? 'under_review' : 'evidence_required';
    }
    if (input.record.path) {
      return input.record.status === 'not_started' ? 'path_selected' : input.record.status;
    }
    return 'not_started';
  }

  private mergeStatus(
    stored: VoicePhoneOnboardingStatus,
    derived: VoicePhoneOnboardingStatus,
  ): VoicePhoneOnboardingStatus {
    const rank: Record<VoicePhoneOnboardingStatus, number> = {
      not_started: 0,
      path_selected: 1,
      evidence_required: 2,
      under_review: 3,
      reserved: 4,
      active: 5,
      failed: 6,
      suspended: 7,
    };
    return rank[derived] >= rank[stored] ? derived : stored;
  }

  private defaultRegulatoryRequirements(): string[] {
    return [
      'Business registration or trade license (Gewerbeanmeldung / Handelsregister)',
      'Authorized representative identity verification',
      'Service address in Germany matching regulatory bundle',
    ];
  }

  private async audit(
    orgId: string,
    actorUserId: string | undefined,
    auditAction: string,
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.activityLog.log({
        organizationId: orgId,
        userId: actorUserId,
        action: 'UPDATE' as ActivityAction,
        entity: 'ORGANIZATION' as ActivityEntity,
        entityId: orgId,
        description: 'Voice phone onboarding updated.',
        metaJson: { auditAction, ...metadata },
      });
    } catch (err) {
      this.logger.warn(
        `Phone onboarding audit failed org=${orgId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
