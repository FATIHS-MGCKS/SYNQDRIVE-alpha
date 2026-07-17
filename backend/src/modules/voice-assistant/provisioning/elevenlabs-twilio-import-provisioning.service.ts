import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
  VoicePhoneRegulatoryStatus,
  VoiceProviderAccountStatus,
  VoiceProviderAccountType,
  VoiceProvisioningErrorClass,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { PrismaService } from '@shared/database/prisma.service';
import { TwilioTenantClientFactory } from '@modules/twilio/twilio-tenant-client.factory';
import { digestCanonicalValue } from '@modules/twilio/provisioning/twilio-provisioning.masking';
import { maskExternalId } from '../elevenlabs-provider/elevenlabs-provider.redaction';
import { readTwilioProvisioningFlags } from '@modules/twilio/provisioning/twilio-provisioning.config';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
} from '../control-plane/voice-control-plane.repository';
import { ElevenLabsProviderAdapter } from '../elevenlabs-provider/elevenlabs-provider.adapter';
import { ElevenLabsProviderTenantResolver } from '../elevenlabs-provider/elevenlabs-provider.tenant-resolver';
import {
  ElevenLabsInvalidConfigurationError,
  ElevenLabsProviderError,
  ElevenLabsRegionMismatchError,
  ElevenLabsTenantIsolationViolationError,
} from '../elevenlabs-provider/elevenlabs-provider.errors';
import { ElevenLabsTwilioImportCredentialsResolver } from './elevenlabs-twilio-import-credentials.resolver';
import {
  ELEVENLABS_IMPORT_DEFAULTS,
  isElevenLabsImportStagingEnabled,
  isNativeTelephonyEnabled,
} from './elevenlabs-twilio-import.config';
import type {
  ElevenLabsTwilioDeactivateResult,
  ElevenLabsTwilioImportAndAssignInput,
  ElevenLabsTwilioImportAndAssignResult,
  ElevenLabsTwilioImportReadiness,
} from './elevenlabs-twilio-import.types';

@Injectable()
export class ElevenLabsTwilioImportProvisioningService {
  private readonly logger = new Logger(ElevenLabsTwilioImportProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elevenLabs: ElevenLabsProviderAdapter,
    private readonly tenantResolver: ElevenLabsProviderTenantResolver,
    private readonly credentialsResolver: ElevenLabsTwilioImportCredentialsResolver,
    private readonly twilioTenantFactory: TwilioTenantClientFactory,
    private readonly phoneNumberRepository: VoicePhoneNumberRepository,
    private readonly deploymentRepository: VoiceAgentDeploymentRepository,
    private readonly provisioningJobRepository: VoiceProvisioningJobRepository,
    private readonly audit: AuditService,
  ) {}

  async evaluateReadiness(
    organizationId: string,
    phoneNumberId: string,
    deploymentId?: string,
  ): Promise<ElevenLabsTwilioImportReadiness> {
    const phone = await this.loadPhoneOrThrow(organizationId, phoneNumberId);
    const deployment = deploymentId
      ? await this.deploymentRepository.findById(organizationId, deploymentId)
      : await this.prisma.voiceAgentDeployment.findFirst({
          where: {
            organizationId,
            archivedAt: null,
            provider: VoiceControlPlaneProvider.ELEVENLABS,
            status: VoiceAgentDeploymentStatus.ACTIVE,
          },
          orderBy: { version: 'desc' },
        });

    const subaccount = await this.prisma.voiceProviderAccount.findFirst({
      where: {
        organizationId,
        id: phone.providerAccountId,
        provider: VoiceControlPlaneProvider.TWILIO,
        accountType: VoiceProviderAccountType.SUBACCOUNT,
        archivedAt: null,
      },
    });

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!subaccount || subaccount.status !== VoiceProviderAccountStatus.ACTIVE) {
      blockers.push('Twilio subaccount is not active for this phone number.');
    }

    const regionOk =
      subaccount?.region?.trim().toLowerCase() === TWILIO_DEFAULT_REGION &&
      subaccount?.edge?.trim().toLowerCase() === TWILIO_DEFAULT_EDGE;
    if (!regionOk) {
      blockers.push(`Twilio routing must use ${TWILIO_DEFAULT_REGION}/${TWILIO_DEFAULT_EDGE}.`);
    }

    if (!deployment) {
      blockers.push('Active ElevenLabs agent deployment not found for organization.');
    } else if (deployment.organizationId !== organizationId) {
      blockers.push('Deployment does not belong to organization.');
    }

