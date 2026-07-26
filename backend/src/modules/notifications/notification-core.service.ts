import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
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
import { evaluateReopenDecision } from './notification-reopen.policy';
import {
  assertNotificationStatusTransition,
  applyIngestOccurrenceToLifecycle,
  lifecycleTimestampPatchForTransition,
  NotificationLifecycleTransitionError,
} from './lifecycle/notification-lifecycle.state-machine';
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
import {
  auditFromMaterializeResult,
  emitNotificationIngestAudit,
} from './notification-ingest-audit';
import { buildOccurrenceCreateInput } from './occurrence/notification-occurrence.factory';
import { evaluateOccurrenceIngest } from './occurrence/notification-occurrence.policy';

@Injectable()
export class NotificationCoreService {
  private readonly logger = new Logger(NotificationCoreService.name);

  constructor(
    private readonly repository: NotificationRepository,
    private readonly engineConfig: NotificationEngineConfig,
    private readonly deliveryEnqueue: NotificationDeliveryEnqueueService,
    private readonly deliveryPolicy: NotificationDeliveryPolicyService,
    private readonly deliveryScheduler: NotificationDeliverySchedulerService,
  ) {}

  isEnabled(): boolean {
    return this.engineConfig.isV2Enabled();
  }

  async ingestCandidate(
    candidate: NotificationCandidate,
    options: IngestCandidateOptions = {},
  ): Promise<IngestCandidateResult> {
    if (!this.isEnabled()) {
      this.logOperation('skipped_flag_off', candidate, { runId: options.runId });
      recordNotificationIngestOperation('skipped_flag_off');
      return { enabled: false, operation: 'skipped_flag_off' };
    }

    try {
      const result = await this.createOrUpdateNotification(candidate, options);
      return { enabled: true, ...result };
    } catch (err) {
      recordNotificationFailure();
      throw err;
    }
  }

  async createOrUpdateNotification(
    candidate: NotificationCandidate,
    options: IngestCandidateOptions = {},
  ): Promise<MaterializeResult> {
    const normalized = validateNotificationCandidate(candidate);
    const fingerprintPayload = fingerprintFromCandidate(normalized);
    const fingerprint = fingerprintPayload.canonical;
    const referenceNow = options.referenceNow ?? new Date();

    if (isRecoverySeverity(normalized.severity as unknown as DomainSeverity)) {
      return this.handleRecoveryCandidate(
        normalized,
        fingerprint,
        referenceNow,
        options,
      );
    }

    return this.runIngestWithRetry(normalized, fingerprint, fingerprintPayload, referenceNow, options);
  }

  private async runIngestWithRetry(
    normalized: NotificationCandidate,
    fingerprint: string,
    fingerprintPayload: ReturnType<typeof fingerprintFromCandidate>,
    referenceNow: Date,
    options: IngestCandidateOptions,
  ): Promise<MaterializeResult> {
    return withUniqueConflictRetry(async (): Promise<MaterializeResult> => {
      const pendingOutboxIds: string[] = [];
      const result = await this.repository.runTransaction(async (tx) => {
        await this.repository.lockLatestByFingerprintForUpdate(
          normalized.organizationId,
          fingerprint,
          tx,
        );

        const activeId = await this.repository.lockAnyActiveByFingerprintForUpdate(
          normalized.organizationId,
          fingerprint,
          tx,
        );
        const active = activeId
          ? await this.repository.findByIdForUpdate(activeId, normalized.organizationId, tx)
          : null;

        if (active) {
          const severityBefore = active.severity;
          const updated = await this.updateActiveFromCandidate(active, normalized, tx);
          if ('ignored' in updated && updated.ignored) {
            return {
              operation: 'ignored' as const,
              notification: updated.notification,
              reason: updated.reason,
            };
          }
          const notification = updated.notification;
          const transition = this.deliveryPolicy.shouldEnqueueForIngestOperation(
            'updated',
            notification,
            severityBefore,
          );
          if (transition) {
            const ids = await this.deliveryEnqueue.enqueueInTransaction(
              { notification, transition, severityBefore },
              tx,
            );
            pendingOutboxIds.push(...ids);
          }
          return { operation: 'updated' as const, notification };
        }

        const latestId = await this.repository.lockLatestByFingerprintForUpdate(
          normalized.organizationId,
          fingerprint,
          tx,
        );
        const latest = latestId
          ? await this.repository.findByIdForUpdate(latestId, normalized.organizationId, tx)
          : null;

        if (latest?.status === NotificationStatus.ARCHIVED) {
          return {
            operation: 'ignored' as const,
            notification: latest,
            reason: 'ARCHIVED',
          };
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
              fingerprint: fingerprintPayload,
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
            return {
              operation: 'ignored' as const,
              notification: latest,
              reason: reopen.reason,
            };
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
        return { operation: 'created' as const, notification: created };
      });

      await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);
      this.finalizeIngest(normalized, fingerprint, result, options);
      return result;
    });
  }

