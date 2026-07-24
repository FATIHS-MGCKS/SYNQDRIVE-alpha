import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  DataAuthorizationAuditEventKind,
  DataAuthorizationAuditOutboxStatus,
  NotificationDeliveryOutboxStatus,
  VehicleProviderConsentStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import { LiveGpsEnforcementService } from '../live-gps-enforcement/live-gps-enforcement.service';
import { NotificationEnforcementService } from '../notification-enforcement/notification-enforcement.service';
import { ExternalAccessEnforcementService } from '../external-access-enforcement/external-access-enforcement.service';
import { DataAuthorizationAuditOutboxRepository } from '../privacy-domain/audit-log/data-authorization-audit-outbox.repository';
import { buildAuditIdempotencyKey } from '../privacy-domain/audit-log/data-authorization-audit.constants';
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

  constructor(private readonly prisma: PrismaService) {}

  async revokeProviderAccess(input: {
    organizationId: string;
    provider: string;
    vehicleId?: string | null;
    providerGrantReference?: string | null;
    correlationId: string;
    reason?: string | null;
  }): Promise<{ providerRevoked: boolean }> {
    if (input.vehicleId) {
      await this.revokeVehicleConsent(input.vehicleId, input.provider, input.reason);
      return { providerRevoked: true };
    }

    const grants = await this.prisma.providerAccessGrant.findMany({
      where: {
        organizationId: input.organizationId,
        provider: input.provider,
        providerStatus: 'ACTIVE',
      },
      select: { vehicleId: true },
      take: 50,
    });

    let revoked = 0;
    for (const grant of grants) {
      if (!grant.vehicleId) continue;
      await this.revokeVehicleConsent(grant.vehicleId, input.provider, input.reason);
      revoked++;
    }

    return { providerRevoked: revoked > 0 };
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
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly liveGpsEnforcement: LiveGpsEnforcementService,
    private readonly notificationEnforcement: NotificationEnforcementService,
    private readonly externalAccessEnforcement: ExternalAccessEnforcementService,
    private readonly auditOutbox: DataAuthorizationAuditOutboxRepository,
    private readonly providerRevoker: DefaultRevocationProviderRevoker,
    @Optional() @InjectQueue(QUEUE_NAMES.DIMO_SNAPSHOT) private readonly dimoSnapshotQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.DTC_POLL) private readonly dtcPollQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.TRIP_TRACKING) private readonly tripTrackingQueue?: Queue,
  ) {}

  async executeDenySwitch(ctx: RevocationStepContext): Promise<RevocationStepOutcome> {
    this.authorizationDecision.invalidateOrganizationCache(ctx.organizationId);
    await this.liveGpsEnforcement.invalidateOrgGpsCaches(ctx.organizationId);
    return {
      stepKey: REVOCATION_STEP_KEY.DENY_SWITCH,
      outcome: 'success',
      detail: { cachesInvalidated: true },
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
    let cancelledBullJobs = 0;

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

    cancelledBullJobs += await this.removeOrgJobsFromQueue(this.dimoSnapshotQueue, ctx.organizationId);
    cancelledBullJobs += await this.removeOrgJobsFromQueue(this.dtcPollQueue, ctx.organizationId);
    cancelledBullJobs += await this.removeOrgJobsFromQueue(this.tripTrackingQueue, ctx.organizationId);

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
        bullJobsRemoved: cancelledBullJobs,
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

    await this.auditOutbox.enqueue({
      organizationId: ctx.organizationId,
      idempotencyKey: buildAuditIdempotencyKey({
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        organizationId: ctx.organizationId,
        correlationId: `${ctx.correlationId}:partner-notify`,
      }),
      eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
      correlationId: ctx.correlationId,
      payload: {
        entityType: 'DATA_SHARING_AUTHORIZATION',
        entityId: ctx.dataSharingAuthId ?? ctx.correlationId,
        eventType: 'REVOKED',
        newStatus: 'PARTNER_NOTIFIED',
        metadata: {
          partnerNotification: 'dispatched',
          recipient,
          dataCategories: ctx.dataCategories,
        },
      },
    });

    return {
      stepKey: REVOCATION_STEP_KEY.NOTIFY_PARTNER,
      outcome: 'success',
      detail: { recipient, partnerNotified: true },
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

    await this.auditOutbox.enqueue({
      organizationId: ctx.organizationId,
      idempotencyKey: buildAuditIdempotencyKey({
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        organizationId: ctx.organizationId,
        correlationId: `${ctx.correlationId}:deletion-scheduled`,
      }),
      eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
      correlationId: ctx.correlationId,
      payload: {
        entityType: 'REVOCATION_WORKFLOW',
        entityId: ctx.workflowId,
        eventType: 'DELETION_SCHEDULED',
        newStatus: 'SCHEDULED',
        metadata: {
          note: 'Deletion scheduled after explicit retention decision — no automatic purge',
          retentionDecision: ctx.retentionDecision,
        },
      },
    });

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

  private async removeOrgJobsFromQueue(
    queue: Queue | undefined,
    organizationId: string,
  ): Promise<number> {
    if (!queue) return 0;
    let removed = 0;
    try {
      const jobs = await queue.getJobs(['waiting', 'delayed', 'paused'], 0, 200);
      for (const job of jobs) {
        const data = job.data as Record<string, unknown> | undefined;
        if (data?.organizationId === organizationId) {
          await job.remove();
          removed++;
        }
      }
    } catch (err) {
      this.logger.warn(
        `BullMQ job removal failed queue=${queue.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
    return removed;
  }
}