    const capabilities = this.readCapabilities(phone.capabilities);
    const voiceCapable = capabilities?.voice !== false;
    if (!voiceCapable) {
      blockers.push('Phone number is not voice-capable.');
    }

    if (
      phone.regulatoryStatus === VoicePhoneRegulatoryStatus.REJECTED ||
      phone.regulatoryStatus === VoicePhoneRegulatoryStatus.PENDING ||
      phone.regulatoryStatus === VoicePhoneRegulatoryStatus.IN_REVIEW
    ) {
      blockers.push('Regulatory status does not allow activation.');
    }

    const assignmentConflict = await this.hasAssignmentConflict(
      organizationId,
      phoneNumberId,
      deployment?.id ?? null,
    );
    if (assignmentConflict) {
      blockers.push('Conflicting phone-to-agent assignment exists for organization.');
    }

    let credentialMode: ElevenLabsTwilioImportReadiness['credentialMode'] = 'unsupported';
    try {
      await this.credentialsResolver.resolveSubaccountImportCredentials(organizationId);
      credentialMode = 'subaccount_auth_token';
    } catch {
      blockers.push(
        'ElevenLabs import credentials unavailable — subaccount Auth Token required (not parent account or API key only).',
      );
    }

    if (!isNativeTelephonyEnabled()) {
      warnings.push('VOICE_AI_NATIVE_TELEPHONY is disabled — import mutations are gated.');
    }

