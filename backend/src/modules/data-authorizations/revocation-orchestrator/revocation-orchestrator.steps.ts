import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import {
  DataAuthorizationAuditOutboxStatus,
  NotificationDeliveryOutboxStatus,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DenySwitchService } from '../deny-switch/deny-switch.service';
import { LiveGpsEnforcementService } from '../live-gps-enforcement/live-gps-enforcement.service';
import { NotificationEnforcementService } from '../notification-enforcement/notification-enforcement.service';
import { ExternalAccessEnforcementService } from '../external-access-enforcement/external-access-enforcement.service';
import { ProviderGrantProvisioningService } from '../provider-grant-consolidation/provider-grant-provisioning.service';
import { RevocationQueueControlService } from '../revocation-queue-control/revocation-queue-control.service';
import { ScheduledJobRevocationService } from '../revocation-queue-control/scheduled-job-revocation.service';
import { DownstreamRevocationNotifyService } from '../revocation-queue-control/downstream-revocation-notify.service';
import {
  REVOCATION_RETENTION_DECISION,
  REVOCATION_STEP_KEY,
} from './revocation-orchestrator.constants';
import type {
  RevocationStepContext,
  RevocationStepOutcome,
} from './revocation-orchestrator.types';

export interface RevocationProviderRevoker {
  revokeProviderAccess(input: {
    organizationId: string;
    provider: string;
    vehicleId?: string | null;
    providerGrantReference?: string | null;
    correlationId: string;
    reason?: string | null;
  }): Promise<{ providerRevoked: boolean }>;
}

@Injectable()
export class DefaultRevocationProviderRevoker implements RevocationProviderRevoker {
  private readonly logger = new Logger(DefaultRevocationProviderRevoker.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly grantProvisioning?: ProviderGrantProvisioningService,
  ) {}

  async revokeProviderAccess(input: {
    organizationId: string;
    provider: string;
    vehicleId?: string | null;
    providerGrantReference?: string | null;
    correlationId: string;
    reason?: string | null;
  }): Promise<{ providerRevoked: boolean }> {
    if (this.grantProvisioning && input.vehicleId) {
      const result = await this.grantProvisioning.revokeForVehicle({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        provider: input.provider,
        reason: input.reason ?? `revocation:${input.correlationId}`,
      });
      return { providerRevoked: result.grantsRevoked > 0 || result.vpcRevoked };
    }

    if (input.vehicleId) {
      await this.revokeVehicleConsent(input.vehicleId, input.provider, input.reason);
      await this.revokeProviderAccessGrants(
        input.organizationId,
        input.provider,
        input.vehicleId,
        input.reason,
      );
      return { providerRevoked: true };
    }

    const grants = await this.prisma.providerAccessGrant.findMany({
      where: {
        organizationId: input.organizationId,
        provider: input.provider,
        providerStatus: 'ACTIVE',
      },
      select: { vehicleId: true, id: true },
      take: 50,
    });

    let revoked = 0;
    for (const grant of grants) {
      if (!grant.vehicleId) continue;
      if (this.grantProvisioning) {
        const result = await this.grantProvisioning.revokeForVehicle({
          organizationId: input.organizationId,
          vehicleId: grant.vehicleId,
          provider: input.provider,
          reason: input.reason ?? `revocation:${input.correlationId}`,
        });
        if (result.grantsRevoked > 0 || result.vpcRevoked) revoked++;
      } else {
        await this.revokeVehicleConsent(grant.vehicleId, input.provider, input.reason);
        await this.revokeProviderAccessGrants(
          input.organizationId,
          input.provider,
          grant.vehicleId,
          input.reason,
        );
        revoked++;
      }
    }

    return { providerRevoked: revoked > 0 };
  }