  private finalizeIngest(
    normalized: NotificationCandidate,
    fingerprint: string,
    result: MaterializeResult,
    options: IngestCandidateOptions,
  ): void {
    const operation = result.operation;
    const notification = result.notification;
    const reason = 'reason' in result ? result.reason : undefined;

    this.logOperation(operation, normalized, {
      notificationId: notification?.id,
      fingerprint,
      occurrenceCount: notification?.occurrenceCount,
      reason,
      runId: options.runId,
    });

    if (notification) {
      emitNotificationIngestAudit(
        this.logger,
        auditFromMaterializeResult(
          notification,
          operation,
          {
            organizationId: normalized.organizationId,
            eventType: normalized.eventType,
            fingerprint,
            sourceType: normalized.sourceType,
            sourceRef: normalized.sourceRef,
            sourceEventId: normalized.sourceEventId,
            runId: options.runId,
          },
          reason,
        ),
      );
    }
  }

  async appendOccurrence(notificationId: string, candidate: NotificationCandidate) {
    const normalized = validateNotificationCandidate(candidate);
    const notification = await this.requireNotification(notificationId, normalized.organizationId);

    return this.repository.runTransaction(async (tx) => {
      const duplicate = await this.repository.findOccurrenceBySourceEventId(
        notificationId,
        normalized.sourceEventId ?? normalized.sourceRef,
        tx,
      );
      const evaluation = evaluateOccurrenceIngest({
        candidate: normalized,
        notificationLastSeenAt: notification.lastSeenAt,
        isRecovery: isRecoverySeverity(normalized.severity as unknown as DomainSeverity),
        duplicateSourceEvent: !!duplicate,
      });

      if (!evaluation.recordOccurrence) {
        return notification;
      }

      await this.repository.createOccurrence(
        buildOccurrenceCreateInput(notificationId, normalized),
        tx,
      );
      return this.repository.updateNotification(
        notificationId,
        {
          lastSeenAt: evaluation.lastSeenAt,
          occurrenceCount: { increment: 1 },
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
    const updated = await this.repository.runTransaction(async (tx) => {
      const row = await this.repository.updateNotification(
        notificationId,
        {
          status: NotificationStatus.RESOLVED,
          ...lifecycleTimestampPatchForTransition(notification.status, NotificationStatus.RESOLVED, resolvedAt),
          acknowledgedAt: notification.acknowledgedAt,
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
    return reopened;
  }

  async acknowledgeNotification(notificationId: string, organizationId: string, at: Date = new Date()) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.ACKNOWLEDGED);

    const pendingOutboxIds: string[] = [];
    const updated = await this.repository.runTransaction(async (tx) => {
      const row = await this.repository.updateNotification(
        notificationId,
        {
          status: NotificationStatus.ACKNOWLEDGED,
          ...lifecycleTimestampPatchForTransition(notification.status, NotificationStatus.ACKNOWLEDGED, at),
        },
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
    return updated;
  }

  async snoozeNotification(notificationId: string, organizationId: string, until: Date) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.SNOOZED);

    return this.repository.updateNotification(
      notificationId,
      {
        status: NotificationStatus.SNOOZED,
        ...lifecycleTimestampPatchForTransition(notification.status, NotificationStatus.SNOOZED, until, until),
      },
      notification.version,
    );
  }

  async unsnoozeNotification(notificationId: string, organizationId: string) {
    const notification = await this.requireNotification(notificationId, organizationId);
    if (notification.status !== NotificationStatus.SNOOZED) {
      throw new BadRequestException('Notification is not snoozed');
    }
    this.assertTransition(notification.status, NotificationStatus.OPEN);

    return this.repository.updateNotification(
      notificationId,
      {
        status: NotificationStatus.OPEN,
        ...lifecycleTimestampPatchForTransition(notification.status, NotificationStatus.OPEN, new Date()),
      },
      notification.version,
    );
  }

  async archiveNotification(notificationId: string, organizationId: string, at: Date = new Date()) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.ARCHIVED, { administrativeArchive: true });

    return this.repository.updateNotification(
      notificationId,
      {
        status: NotificationStatus.ARCHIVED,
        ...lifecycleTimestampPatchForTransition(notification.status, NotificationStatus.ARCHIVED, at),
      },
      notification.version,
    );
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
    return withUniqueConflictRetry(async (): Promise<MaterializeResult> => {
      const pendingOutboxIds: string[] = [];
      const result = await this.repository.runTransaction(async (tx) => {
        await this.repository.lockLatestByFingerprintForUpdate(
          candidate.organizationId,
          fingerprint,
          tx,
        );

        const activeId = await this.repository.lockAnyActiveByFingerprintForUpdate(
          candidate.organizationId,
          fingerprint,
          tx,
        );
        const active = activeId
          ? await this.repository.findByIdForUpdate(activeId, candidate.organizationId, tx)
          : null;

        if (!active) {
          const latestId = await this.repository.lockLatestByFingerprintForUpdate(
            candidate.organizationId,
            fingerprint,
            tx,
          );
          const latest = latestId
            ? await this.repository.findByIdForUpdate(latestId, candidate.organizationId, tx)
            : null;

          if (latest?.status === NotificationStatus.RESOLVED) {
            return {
              operation: 'ignored' as const,
              notification: latest,
              reason: 'ALREADY_RESOLVED',
            };
          }

          throw new NotFoundException('No active notification to resolve for recovery');
        }

        const duplicate = await this.repository.findOccurrenceBySourceEventId(
          active.id,
          candidate.sourceEventId ?? candidate.sourceRef,
          tx,
        );
        const evaluation = evaluateOccurrenceIngest({
          candidate,
          notificationLastSeenAt: active.lastSeenAt,
          isRecovery: true,
          duplicateSourceEvent: !!duplicate,
        });

        if (!evaluation.applyRecovery) {
          if (evaluation.recordOccurrence) {
            await this.repository.createOccurrence(
              buildOccurrenceCreateInput(active.id, candidate, { recovery: true }),
              tx,
            );
            const row = await this.repository.updateNotification(
              active.id,
              { occurrenceCount: { increment: 1 } },
              active.version,
              tx,
            );
            return {
              operation: 'ignored' as const,
              notification: row,
              reason:
                evaluation.action === 'DUPLICATE_SOURCE_EVENT'
                  ? 'DUPLICATE_SOURCE_EVENT'
                  : 'STALE_RECOVERY',
            };
          }

          return {
            operation: 'ignored' as const,
            notification: active,
            reason: 'DUPLICATE_SOURCE_EVENT',
          };
        }

        await this.repository.createOccurrence(
          buildOccurrenceCreateInput(active.id, candidate, { recovery: true }),
          tx,
        );
        const finalRow = await this.repository.updateNotification(
          active.id,
          {
            status: NotificationStatus.RESOLVED,
            ...lifecycleTimestampPatchForTransition(active.status, NotificationStatus.RESOLVED, resolvedAt),
            acknowledgedAt: active.acknowledgedAt,
            occurrenceCount: { increment: 1 },
          },
          active.version,
          tx,
        );
        const transition = this.deliveryPolicy.shouldEnqueueForIngestOperation('resolved', finalRow);
        if (transition) {
          const ids = await this.deliveryEnqueue.enqueueInTransaction(
            { notification: finalRow, transition },
            tx,
          );
          pendingOutboxIds.push(...ids);
        }
        return { operation: 'resolved' as const, notification: finalRow };
      });

      await this.deliveryScheduler.scheduleOutboxIds(pendingOutboxIds);
      this.finalizeIngest(candidate, fingerprint, result, options);
      return result;
    });
  }

  private async createNotificationWithOccurrence(
    candidate: NotificationCandidate,
    fingerprint: string,
    lifecycleGeneration: number,
    tx: NotificationTx,
  ): Promise<Notification> {
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
        templateParams: candidate.templateParams as Prisma.InputJsonValue,
        actionType: candidate.actionType,
        actionTarget: candidate.actionTarget as unknown as Prisma.InputJsonValue,
        sourceType: candidate.sourceType,
        primarySourceRef: candidate.sourceRef,
        firstSeenAt: candidate.occurredAt,
        lastSeenAt: candidate.occurredAt,
        expiresAt: candidate.expiresAt ?? null,
      },
      tx,
    );

    await this.repository.createOccurrence(
      buildOccurrenceCreateInput(notification.id, candidate),
      tx,
    );

    return notification;
  }

  private async updateActiveFromCandidate(
    existing: Notification,
    candidate: NotificationCandidate,
    tx: NotificationTx,
  ): Promise<
    | { ignored: true; reason: string; notification: Notification }
    | { ignored?: false; notification: Notification }
  > {
    const duplicate = await this.repository.findOccurrenceBySourceEventId(
      existing.id,
      candidate.sourceEventId ?? candidate.sourceRef,
      tx,
    );
    const evaluation = evaluateOccurrenceIngest({
      candidate,
      notificationLastSeenAt: existing.lastSeenAt,
      isRecovery: false,
      duplicateSourceEvent: !!duplicate,
    });

    if (evaluation.action === 'DUPLICATE_SOURCE_EVENT') {
      return { ignored: true, reason: 'DUPLICATE_SOURCE_EVENT', notification: existing };
    }

    if (evaluation.recordOccurrence) {
      await this.repository.createOccurrence(
        buildOccurrenceCreateInput(existing.id, candidate),
        tx,
      );
    }

    const lifecycle = evaluation.applyLifecycle
      ? applyIngestOccurrenceToLifecycle({
          status: existing.status,
          severity: existing.severity,
          snoozedUntil: existing.snoozedUntil,
          incomingSeverity: candidate.severity,
          referenceNow: candidate.occurredAt,
        })
      : {
          status: existing.status,
          snoozedUntil: existing.snoozedUntil,
        };

    const newSeverity = evaluation.applySeverity
      ? (escalateSeverity(
          existing.severity as unknown as DomainSeverity,
          candidate.severity,
        ) as NotificationSeverity)
      : existing.severity;

    const templateParams = shouldRefreshTemplateParams(existing.lastSeenAt, candidate.occurredAt)
      ? mergeTemplateParams(
          (existing.templateParams ?? {}) as Record<string, string | number | boolean | null>,
          candidate.templateParams,
        )
      : (existing.templateParams as Prisma.InputJsonValue);

    const notification = await this.repository.updateNotification(
      existing.id,
      {
        status: lifecycle.status,
        severity: newSeverity,
        snoozedUntil: lifecycle.snoozedUntil,
        lastSeenAt: evaluation.lastSeenAt,
        ...(evaluation.recordOccurrence ? { occurrenceCount: { increment: 1 } } : {}),
        templateParams: templateParams as Prisma.InputJsonValue,
        titleKey: candidate.titleKey,
        bodyKey: candidate.bodyKey,
        primarySourceRef: candidate.sourceRef,
        expiresAt: candidate.expiresAt ?? existing.expiresAt,
      },
      existing.version,
      tx,
    );

    return { notification };
  }

  private async reopenNotificationInternal(
    existing: Notification,
    candidate: NotificationCandidate,
    reopenCount: number,
    tx: NotificationTx,
  ): Promise<Notification> {
    const duplicate = await this.repository.findOccurrenceBySourceEventId(
      existing.id,
      candidate.sourceEventId ?? candidate.sourceRef,
      tx,
    );
    if (!duplicate) {
      await this.repository.createOccurrence(
        buildOccurrenceCreateInput(existing.id, candidate),
        tx,
      );
    }

    this.assertTransition(existing.status, NotificationStatus.OPEN, { reopenAuthorized: true });

    return this.repository.updateNotification(
      existing.id,
      {
        status: NotificationStatus.OPEN,
        ...lifecycleTimestampPatchForTransition(existing.status, NotificationStatus.OPEN, candidate.occurredAt),
        severity: escalateSeverity(
          existing.severity as unknown as DomainSeverity,
          candidate.severity,
        ) as NotificationSeverity,
        reopenCount,
        lastSeenAt: duplicate
          ? existing.lastSeenAt
          : evaluateOccurrenceIngest({
              candidate,
              notificationLastSeenAt: existing.lastSeenAt,
              isRecovery: false,
              duplicateSourceEvent: false,
            }).lastSeenAt,
        ...(!duplicate ? { occurrenceCount: { increment: 1 } } : {}),
        templateParams: candidate.templateParams as Prisma.InputJsonValue,
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
      if (error instanceof NotificationLifecycleTransitionError) {
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

    this.logger.log({
      msg: `notification.${operation}`,
      organizationId: candidate.organizationId,
      eventType: candidate.eventType,
      sourceType: candidate.sourceType,
      sourceRef: candidate.sourceRef,
      operation,
      ...extra,
    });
  }
}