    return {
      organizationId,
      phoneNumberId,
      deploymentId: deployment?.id ?? null,
      ready: blockers.length === 0,
      blockers,
      warnings,
      twilioSubaccountActive: subaccount?.status === VoiceProviderAccountStatus.ACTIVE,
      regionOk,
      voiceCapable,
      regulatoryStatus: phone.regulatoryStatus,
      importStatus: phone.elevenLabsImportStatus,
      deploymentStatus: deployment?.status ?? null,
      assignmentConflict,
      credentialMode,
    };
  }

  async importAndAssign(
    input: ElevenLabsTwilioImportAndAssignInput,
  ): Promise<ElevenLabsTwilioImportAndAssignResult> {
    this.assertConfirmation(input.actor);
    const flags = readTwilioProvisioningFlags();
    const stagingEnabled = isElevenLabsImportStagingEnabled();
    const dryRun = input.actor.dryRun === true || !stagingEnabled;

    if (!flags.subaccountsEnabled || !isNativeTelephonyEnabled()) {
      throw new ForbiddenException('ElevenLabs native telephony provisioning is disabled.');
    }

    const readiness = await this.evaluateReadiness(
      input.organizationId,
      input.phoneNumberId,
      input.deploymentId,
    );
    if (!readiness.ready && readiness.importStatus !== VoiceElevenLabsImportStatus.IMPORTED &&
        readiness.importStatus !== VoiceElevenLabsImportStatus.ASSIGNED) {
      throw new BadRequestException(readiness.blockers.join(' '));
    }

    const deployment = input.deploymentId
      ? await this.loadDeploymentOrThrow(input.organizationId, input.deploymentId)
      : await this.tenantResolver.resolveActiveDeployment(input.organizationId);

    const deploymentId = deployment.id;

    const { job, created } = await this.provisioningJobRepository.persistOrGet({
      organizationId: input.organizationId,
      jobType: VoiceProvisioningJobType.ELEVENLABS_NUMBER_IMPORT,
      idempotencyKey: input.actor.idempotencyKey,
      currentStep: 'readiness',
      progressPct: 5,
      phoneNumberId: input.phoneNumberId,
      deploymentId,
      createdByUserId: input.actor.userId ?? null,
      payload: {
        dryRun,
        deploymentId,
      },
    });

    const phone = await this.loadPhoneOrThrow(input.organizationId, input.phoneNumberId);

    if (
      phone.elevenLabsImportStatus === VoiceElevenLabsImportStatus.ASSIGNED &&
      phone.protectedElevenLabsRef
    ) {
      const agentRef = await this.tenantResolver.resolveAgentRef(
        input.organizationId,
        deploymentId,
      );
      return {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        deploymentId,
        dryRun,
        mutating: false,
        importStatus: phone.elevenLabsImportStatus,
        maskedElevenLabsPhoneRef: maskExternalId(phone.protectedElevenLabsRef, 'phone'),
        maskedAgentRef: agentRef.maskedExternalRef,
        job: this.toJobView(job),
        rolledBack: false,
      };
    }

    if (dryRun) {
      return {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        deploymentId,
        dryRun: true,
        mutating: false,
        importStatus: phone.elevenLabsImportStatus,
        maskedElevenLabsPhoneRef: maskExternalId(phone.protectedElevenLabsRef, 'phone'),
        maskedAgentRef: null,
        job: this.toJobView(job),
        rolledBack: false,
      };
    }

    if (!created && job.status === VoiceProvisioningJobStatus.COMPLETED) {
      const current = await this.loadPhoneOrThrow(input.organizationId, input.phoneNumberId);
      const agentRef = await this.tenantResolver.resolveAgentRef(
        input.organizationId,
        deploymentId,
      );
      return {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        deploymentId,
        dryRun: false,
        mutating: false,
        importStatus: current.elevenLabsImportStatus,
        maskedElevenLabsPhoneRef: maskExternalId(current.protectedElevenLabsRef, 'phone'),
        maskedAgentRef: agentRef.maskedExternalRef,
        job: this.toJobView(job),
        rolledBack: false,
      };
    }

    let workingJob = job;
    let importedElevenLabsId = phone.protectedElevenLabsRef;
    let rolledBack = false;
    const previousAssignment = await this.findPreviousAssignmentSnapshot(
      input.organizationId,
      input.phoneNumberId,
    );

    try {
      workingJob = await this.provisioningJobRepository.updateProgress(
        input.organizationId,
        job.id,
        {
          status: VoiceProvisioningJobStatus.IN_PROGRESS,
          startedAt: new Date(),
          currentStep: 'import_number',
          progressPct: 20,
        },
      );

      await this.phoneNumberRepository.updateImportState(input.organizationId, input.phoneNumberId, {
        elevenLabsImportStatus: VoiceElevenLabsImportStatus.IMPORTING,
      });

      if (!importedElevenLabsId) {
        const credentials = await this.withRetry(() =>
          this.credentialsResolver.resolveSubaccountImportCredentials(input.organizationId),
        );
        const e164 = await this.resolveE164(input.organizationId, phone.protectedExternalRef);
        const importResult = await this.withRetry(() =>
          this.elevenLabs.importTwilioPhoneNumber({
            organizationId: input.organizationId,
            phoneNumberId: input.phoneNumberId,
            e164,
            twilioAccountSid: credentials.accountSid,
            twilioAuthToken: credentials.authToken,
            region: TWILIO_DEFAULT_REGION,
            label: 'SynqDrive',
          }),
        );
        importedElevenLabsId = importResult.elevenLabsPhoneId;
        await this.phoneNumberRepository.updateImportState(input.organizationId, input.phoneNumberId, {
          protectedElevenLabsRef: importedElevenLabsId,
          elevenLabsRefDigest: digestCanonicalValue(importedElevenLabsId),
          elevenLabsImportStatus: VoiceElevenLabsImportStatus.IMPORTED,
        });
      }

      workingJob = await this.provisioningJobRepository.updateProgress(
        input.organizationId,
        job.id,
        {
          currentStep: 'assign_agent',
          progressPct: 70,
        },
      );

      await this.withRetry(() =>
        this.elevenLabs.assignPhoneNumberToAgent({
          organizationId: input.organizationId,
          phoneNumberId: input.phoneNumberId,
          deploymentId,
        }),
      );

      await this.phoneNumberRepository.updateImportState(input.organizationId, input.phoneNumberId, {
        elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
        voiceAssistantId: deployment.voiceAssistantId,
        lifecycle: VoicePhoneNumberLifecycle.ACTIVE,
      });

      workingJob = await this.provisioningJobRepository.updateProgress(
        input.organizationId,
        job.id,
        {
          status: VoiceProvisioningJobStatus.COMPLETED,
          currentStep: 'completed',
          progressPct: 100,
          completedAt: new Date(),
          deploymentId,
          errorClass: null,
          errorMessage: null,
        },
      );

      const agentRef = await this.tenantResolver.resolveAgentRef(
        input.organizationId,
        deploymentId,
      );

      void this.audit.record({
        actorUserId: input.actor.userId,
        actorOrganizationId: input.organizationId,
        action: ActivityAction.ADMIN_OVERRIDE,
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: input.phoneNumberId,
        description: 'ELEVENLABS_TWILIO_NUMBER_IMPORTED_AND_ASSIGNED',
        level: 'CRITICAL',
        metaJson: {
          deploymentId,
          dryRun: false,
        },
      });

      return {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        deploymentId,
        dryRun: false,
        mutating: true,
        importStatus: VoiceElevenLabsImportStatus.ASSIGNED,
        maskedElevenLabsPhoneRef: maskExternalId(importedElevenLabsId, 'phone'),
        maskedAgentRef: agentRef.maskedExternalRef,
        job: this.toJobView(workingJob),
        rolledBack: false,
      };
    } catch (err: unknown) {
      const message =
        err instanceof ElevenLabsProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'ElevenLabs import and assign failed.';

      this.logger.warn(
        `ElevenLabs import/assign failed org=${input.organizationId} phone=${input.phoneNumberId}: ${message}`,
      );

      rolledBack = await this.rollbackAssignment({
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        deploymentId,
        previousAssignment,
        importedElevenLabsId,
      });

      await this.phoneNumberRepository.updateImportState(input.organizationId, input.phoneNumberId, {
        elevenLabsImportStatus: importedElevenLabsId
          ? VoiceElevenLabsImportStatus.IMPORTED
          : VoiceElevenLabsImportStatus.FAILED,
      });

      workingJob = await this.provisioningJobRepository.updateProgress(
        input.organizationId,
        job.id,
        {
          status: VoiceProvisioningJobStatus.FAILED,
          currentStep: 'failed',
          failedAt: new Date(),
          errorClass: this.mapErrorClass(err),
          errorMessage: message,
          retryCount: job.retryCount + 1,
          payload: {
            dryRun,
            deploymentId,
            rolledBack,
            previousAssignment,
          },
        },
      );

      throw err;
    }
  }

  async deactivateAssignment(
    organizationId: string,
    phoneNumberId: string,
    actor: { userId?: string; confirm?: boolean },
  ): Promise<ElevenLabsTwilioDeactivateResult> {
    if (!actor.confirm) {
      throw new BadRequestException('Deactivation requires confirm=true.');
    }

    const phone = await this.loadPhoneOrThrow(organizationId, phoneNumberId);
    if (phone.elevenLabsImportStatus !== VoiceElevenLabsImportStatus.ASSIGNED) {
      return {
        organizationId,
        phoneNumberId,
        importStatus: phone.elevenLabsImportStatus,
        deactivated: false,
      };
    }

    if (isElevenLabsImportStagingEnabled()) {
      await this.elevenLabs.unassignPhoneNumberFromAgent({
        organizationId,
        phoneNumberId,
      });
    }

    await this.phoneNumberRepository.updateImportState(organizationId, phoneNumberId, {
      elevenLabsImportStatus: VoiceElevenLabsImportStatus.IMPORTED,
      voiceAssistantId: null,
    });

    void this.audit.record({
      actorUserId: actor.userId,
      actorOrganizationId: organizationId,
      action: ActivityAction.ADMIN_OVERRIDE,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: phoneNumberId,
      description: 'ELEVENLABS_TWILIO_NUMBER_DEACTIVATED',
      level: 'WARN',
    });

    return {
      organizationId,
      phoneNumberId,
      importStatus: VoiceElevenLabsImportStatus.IMPORTED,
      deactivated: true,
    };
  }

  private async rollbackAssignment(params: {
    organizationId: string;
    phoneNumberId: string;
    deploymentId: string;
    previousAssignment: { deploymentId: string } | null;
    importedElevenLabsId: string | null;
  }): Promise<boolean> {
    if (!isElevenLabsImportStagingEnabled() || !params.importedElevenLabsId) {
      return false;
    }

    try {
      await this.elevenLabs.unassignPhoneNumberFromAgent({
        organizationId: params.organizationId,
        phoneNumberId: params.phoneNumberId,
      });

      if (params.previousAssignment?.deploymentId) {
        await this.elevenLabs.assignPhoneNumberToAgent({
          organizationId: params.organizationId,
          phoneNumberId: params.phoneNumberId,
          deploymentId: params.previousAssignment.deploymentId,
        });
      }
      return true;
    } catch (rollbackErr: unknown) {
      this.logger.warn(
        `Rollback failed org=${params.organizationId} phone=${params.phoneNumberId}: ${
          rollbackErr instanceof Error ? rollbackErr.message : 'unknown'
        }`,
      );
      return false;
    }
  }

  private async findPreviousAssignmentSnapshot(organizationId: string, phoneNumberId: string) {
    const phone = await this.loadPhoneOrThrow(organizationId, phoneNumberId);
    if (!phone.voiceAssistantId) {
      return null;
    }
    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        organizationId,
        voiceAssistantId: phone.voiceAssistantId,
        archivedAt: null,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
      },
      orderBy: { version: 'desc' },
    });
    return deployment ? { deploymentId: deployment.id } : null;
  }

  private async hasAssignmentConflict(
    organizationId: string,
    phoneNumberId: string,
    deploymentId: string | null,
  ): Promise<boolean> {
    if (!deploymentId) {
      return false;
    }

    const deployment = await this.deploymentRepository.findById(organizationId, deploymentId);
    if (!deployment) {
      return true;
    }

    const conflicting = await this.prisma.voicePhoneNumber.findFirst({
      where: {
        organizationId,
        archivedAt: null,
        id: { not: phoneNumberId },
        voiceAssistantId: deployment.voiceAssistantId,
        elevenLabsImportStatus: VoiceElevenLabsImportStatus.ASSIGNED,
      },
    });

    return Boolean(conflicting);
  }

  private async resolveE164(organizationId: string, twilioPhoneSid: string | null): Promise<string> {
    if (!twilioPhoneSid?.trim()) {
      throw new ElevenLabsInvalidConfigurationError('Twilio phone SID is missing for import.');
    }

    const client = await this.twilioTenantFactory.getClientForOrganization(organizationId);
    const fetched = await client.incomingPhoneNumbers(twilioPhoneSid).fetch();
    if (!fetched.phoneNumber?.trim()) {
      throw new ElevenLabsInvalidConfigurationError('Twilio phone number E.164 could not be resolved.');
    }
    return fetched.phoneNumber;
  }

  private readCapabilities(value: unknown): { voice?: boolean } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    return value as { voice?: boolean };
  }

  private async loadDeploymentOrThrow(organizationId: string, deploymentId: string) {
    const deployment = await this.deploymentRepository.findById(organizationId, deploymentId);
    if (!deployment) {
      throw new ElevenLabsTenantIsolationViolationError(
        'Voice agent deployment not found for organization.',
      );
    }
    return deployment;
  }

  private async loadPhoneOrThrow(organizationId: string, phoneNumberId: string) {
    const phone = await this.phoneNumberRepository.findById(organizationId, phoneNumberId);
    if (!phone) {
      throw new ElevenLabsTenantIsolationViolationError(
        'Voice phone number not found for organization.',
      );
    }
    return phone;
  }

  private assertConfirmation(actor: { idempotencyKey: string; confirm?: boolean }) {
    if (!actor.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotency-key header is required.');
    }
    if (!actor.confirm) {
      throw new BadRequestException('Import and assign requires confirm=true.');
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= ELEVENLABS_IMPORT_DEFAULTS.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (err: unknown) {
        lastError = err;
        if (attempt >= ELEVENLABS_IMPORT_DEFAULTS.maxRetries) {
          break;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, ELEVENLABS_IMPORT_DEFAULTS.retryDelayMs * (attempt + 1)),
        );
      }
    }
    throw lastError;
  }

  private mapErrorClass(err: unknown): VoiceProvisioningErrorClass {
    if (err instanceof ElevenLabsInvalidConfigurationError) {
      return VoiceProvisioningErrorClass.CONFIGURATION;
    }
    if (err instanceof ElevenLabsRegionMismatchError) {
      return VoiceProvisioningErrorClass.CONFIGURATION;
    }
    if (err instanceof ElevenLabsTenantIsolationViolationError) {
      return VoiceProvisioningErrorClass.PERMISSION;
    }
    if (err instanceof ElevenLabsProviderError) {
      return VoiceProvisioningErrorClass.PROVIDER;
    }
    return VoiceProvisioningErrorClass.UNKNOWN;
  }

  private toJobView(job: {
    id: string;
    status: VoiceProvisioningJobStatus;
    currentStep: string | null;
    progressPct: number | null;
    idempotencyKey: string;
    errorClass: VoiceProvisioningErrorClass | null;
    errorMessage: string | null;
  }) {
    return {
      id: job.id,
      status: job.status,
      currentStep: job.currentStep,
      progressPct: job.progressPct,
      idempotencyKey: job.idempotencyKey,
      errorClass: job.errorClass,
      errorMessage: job.errorMessage,
    };
  }
}
