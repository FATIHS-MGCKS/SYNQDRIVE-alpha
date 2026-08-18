import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import {
  Notification,
  NotificationEventKind,
  NotificationSeverity,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { NotificationEngineConfig } from './notification-engine.config';
import {
  ACTIVE_NOTIFICATION_STATUSES,
  NotificationRepository,
  NotificationTx,
} from './notification.repository';
import { fingerprintFromCandidate, validateNotificationCandidate } from './notification-candidate.validator';
import {
  isRegisteredEventType,
  validateRegistryCandidate,
} from './registry/notification-event-registry.validator';
import { getEventTypeDefinition } from './registry/notification-event-registry';
import { sanitizeTemplateParams } from './notification-template-params.validator';
import { evaluateReopenDecision } from './notification-reopen.policy';
import {
  assertNotificationStatusTransition,
  NotificationStatusTransitionError,
} from './notification-status.transitions';
import { escalateSeverity, isRecoverySeverity } from './notification-severity.policy';
import {
  mergeTemplateParams,
  shouldRefreshTemplateParams,
} from './notification-template-params';
import { withUniqueConflictRetry } from './notification-prisma.util';
import type { NotificationCandidate } from './notification.types';
import type {
  IngestCandidateOptions,
  IngestCandidateResult,
  MaterializeResult,
  NotificationCounts,
  ResolveByFingerprintOptions,
} from './notification-core.types';
import { NotificationSeverity as DomainSeverity, NotificationStatus as DomainStatus } from './notification.enums';
import { NotificationSourceType as DomainSourceType } from './notification.enums';
import { recordNotificationIngestOperation, recordNotificationFailure } from './runtime/notification-run-context';
import { isManualResolutionAllowed } from './api/notification-manual-resolution.policy';
import { NotificationDeliveryEnqueueService } from './delivery/notification-delivery-enqueue.service';
import { NotificationDeliveryPolicyService } from './delivery/notification-delivery-policy.service';
import { NotificationDeliverySchedulerService } from './delivery/notification-delivery-scheduler.service';
import { NotificationLifecycleWorkflowEmitter } from './workflow/notification-lifecycle-workflow.emitter';
import {
  resolveWorkflowTriggerNotificationId,
  shouldSuppressWorkflowNotificationLoop,
} from './workflow/notification-workflow-loop.guard';
import type { NotificationLifecycleEventType } from '@modules/workflows/workflow.constants';
import {
  minimizeActionTarget,
  minimizeOccurrencePayload,
  minimizeTemplateParams,
} from './compliance/notification-data-minimization';
import { NotificationRetentionService } from './compliance/notification-retention.service';
import { NotificationAuditService } from './audit/notification-audit.service';
import { snapshotFromNotification } from './audit/notification-audit-sanitize.util';
import { NotificationIngestObservabilityService } from './observability/notification-ingest-observability.service';
import type { NotificationIngestOperation } from './observability/notification-prometheus.metrics';

@Injectable()
export class NotificationCoreService {
  private readonly logger = new Logger(NotificationCoreService.name);

  constructor(
    private readonly repository: NotificationRepository,
    private readonly engineConfig: NotificationEngineConfig,
    private readonly deliveryEnqueue: NotificationDeliveryEnqueueService,
    private readonly deliveryPolicy: NotificationDeliveryPolicyService,
    private readonly deliveryScheduler: NotificationDeliverySchedulerService,
    @Optional() private readonly lifecycleWorkflowEmitter?: NotificationLifecycleWorkflowEmitter,
    @Optional() private readonly retentionService?: NotificationRetentionService,
    @Optional() private readonly notificationAudit?: NotificationAuditService,
    @Optional() private readonly ingestObservability?: NotificationIngestObservabilityService,
  ) {}

  isEnabled(organizationId?: string | null): boolean {
    return this.engineConfig.isV2EnabledForOrg(organizationId);
  }

  async ingestCandidate(
    candidate: NotificationCandidate,
    options: IngestCandidateOptions = {},
  ): Promise<IngestCandidateResult> {
    if (!this.isEnabled(candidate.organizationId)) {
      this.logOperation('skipped_flag_off', candidate, { runId: options.runId });
      recordNotificationIngestOperation('skipped_flag_off');
      return { enabled: false, operation: 'skipped_flag_off' };
    }

    try {
      const result = await this.createOrUpdateNotification(candidate, options);
      return { enabled: true, ...result };
    } catch (err) {
      recordNotificationFailure();
      this.ingestObservability?.recordIngestFailure({
        organizationId: candidate.organizationId,
        eventType: candidate.eventType,
        errorCode: err instanceof Error ? err.name : 'INGEST_ERROR',
        correlationId: options.runId,
      });
      throw err;
    }
  }

  async createOrUpdateNotification(
    candidate: NotificationCandidate,
    options: IngestCandidateOptions = {},
  ): Promise<MaterializeResult> {
    let normalized = validateNotificationCandidate(candidate);
    if (isRegisteredEventType(normalized.eventType)) {
      const def = getEventTypeDefinition(normalized.eventType)!;
      normalized = {
        ...normalized,
        templateParams: sanitizeTemplateParams(
          normalized.templateParams,
          def.allowedTemplateParams,
        ),
      };
      normalized = validateRegistryCandidate(normalized);
    }
    const { canonical: fingerprint } = fingerprintFromCandidate(normalized);
    const referenceNow = options.referenceNow ?? new Date();

    const loopTriggerId = resolveWorkflowTriggerNotificationId(normalized, options);
    if (loopTriggerId) {
      const triggerNotification = await this.repository.findById(
        loopTriggerId,
        normalized.organizationId,
      );
      if (
        shouldSuppressWorkflowNotificationLoop(normalized, options, triggerNotification)
      ) {
        this.logOperation('ignored', normalized, {
          notificationId: triggerNotification!.id,
          fingerprint,
          reason: 'WORKFLOW_LOOP_GUARD',
          runId: options.runId,
        });
        this.recordAuditEvent({
          organizationId: normalized.organizationId,
          notificationId: triggerNotification!.id,
          eventType: 'INGEST_IGNORED',
          actorType: options.auditActorType ?? 'SYSTEM',
          actorUserId: options.auditActorUserId,
          reasonCode: 'WORKFLOW_LOOP_GUARD',
          correlationId: options.runId,
          clientMeta: options.auditClientMeta,
          nextState: snapshotFromNotification(triggerNotification!),
        });
        recordNotificationIngestOperation('ignored');
        return {
          operation: 'ignored',
          notification: triggerNotification!,
          reason: 'WORKFLOW_LOOP_GUARD',
        };
      }
    }

    if (isRecoverySeverity(normalized.severity as unknown as DomainSeverity)) {
      return this.handleRecoveryCandidate(normalized, fingerprint, referenceNow, options);
    }

    return withUniqueConflictRetry(async (): Promise<MaterializeResult> => {
      const pendingOutboxIds: string[] = [];
      let severityBefore: NotificationSeverity | undefined;
      const result = await this.repository.runTransaction(async (tx) => {
        const active = await this.repository.findAnyActiveByFingerprint(
          normalized.organizationId,
          fingerprint,
          tx,
        );

        if (active) {
          severityBefore = active.severity;
          const updated = await this.updateActiveFromCandidate(active, normalized, tx);
          const transition = this.deliveryPolicy.shouldEnqueueForIngestOperation(
            'updated',
            updated,
            severityBefore,
          );
          if (transition) {
            const ids = await this.deliveryEnqueue.enqueueInTransaction(
              { notification: updated, transition, severityBefore },
              tx,
            );
            pendingOutboxIds.push(...ids);
          }
          this.logOperation('updated', normalized, {
            notificationId: updated.id,
            fingerprint,
            occurrenceCount: updated.occurrenceCount,
            runId: options.runId,
          });
          return { operation: 'updated' as const, notification: updated };
        }

        const latest = await this.repository.findLatestByFingerprint(
          normalized.organizationId,
          fingerprint,
          tx,
        );

        if (latest?.status === NotificationStatus.ARCHIVED) {
          this.logOperation('ignored', normalized, {
            notificationId: latest.id,
            fingerprint,
            reason: 'ARCHIVED',
            runId: options.runId,
          });
          return { operation: 'ignored' as const, notification: latest, reason: 'ARCHIVED' };
        }

        if (latest?.status === NotificationStatus.RESOLVED) {
          const reopen = evaluateReopenDecision({
            existing: {
              id: latest.id,
              status: latest.status as unknown as import('./notification.enums').NotificationStatus,
              resolvedAt: latest.resolvedAt,
              reopenCount: latest.reopenCount,
              generation: latest.lifecycleGeneration,
            },
            occurrence: {
              organizationId: normalized.organizationId,
              fingerprint: { parts: fingerprintFromCandidate(normalized).parts, canonical: fingerprint },
              occurredAt: normalized.occurredAt,
              severity: normalized.severity as unknown as DomainSeverity,
              sourceType: normalized.sourceType as unknown as import('./notification.enums').NotificationSourceType,
              sourceRef: normalized.sourceRef,
              metadata: normalized.metadata,
            },
            policy: normalized.resolutionPolicy,
            referenceNow,
          });

          if (reopen.action === 'IGNORE') {
            this.logOperation('ignored', normalized, {
              notificationId: latest.id,
              fingerprint,
              reason: reopen.reason,
              runId: options.runId,
            });
            return { operation: 'ignored' as const, notification: latest, reason: reopen.reason };
          }

          if (reopen.action === 'REOPEN') {
            const reopened = await this.reopenNotificationInternal(
              latest,
              normalized,
              reopen.reopenCount,
              tx,
            );
            const ids = await this.deliveryEnqueue.enqueueInTransaction(
              { notification: reopened, transition: 'REOPENED' },
              tx,
            );
            pendingOutboxIds.push(...ids);
            this.logOperation('reopened', normalized, {
              notificationId: reopened.id,
              fingerprint,
              occurrenceCount: reopened.occurrenceCount,
              runId: options.runId,
            });
            return { operation: 'reopened' as const, notification: reopened };
          }

          if (reopen.action === 'CREATE') {
            const created = await this.createNotificationWithOccurrence(
              normalized,
              fingerprint,
              reopen.generation,
              tx,
            );
            const ids = await this.deliveryEnqueue.enqueueInTransaction(
              { notification: created, transition: 'OPEN_CREATED' },
              tx,
            );
            pendingOutboxIds.push(...ids);
            this.logOperation('created', normalized, {
              notificationId: created.id,
              fingerprint,
              occurrenceCount: created.occurrenceCount,
              runId: options.runId,
            });
            return { operation: 'created' as const, notification: created };
          }
        }

        const generation = latest ? latest.lifecycleGeneration + 1 : 1;
        const created = await this.createNotificationWithOccurrence(
          normalized,
          fingerprint,
          generation,
          tx,
        );
        const ids = await this.deliveryEnqueue.enqueueInTransaction(
          { notification: created, transition: 'OPEN_CREATED' },
          tx,
        );
        pendingOutboxIds.push(...ids);
        this.logOperation('created', normalized, {
          notificationId: created.id,
          fingerprint,
          occurrenceCount: created.occurrenceCount,
          runId: options.runId,
        });
        return { operation: 'created' as const, notification: created };
      });

      await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);
      this.emitLifecycleForMaterialize(result, severityBefore, options);
      this.recordMaterializeAudit(result, severityBefore, options);
      return result;
    });
  }

  async appendOccurrence(notificationId: string, candidate: NotificationCandidate) {
    const normalized = validateNotificationCandidate(candidate);
    const notification = await this.requireNotification(notificationId, normalized.organizationId);

    return this.repository.runTransaction(async (tx) => {
      await this.repository.createOccurrence(
        {
          notificationId,
          organizationId: normalized.organizationId,
          occurredAt: normalized.occurredAt,
          sourceType: normalized.sourceType,
          sourceRef: normalized.sourceRef,
          severityAtOccurrence: normalized.severity,
          payload: normalized.metadata as Prisma.InputJsonValue,
        },
        tx,
      );
      return this.repository.updateNotification(
        notificationId,
        {
          lastSeenAt: normalized.occurredAt,
          occurrenceCount: notification.occurrenceCount + 1,
        },
        notification.version,
        tx,
      );
    });
  }

  async resolveNotificationByFingerprint(options: ResolveByFingerprintOptions) {
    const { organizationId, fingerprint, resolvedAt, lifecycleGeneration } = options;
    const row = lifecycleGeneration != null
      ? await this.repository.findByFingerprintAndGeneration(organizationId, fingerprint, lifecycleGeneration)
      : await this.repository.findAnyActiveByFingerprint(organizationId, fingerprint);

    if (!row) {
      throw new NotFoundException('No notification found for fingerprint');
    }

    return this.resolveNotification(row.id, organizationId, resolvedAt ?? new Date());
  }

  async resolveNotification(
    notificationId: string,
    organizationId: string,
    resolvedAt: Date = new Date(),
    context: { manual?: boolean; eventKind?: NotificationEventKind } = {},
    options: IngestCandidateOptions = {},
  ) {
    const notification = await this.requireNotification(notificationId, organizationId);

    if (context.manual) {
      const allowed =
        this.isManualResolutionAllowedForNotification(notification.eventType, notification.eventKind);
      if (!allowed) {
        throw new BadRequestException('Manual resolution not allowed for this event type');
      }
    }

    this.assertTransition(notification.status, NotificationStatus.RESOLVED);

    const pendingOutboxIds: string[] = [];
    const retentionMeta = this.retentionService?.applyRetentionMetadataOnResolve({
      domain: notification.domain,
      eventType: notification.eventType,
      status: NotificationStatus.RESOLVED,
      resolvedAt,
    });
    const updated = await this.repository.runTransaction(async (tx) => {
      const row = await this.repository.updateNotification(
        notificationId,
        {
          status: NotificationStatus.RESOLVED,
          resolvedAt,
          snoozedUntil: null,
          acknowledgedAt: notification.acknowledgedAt,
          ...(retentionMeta ?? {}),
        },
        notification.version,
        tx,
      );
      const transition = this.deliveryPolicy.shouldEnqueueForLifecycleTransition(
        notification.status,
        NotificationStatus.RESOLVED,
        row,
      );
      if (transition) {
        const ids = await this.deliveryEnqueue.enqueueInTransaction(
          { notification: row, transition },
          tx,
        );
        pendingOutboxIds.push(...ids);
      }
      return row;
    });

    await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);

    this.emitLifecycleEvent('notification.resolved', updated, resolvedAt, options);

    this.recordAuditEvent({
      organizationId,
      notificationId: updated.id,
      eventType: 'RESOLVED',
      actorType: context.manual
        ? (options.auditActorType ?? 'USER')
        : (options.auditActorType ?? 'SYSTEM'),
      actorUserId: options.auditActorUserId,
      previousState: snapshotFromNotification(notification),
      nextState: snapshotFromNotification(updated),
      reasonCode: context.manual ? 'MANUAL_RESOLVE' : 'AUTO_RESOLVE',
      correlationId: options.runId,
      clientMeta: options.auditClientMeta,
    });

    this.logger.log({
      msg: 'notification.resolved',
      organizationId,
      notificationId,
      fingerprint: notification.fingerprint,
      operation: 'resolved',
      resolvedAt: resolvedAt.toISOString(),
    });

    return updated;
  }

  async reopenNotification(notificationId: string, organizationId: string, candidate?: NotificationCandidate) {
    const notification = await this.requireNotification(notificationId, organizationId);
    if (notification.status !== NotificationStatus.RESOLVED) {
      throw new BadRequestException('Only resolved notifications can be reopened');
    }
    if (!candidate) {
      throw new BadRequestException('Candidate required to reopen with occurrence');
    }
    const normalized = validateNotificationCandidate(candidate);
    const pendingOutboxIds: string[] = [];
    const reopened = await this.repository.runTransaction(async (tx) => {
      const row = await this.reopenNotificationInternal(
        notification,
        normalized,
        notification.reopenCount + 1,
        tx,
      );
      const ids = await this.deliveryEnqueue.enqueueInTransaction(
        { notification: row, transition: 'REOPENED' },
        tx,
      );
      pendingOutboxIds.push(...ids);
      return row;
    });
    await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);
    this.emitLifecycleEvent('notification.reopened', reopened, normalized.occurredAt);
    this.recordAuditEvent({
      organizationId,
      notificationId: reopened.id,
      eventType: 'REOPENED',
      actorType: 'SYSTEM',
      previousState: snapshotFromNotification(notification),
      nextState: snapshotFromNotification(reopened),
      reasonCode: 'INGEST_REOPEN',
    });
    return reopened;
  }

  async acknowledgeNotification(notificationId: string, organizationId: string, at: Date = new Date()) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.ACKNOWLEDGED);

    const pendingOutboxIds: string[] = [];
    const updated = await this.repository.runTransaction(async (tx) => {
      const row = await this.repository.updateNotification(
        notificationId,
        { status: NotificationStatus.ACKNOWLEDGED, acknowledgedAt: at },
        notification.version,
        tx,
      );
      const transition = this.deliveryPolicy.shouldEnqueueForLifecycleTransition(
        notification.status,
        NotificationStatus.ACKNOWLEDGED,
        row,
      );
      if (transition) {
        const ids = await this.deliveryEnqueue.enqueueInTransaction(
          { notification: row, transition },
          tx,
        );
        pendingOutboxIds.push(...ids);
      }
      return row;
    });
    await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);
    this.emitLifecycleEvent('notification.acknowledged', updated, at);
    this.recordAuditEvent({
      organizationId,
      notificationId: updated.id,
      eventType: 'ACKNOWLEDGED',
      actorType: 'USER',
      previousState: snapshotFromNotification(notification),
      nextState: snapshotFromNotification(updated),
      reasonCode: 'ORG_WIDE_ACK',
    });
    return updated;
  }

  async snoozeNotification(notificationId: string, organizationId: string, until: Date) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.SNOOZED);

    const updated = await this.repository.updateNotification(
      notificationId,
      { status: NotificationStatus.SNOOZED, snoozedUntil: until },
      notification.version,
    );
    this.recordAuditEvent({
      organizationId,
      notificationId: updated.id,
      eventType: 'SNOOZED',
      actorType: 'USER',
      previousState: snapshotFromNotification(notification),
      nextState: { ...snapshotFromNotification(updated), scope: 'org_wide' },
      reasonCode: 'ORG_WIDE_SNOOZE',
    });
    return updated;
  }

  async unsnoozeNotification(notificationId: string, organizationId: string) {
    const notification = await this.requireNotification(notificationId, organizationId);
    if (notification.status !== NotificationStatus.SNOOZED) {
      throw new BadRequestException('Notification is not snoozed');
    }
    this.assertTransition(notification.status, NotificationStatus.OPEN);

    const updated = await this.repository.updateNotification(
      notificationId,
      { status: NotificationStatus.OPEN, snoozedUntil: null },
      notification.version,
    );
    this.recordAuditEvent({
      organizationId,
      notificationId: updated.id,
      eventType: 'UNSNOOZED',
      actorType: 'USER',
      previousState: snapshotFromNotification(notification),
      nextState: snapshotFromNotification(updated),
      reasonCode: 'ORG_WIDE_UNSNOOZE',
    });
    return updated;
  }

  async archiveNotification(
    notificationId: string,
    organizationId: string,
    at: Date = new Date(),
    options: IngestCandidateOptions = {},
  ) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.ARCHIVED, { administrativeArchive: true });

    const updated = await this.repository.updateNotification(
      notificationId,
      { status: NotificationStatus.ARCHIVED, archivedAt: at },
      notification.version,
    );
    this.recordAuditEvent({
      organizationId,
      notificationId: updated.id,
      eventType: 'ARCHIVED',
      actorType: options.auditActorType ?? 'USER',
      actorUserId: options.auditActorUserId,
      previousState: snapshotFromNotification(notification),
      nextState: snapshotFromNotification(updated),
      reasonCode: 'ADMIN_ARCHIVE',
      correlationId: options.runId,
      clientMeta: options.auditClientMeta,
    });
    return updated;
  }

  async markRead(notificationId: string, organizationId: string, userId: string, at: Date = new Date()) {
    await this.requireNotification(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      readAt: at,
    });
  }

  async markUnread(notificationId: string, organizationId: string, userId: string) {
    await this.requireNotification(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      readAt: null,
    });
  }

  async getNotification(notificationId: string, organizationId: string) {
    const row = await this.repository.findById(notificationId, organizationId);
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  async listNotifications(filter: Parameters<NotificationRepository['listNotifications']>[0]) {
    return this.repository.listNotifications(filter);
  }

  async getCounts(organizationId: string, userId?: string): Promise<NotificationCounts> {
    const active = await this.repository.countNotifications(organizationId, ACTIVE_NOTIFICATION_STATUSES);
    const severityGroups = await this.repository.countBySeverity(organizationId, ACTIVE_NOTIFICATION_STATUSES);
    const bySeverity: Record<string, number> = {};
    for (const group of severityGroups) {
      bySeverity[group.severity] = group._count._all;
    }

    const counts: NotificationCounts = { active, bySeverity };
    if (userId) {
      counts.unreadForUser = await this.repository.countUnreadForUser(organizationId, userId);
    }
    return counts;
  }

  async expireOrganizationNotifications(organizationId: string, referenceNow: Date = new Date()) {
    return this.repository.expireNotifications(organizationId, referenceNow);
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async handleRecoveryCandidate(
    candidate: NotificationCandidate,
    fingerprint: string,
    resolvedAt: Date,
    options: IngestCandidateOptions,
  ): Promise<MaterializeResult> {
    const active = await this.repository.findAnyActiveByFingerprint(
      candidate.organizationId,
      fingerprint,
    );

    if (!active) {
      const latest = await this.repository.findLatestByFingerprint(candidate.organizationId, fingerprint);
      if (latest?.status === NotificationStatus.RESOLVED) {
        this.logOperation('ignored', candidate, {
          notificationId: latest.id,
          fingerprint,
          reason: 'ALREADY_RESOLVED',
          runId: options.runId,
        });
        return { operation: 'ignored', notification: latest, reason: 'ALREADY_RESOLVED' };
      }
      this.logOperation('ignored', candidate, { fingerprint, reason: 'NO_ACTIVE_FOR_RECOVERY', runId: options.runId });
      throw new NotFoundException('No active notification to resolve for recovery');
    }

    const pendingOutboxIds: string[] = [];
    const resolved = await this.repository.runTransaction(async (tx) => {
      const row = await this.repository.updateNotification(
        active.id,
        {
          status: NotificationStatus.RESOLVED,
          resolvedAt,
          snoozedUntil: null,
          acknowledgedAt: active.acknowledgedAt,
        },
        active.version,
        tx,
      );
      await this.repository.createOccurrence(
        {
          notificationId: row.id,
          organizationId: candidate.organizationId,
          occurredAt: candidate.occurredAt,
          sourceType: candidate.sourceType,
          sourceRef: candidate.sourceRef,
          severityAtOccurrence: candidate.severity,
          payload: minimizeOccurrencePayload({
          recovery: true,
          ...(candidate.metadata ?? {}),
        }) as Prisma.InputJsonValue,
        },
        tx,
      );
      const transition = this.deliveryPolicy.shouldEnqueueForIngestOperation('resolved', row);
      if (transition) {
        const ids = await this.deliveryEnqueue.enqueueInTransaction(
          { notification: row, transition },
          tx,
        );
        pendingOutboxIds.push(...ids);
      }
      return row;
    });
    await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);

    this.logOperation('resolved', candidate, {
      notificationId: resolved.id,
      fingerprint,
      operation: 'resolved',
      runId: options.runId,
    });

    this.emitLifecycleEvent('notification.resolved', resolved, resolvedAt, options);

    this.recordAuditEvent({
      organizationId: candidate.organizationId,
      notificationId: resolved.id,
      eventType: 'RESOLVED',
      actorType: options.auditActorType ?? 'SYSTEM',
      actorUserId: options.auditActorUserId,
      previousState: snapshotFromNotification(active),
      nextState: snapshotFromNotification(resolved),
      reasonCode: 'RECOVERY_RESOLVE',
      correlationId: options.runId,
    });

    return { operation: 'resolved', notification: resolved };
  }

  private async createNotificationWithOccurrence(
    candidate: NotificationCandidate,
    fingerprint: string,
    lifecycleGeneration: number,
    tx: NotificationTx,
  ): Promise<Notification> {
    const minimizedParams = minimizeTemplateParams(candidate.templateParams);
    const minimizedTarget = minimizeActionTarget(
      candidate.actionTarget as unknown as Record<string, unknown>,
    );
    const minimizedMetadata = minimizeOccurrencePayload(candidate.metadata);

    const notification = await this.repository.createNotification(
      {
        organizationId: candidate.organizationId,
        fingerprint,
        lifecycleGeneration,
        eventType: candidate.eventType,
        eventKind: candidate.eventKind,
        conditionCode: candidate.conditionCode,
        domain: candidate.domain,
        severity: candidate.severity,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        titleKey: candidate.titleKey,
        bodyKey: candidate.bodyKey,
        templateParams: minimizedParams as Prisma.InputJsonValue,
        actionType: candidate.actionType,
        actionTarget: minimizedTarget as Prisma.InputJsonValue,
        sourceType: candidate.sourceType,
        primarySourceRef: candidate.sourceRef,
        firstSeenAt: candidate.occurredAt,
        lastSeenAt: candidate.occurredAt,
        expiresAt: candidate.expiresAt ?? null,
      },
      tx,
    );

    await this.repository.createOccurrence(
      {
        notificationId: notification.id,
        organizationId: candidate.organizationId,
        occurredAt: candidate.occurredAt,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        severityAtOccurrence: candidate.severity,
        payload: minimizedMetadata as Prisma.InputJsonValue,
      },
      tx,
    );

    return notification;
  }

  private async updateActiveFromCandidate(
    existing: Notification,
    candidate: NotificationCandidate,
    tx: NotificationTx,
  ): Promise<Notification> {
    const newSeverity = escalateSeverity(
      existing.severity as unknown as DomainSeverity,
      candidate.severity,
    ) as NotificationSeverity;
    const templateParams = shouldRefreshTemplateParams(existing.lastSeenAt, candidate.occurredAt)
      ? minimizeTemplateParams(
          mergeTemplateParams(
            (existing.templateParams ?? {}) as Record<string, string | number | boolean | null>,
            candidate.templateParams,
          ),
        )
      : (existing.templateParams as Prisma.InputJsonValue);
    const minimizedMetadata = minimizeOccurrencePayload(candidate.metadata);

    await this.repository.createOccurrence(
      {
        notificationId: existing.id,
        organizationId: candidate.organizationId,
        occurredAt: candidate.occurredAt,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        severityAtOccurrence: candidate.severity,
        payload: minimizedMetadata as Prisma.InputJsonValue,
      },
      tx,
    );

    const occurredAt = candidate.occurredAt;
    const firstSeenAt =
      occurredAt < existing.firstSeenAt ? occurredAt : existing.firstSeenAt;
    const lastSeenAt =
      occurredAt > existing.lastSeenAt ? occurredAt : existing.lastSeenAt;

    return this.repository.updateNotification(
      existing.id,
      {
        severity: newSeverity,
        firstSeenAt,
        lastSeenAt,
        occurrenceCount: existing.occurrenceCount + 1,
        templateParams: templateParams as Prisma.InputJsonValue,
        titleKey: candidate.titleKey,
        bodyKey: candidate.bodyKey,
        primarySourceRef: candidate.sourceRef,
        expiresAt: candidate.expiresAt ?? existing.expiresAt,
      },
      existing.version,
      tx,
    );
  }

  private async reopenNotificationInternal(
    existing: Notification,
    candidate: NotificationCandidate,
    reopenCount: number,
    tx: NotificationTx,
  ): Promise<Notification> {
    const minimizedMetadata = minimizeOccurrencePayload(candidate.metadata);

    await this.repository.createOccurrence(
      {
        notificationId: existing.id,
        organizationId: candidate.organizationId,
        occurredAt: candidate.occurredAt,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        severityAtOccurrence: candidate.severity,
        payload: minimizedMetadata as Prisma.InputJsonValue,
      },
      tx,
    );

    const occurredAt = candidate.occurredAt;
    const firstSeenAt =
      occurredAt < existing.firstSeenAt ? occurredAt : existing.firstSeenAt;
    const lastSeenAt =
      occurredAt > existing.lastSeenAt ? occurredAt : existing.lastSeenAt;

    return this.repository.updateNotification(
      existing.id,
      {
        status: NotificationStatus.OPEN,
        severity: escalateSeverity(
          existing.severity as unknown as DomainSeverity,
          candidate.severity,
        ) as NotificationSeverity,
        resolvedAt: null,
        reopenCount,
        firstSeenAt,
        lastSeenAt,
        occurrenceCount: existing.occurrenceCount + 1,
        templateParams: minimizeTemplateParams(candidate.templateParams) as Prisma.InputJsonValue,
        titleKey: candidate.titleKey,
        bodyKey: candidate.bodyKey,
        primarySourceRef: candidate.sourceRef,
      },
      existing.version,
      tx,
    );
  }

  private async requireNotification(notificationId: string, organizationId: string) {
    const row = await this.repository.findById(notificationId, organizationId);
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  private assertTransition(
    from: NotificationStatus,
    to: NotificationStatus,
    context: { administrativeArchive?: boolean; reopenAuthorized?: boolean } = {},
  ) {
    try {
      assertNotificationStatusTransition(
        from as unknown as DomainStatus,
        to as unknown as DomainStatus,
        context,
      );
    } catch (error) {
      if (error instanceof NotificationStatusTransitionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private isManualResolutionAllowedForNotification(
    eventType: string,
    eventKind: NotificationEventKind,
  ): boolean {
    return isManualResolutionAllowed(eventType, eventKind);
  }

  private logOperation(
    operation: string,
    candidate: NotificationCandidate,
    extra: Record<string, unknown> = {},
  ) {
    if (operation === 'created') recordNotificationIngestOperation('created');
    else if (operation === 'updated' || operation === 'reopened') recordNotificationIngestOperation('updated');
    else if (operation === 'resolved') recordNotificationIngestOperation('resolved');
    else if (operation === 'ignored') recordNotificationIngestOperation('ignored');

    const ingestOp = this.mapIngestOperation(operation);
    if (ingestOp) {
      this.ingestObservability?.recordIngestOperation({
        organizationId: candidate.organizationId,
        operation: ingestOp,
        domain: String(candidate.domain),
        eventType: candidate.eventType,
        notificationId: typeof extra.notificationId === 'string' ? extra.notificationId : undefined,
        correlationId: typeof extra.runId === 'string' ? extra.runId : undefined,
        latencyMs: typeof extra.latencyMs === 'number' ? extra.latencyMs : undefined,
      });
    }

    this.logger.log({
      msg: `notification.${operation}`,
      organizationRef: candidate.organizationId.slice(0, 8),
      eventType: candidate.eventType,
      sourceType: candidate.sourceType,
      operation,
      correlationId: extra.runId,
      ...extra,
    });
  }

  private mapIngestOperation(operation: string): NotificationIngestOperation | null {
    if (operation === 'created') return 'created';
    if (operation === 'updated') return 'updated';
    if (operation === 'reopened') return 'reopened';
    if (operation === 'resolved') return 'resolved';
    if (operation === 'ignored') return 'ignored';
    return null;
  }

  private emitLifecycleForMaterialize(
    result: MaterializeResult,
    severityBefore: NotificationSeverity | undefined,
    options: IngestCandidateOptions,
  ) {
    if (options.suppressWorkflowLifecycleEmit) return;

    const { notification, operation } = result;
    if (operation === 'created') {
      this.emitLifecycleEvent('notification.opened', notification, notification.firstSeenAt, options);
      return;
    }
    if (operation === 'reopened') {
      this.emitLifecycleEvent('notification.reopened', notification, notification.lastSeenAt, options);
      return;
    }
    if (operation === 'updated' && severityBefore) {
      const escalated =
        this.deliveryPolicy.shouldEnqueueForIngestOperation(
          'updated',
          notification,
          severityBefore,
        ) === 'SEVERITY_ESCALATED';
      if (escalated) {
        this.emitLifecycleEvent('notification.escalated', notification, notification.lastSeenAt, options);
      }
    }
  }

  private emitLifecycleEvent(
    lifecycleEvent: NotificationLifecycleEventType,
    notification: Notification,
    occurredAt?: Date,
    options: IngestCandidateOptions = {},
  ) {
    if (options.suppressWorkflowLifecycleEmit || !this.lifecycleWorkflowEmitter) return;

    this.lifecycleWorkflowEmitter.emit({
      lifecycleEvent,
      notification: {
        id: notification.id,
        organizationId: notification.organizationId,
        fingerprint: notification.fingerprint,
        lifecycleGeneration: notification.lifecycleGeneration,
        reopenCount: notification.reopenCount,
        eventType: notification.eventType,
        entityType: notification.entityType,
        entityId: notification.entityId,
        severity: notification.severity,
      },
      occurredAt,
      correlationId: options.runId,
    });
  }

  private recordMaterializeAudit(
    result: MaterializeResult,
    severityBefore: NotificationSeverity | undefined,
    options: IngestCandidateOptions,
  ) {
    const { notification, operation, reason } = result;
    const orgId = notification.organizationId;

    if (operation === 'ignored') {
      this.recordAuditEvent({
        organizationId: orgId,
        notificationId: notification.id,
        eventType: 'INGEST_IGNORED',
        actorType: options.auditActorType ?? 'SYSTEM',
        actorUserId: options.auditActorUserId,
        reasonCode: reason ?? 'IGNORED',
        correlationId: options.runId,
        nextState: snapshotFromNotification(notification),
      });
      return;
    }

    if (operation === 'created') {
      this.recordAuditEvent({
        organizationId: orgId,
        notificationId: notification.id,
        eventType: 'NOTIFICATION_CREATED',
        actorType: options.auditActorType ?? 'SYSTEM',
        actorUserId: options.auditActorUserId,
        correlationId: options.runId,
        nextState: snapshotFromNotification(notification),
        reasonCode: 'INGEST_CREATE',
      });
      return;
    }

    if (operation === 'reopened') {
      this.recordAuditEvent({
        organizationId: orgId,
        notificationId: notification.id,
        eventType: 'REOPENED',
        actorType: options.auditActorType ?? 'SYSTEM',
        actorUserId: options.auditActorUserId,
        correlationId: options.runId,
        nextState: snapshotFromNotification(notification),
        reasonCode: 'INGEST_REOPEN',
      });
      return;
    }

    if (operation === 'updated' && severityBefore) {
      const escalated =
        this.deliveryPolicy.shouldEnqueueForIngestOperation(
          'updated',
          notification,
          severityBefore,
        ) === 'SEVERITY_ESCALATED';
      if (escalated) {
        this.recordAuditEvent({
          organizationId: orgId,
          notificationId: notification.id,
          eventType: 'SEVERITY_ESCALATED',
          actorType: options.auditActorType ?? 'SYSTEM',
          actorUserId: options.auditActorUserId,
          correlationId: options.runId,
          previousState: { severity: severityBefore, status: notification.status },
          nextState: snapshotFromNotification(notification),
          reasonCode: 'SEVERITY_ESCALATED',
        });
      }
    }
  }

  private recordAuditEvent(input: {
    organizationId: string;
    notificationId?: string;
    eventType: import('@prisma/client').NotificationAuditEventType;
    actorType: import('@prisma/client').NotificationAuditActorType;
    actorUserId?: string;
    previousState?: ReturnType<typeof snapshotFromNotification>;
    nextState?: ReturnType<typeof snapshotFromNotification>;
    reasonCode?: string;
    correlationId?: string;
    clientMeta?: import('./audit/notification-audit.types').NotificationAuditClientMeta;
  }) {
    if (!this.notificationAudit) return;
    this.notificationAudit.recordFireAndForget({
      organizationId: input.organizationId,
      notificationId: input.notificationId,
      eventType: input.eventType,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      previousState: input.previousState,
      nextState: input.nextState,
      reasonCode: input.reasonCode,
      correlationId: input.correlationId,
      clientMeta: input.clientMeta,
    });
  }
}