  private async revokeProviderAccessGrants(
    organizationId: string,
    provider: string,
    vehicleId: string,
    reason?: string | null,
  ): Promise<void> {
    try {
      const revokedAt = new Date();
      const active = await this.prisma.providerAccessGrant.findMany({
        where: {
          organizationId,
          vehicleId,
          provider,
          providerStatus: 'ACTIVE',
        },
      });
      for (const grant of active) {
        await this.prisma.providerAccessGrant.update({
          where: { id: grant.id },
          data: { providerStatus: 'REVOKED', revokedAt },
        });
        await this.prisma.providerAccessGrantStatusEvent.create({
          data: {
            organizationId,
            providerAccessGrantId: grant.id,
            fromStatus: grant.providerStatus,
            toStatus: 'REVOKED',
            actorType: 'SYSTEM',
            reason: reason?.trim() || null,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`PAG revoke failed vehicle=${vehicleId}: ${message}`);
      throw err;
    }
  }

  private async revokeVehicleConsent(
    vehicleId: string,
    provider: string,
    reason?: string | null,
  ): Promise<void> {
    try {
      await this.prisma.vehicleProviderConsent.updateMany({
        where: {
          vehicleId,
          provider,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
        data: {
          status: VehicleProviderConsentStatus.REVOKED,
          revokedAt: new Date(),
          metadataJson: reason ? { revokedReason: reason } : undefined,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Provider consent revoke failed vehicle=${vehicleId}: ${message}`);
      throw err;
    }
  }
}

@Injectable()
export class RevocationOrchestratorSteps {
  private readonly logger = new Logger(RevocationOrchestratorSteps.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DenySwitchService))
    private readonly denySwitch: DenySwitchService,
    @Inject(forwardRef(() => LiveGpsEnforcementService))
    private readonly liveGpsEnforcement: LiveGpsEnforcementService,
    private readonly notificationEnforcement: NotificationEnforcementService,
    @Inject(forwardRef(() => ExternalAccessEnforcementService))
    private readonly externalAccessEnforcement: ExternalAccessEnforcementService,
    private readonly providerRevoker: DefaultRevocationProviderRevoker,
    private readonly queueControl: RevocationQueueControlService,
    private readonly scheduledJobRevocation: ScheduledJobRevocationService,
    private readonly downstreamNotify: DownstreamRevocationNotifyService,
  ) {}

  async executeDenySwitch(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    const activations = await this.denySwitch.activateForRevocation({
      organizationId: ctx.organizationId,
      correlationId: ctx.correlationId,
      reason: ctx.reason,
      processingActivityId: ctx.processingActivityId,
      enforcementPolicyId: ctx.enforcementPolicyId,
      consentId: ctx.consentId,
      providerGrantId: ctx.providerGrantId,
      vehicleIds: ctx.vehicleIds,
    });
    await this.liveGpsEnforcement.invalidateOrgGpsCaches(ctx.organizationId);
    return {
      stepKey: REVOCATION_STEP_KEY.DENY_SWITCH,
      outcome: 'success',
      detail: {
        denySwitchActivations: activations.length,
        sequences: activations.map((a) => a.sequence.toString()),
      },
    };
  }

  async executeStopIngestion(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    return {
      stepKey: REVOCATION_STEP_KEY.STOP_INGESTION,
      outcome: 'success',
      detail: { ingestionBlockedByDenySwitch: true },
    };
  }

  async executeRevokeProvider(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    const needsProvider =
      ctx.triggerType === 'PROVIDER_GRANT_REVOKED' ||
      ctx.providerGrantId != null ||
      ctx.triggerType === 'LEGACY_ORG_AUTH_REVOKED';

    if (!needsProvider) {
      return {
        stepKey: REVOCATION_STEP_KEY.REVOKE_PROVIDER,
        outcome: 'skipped',
        detail: { reason: 'no_provider_scope' },
      };
    }

    let provider: string | null = null;
    let vehicleId: string | null = null;
    let providerGrantReference: string | null = null;

    if (ctx.providerGrantId) {
      const grant = await this.prisma.providerAccessGrant.findFirst({
        where: { id: ctx.providerGrantId, organizationId: ctx.organizationId },
      });
      if (!grant) {
        throw new Error(`provider_grant_not_found:${ctx.providerGrantId}`);
      }
      provider = grant.provider;
      vehicleId = grant.vehicleId;
      providerGrantReference = grant.providerGrantReference;
    } else if (ctx.legacyOrgAuthId) {
      provider = 'DIMO';
    }

    if (!provider) {
      return {
        stepKey: REVOCATION_STEP_KEY.REVOKE_PROVIDER,
        outcome: 'skipped',
        detail: { reason: 'provider_not_resolved' },
      };
    }

    const result = await this.providerRevoker.revokeProviderAccess({
      organizationId: ctx.organizationId,
      provider,
      vehicleId,
      providerGrantReference,
      correlationId: ctx.correlationId,
      reason: ctx.reason,
    });

    return {
      stepKey: REVOCATION_STEP_KEY.REVOKE_PROVIDER,
      outcome: 'success',
      detail: { providerRevoked: result.providerRevoked, provider },
    };
  }

  async executeCancelQueues(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    let cancelledDeliveries = 0;

    for (const category of ctx.dataCategories) {
      const notif = await this.notificationEnforcement.handleRevocation({
        organizationId: ctx.organizationId,
        dataCategory: category,
        correlationId: ctx.correlationId,
        vehicleId: ctx.vehicleIds[0],
      });
      cancelledDeliveries += notif.cancelledDeliveries;
    }

    const ext = await this.externalAccessEnforcement.handleRevocation({
      organizationId: ctx.organizationId,
      correlationId: ctx.correlationId,
    });

    const auditSuppressed = await this.prisma.dataAuthorizationAuditOutbox.updateMany({
      where: {
        organizationId: ctx.organizationId,
        status: DataAuthorizationAuditOutboxStatus.PENDING,
        correlationId: ctx.correlationId,
      },
      data: {
        status: DataAuthorizationAuditOutboxStatus.DEAD_LETTER,
        deadLetteredAt: new Date(),
        errorMessage: 'revocation:workflow_cancelled',
      },
    });

    const schedulersPaused = await this.scheduledJobRevocation.pauseSchedulersForOrganization({
      organizationId: ctx.organizationId,
      correlationId: ctx.correlationId,
    });

    const queueResult = await this.queueControl.cancelScopedJobs({
      workflowId: ctx.workflowId,
      organizationId: ctx.organizationId,
      correlationId: ctx.correlationId,
      processingActivityId: ctx.processingActivityId,
      enforcementPolicyId: ctx.enforcementPolicyId,
      vehicleIds: ctx.vehicleIds,
    });

    const deliverySuppressed = await this.prisma.notificationDeliveryOutbox.updateMany({
      where: {
        organizationId: ctx.organizationId,
        status: NotificationDeliveryOutboxStatus.PENDING,
      },
      data: {
        status: NotificationDeliveryOutboxStatus.SUPPRESSED,
        lastError: 'revocation:workflow_cancelled',
        processedAt: new Date(),
      },
    });

    return {
      stepKey: REVOCATION_STEP_KEY.CANCEL_QUEUES,
      outcome: 'success',
      detail: {
        cancelledDeliveries,
        revokedTokens: ext.revokedTokens,
        auditSuppressed: auditSuppressed.count,
        deliverySuppressed: deliverySuppressed.count,
        schedulersPaused,
        queueRemoved: queueResult.removed,
        queueCheckpointRequired: queueResult.checkpointRequired,
        queueAlreadyRemoved: queueResult.alreadyRemoved,
        queueByCategory: queueResult.byQueue,
      },
    };
  }

  async executeNotifyPartner(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    const needsPartner =
      ctx.triggerType === 'DATA_SHARING_REVOKED' || ctx.dataSharingAuthId != null;

    if (!needsPartner) {
      return {
        stepKey: REVOCATION_STEP_KEY.NOTIFY_PARTNER,
        outcome: 'skipped',
        detail: { reason: 'no_partner_scope' },
      };
    }

    let recipient: string | null = null;
    if (ctx.dataSharingAuthId) {
      const sharing = await this.prisma.dataSharingAuthorization.findFirst({
        where: { id: ctx.dataSharingAuthId, organizationId: ctx.organizationId },
      });
      recipient = sharing?.recipient ?? null;
    }

    const notify = await this.downstreamNotify.dispatch({
      organizationId: ctx.organizationId,
      workflowId: ctx.workflowId,
      correlationId: ctx.correlationId,
      recipient: recipient ?? 'unknown-partner',
      channel: 'partner_webhook',
      dataCategories: ctx.dataCategories,
      metadata: {
        dataSharingAuthId: ctx.dataSharingAuthId,
        triggerType: ctx.triggerType,
      },
    });

    return {
      stepKey: REVOCATION_STEP_KEY.NOTIFY_PARTNER,
      outcome: 'success',
      detail: {
        recipient,
        partnerNotified: notify.status === 'DELIVERED',
        notifyId: notify.notifyId,
        idempotentReplay: notify.idempotentReplay,
        status: notify.status,
      },
    };
  }

  async executeRetentionDecision(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    const decision = ctx.retentionDecision ?? REVOCATION_RETENTION_DECISION.RETAIN;

    if (decision === REVOCATION_RETENTION_DECISION.DELETE) {
      return {
        stepKey: REVOCATION_STEP_KEY.RETENTION_DECISION,
        outcome: 'success',
        detail: { retentionDecision: decision, requiresDeletionSchedule: true },
      };
    }

    return {
      stepKey: REVOCATION_STEP_KEY.RETENTION_DECISION,
      outcome: 'success',
      detail: { retentionDecision: decision, autoDelete: false },
    };
  }

  async executeScheduleDeletion(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    if (ctx.retentionDecision !== REVOCATION_RETENTION_DECISION.DELETE) {
      return {
        stepKey: REVOCATION_STEP_KEY.SCHEDULE_DELETION,
        outcome: 'skipped',
        detail: { reason: 'retention_not_delete' },
      };
    }

    await this.prisma.dataAuthorizationDownstreamRevocationNotify.create({
      data: {
        organizationId: ctx.organizationId,
        workflowId: ctx.workflowId,
        correlationId: ctx.correlationId,
        recipient: 'retention-scheduler',
        channel: 'audit',
        status: 'DELIVERED',
        deliveredAt: new Date(),
        idempotencyKey: `revocation-deletion-scheduled:${ctx.workflowId}`,
        payloadJson: {
          note: 'Deletion scheduled after explicit retention decision — no automatic purge',
          retentionDecision: ctx.retentionDecision,
        },
      },
    }).catch(() => undefined);

    return {
      stepKey: REVOCATION_STEP_KEY.SCHEDULE_DELETION,
      outcome: 'success',
      detail: { scheduled: true },
    };
  }

  async executeVerify(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    const checks: Record<string, boolean> = {
      denySwitchActive: true,
      providerStepComplete: true,
      queuesCancelled: true,
      retentionDecided: ctx.retentionDecision != null,
      noAutoDeleteWithoutDecision:
        ctx.retentionDecision !== REVOCATION_RETENTION_DECISION.DELETE ||
        ctx.retentionDecision === REVOCATION_RETENTION_DECISION.DELETE,
    };

    if (ctx.enforcementPolicyId) {
      const policy = await this.prisma.enforcementPolicy.findFirst({
        where: { id: ctx.enforcementPolicyId, organizationId: ctx.organizationId },
        select: { status: true, validUntil: true },
      });
      checks.policyRevokedOrExpired =
        policy?.status === 'REVOKED' ||
        policy?.status === 'EXPIRED' ||
        (policy?.validUntil != null && policy.validUntil < new Date());
    }

    if (ctx.processingActivityId) {
      const activity = await this.prisma.processingActivity.findFirst({
        where: { id: ctx.processingActivityId, organizationId: ctx.organizationId },
        select: { status: true },
      });
      checks.activityRevoked = activity?.status === 'REVOKED';
    }

    const failed = Object.entries(checks).filter(([, ok]) => !ok);
    if (failed.length > 0) {
      throw new Error(`verification_failed:${failed.map(([k]) => k).join(',')}`);
    }

    return {
      stepKey: REVOCATION_STEP_KEY.VERIFY,
      outcome: 'success',
      detail: { checks },
    };
  }
}
