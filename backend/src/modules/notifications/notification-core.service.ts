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

@Injectable()
export class NotificationCoreService {
  private readonly logger = new Logger(NotificationCoreService.name);

  constructor(
    private readonly repository: NotificationRepository,
    private readonly engineConfig: NotificationEngineConfig,
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
    const { canonical: fingerprint } = fingerprintFromCandidate(normalized);
    const referenceNow = options.referenceNow ?? new Date();

    if (isRecoverySeverity(normalized.severity as unknown as DomainSeverity)) {
      return this.handleRecoveryCandidate(normalized, fingerprint, referenceNow, options);
    }

    return withUniqueConflictRetry(() =>
      this.repository.runTransaction(async (tx) => {
        const active = await this.repository.findAnyActiveByFingerprint(
          normalized.organizationId,
          fingerprint,
          tx,
        );

        if (active) {
          const updated = await this.updateActiveFromCandidate(active, normalized, tx);
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
          return { operation: 'ignored', notification: latest, reason: 'ARCHIVED' };
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
            return { operation: 'ignored', notification: latest, reason: reopen.reason };
          }

          if (reopen.action === 'REOPEN') {
            const reopened = await this.reopenNotificationInternal(
              latest,
              normalized,
              reopen.reopenCount,
              tx,
            );
            this.logOperation('reopened', normalized, {
              notificationId: reopened.id,
              fingerprint,
              occurrenceCount: reopened.occurrenceCount,
              runId: options.runId,
            });
            return { operation: 'reopened', notification: reopened };
          }

          if (reopen.action === 'CREATE') {
            const created = await this.createNotificationWithOccurrence(
              normalized,
              fingerprint,
              reopen.generation,
              tx,
            );
            this.logOperation('created', normalized, {
              notificationId: created.id,
              fingerprint,
              occurrenceCount: created.occurrenceCount,
              runId: options.runId,
            });
            return { operation: 'created', notification: created };
          }
        }

        const generation = latest ? latest.lifecycleGeneration + 1 : 1;
        const created = await this.createNotificationWithOccurrence(
          normalized,
          fingerprint,
          generation,
          tx,
        );
        this.logOperation('created', normalized, {
          notificationId: created.id,
          fingerprint,
          occurrenceCount: created.occurrenceCount,
          runId: options.runId,
        });
        return { operation: 'created', notification: created };
      }),
    );
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

    const updated = await this.repository.updateNotification(notificationId, {
      status: NotificationStatus.RESOLVED,
      resolvedAt,
      snoozedUntil: null,
      acknowledgedAt: notification.acknowledgedAt,
    }, notification.version);

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
    return this.repository.runTransaction(async (tx) =>
      this.reopenNotificationInternal(notification, normalized, notification.reopenCount + 1, tx),
    );
  }

  async acknowledgeNotification(notificationId: string, organizationId: string, at: Date = new Date()) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.ACKNOWLEDGED);

    return this.repository.updateNotification(
      notificationId,
      { status: NotificationStatus.ACKNOWLEDGED, acknowledgedAt: at },
      notification.version,
    );
  }

  async snoozeNotification(notificationId: string, organizationId: string, until: Date) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.SNOOZED);

    return this.repository.updateNotification(
      notificationId,
      { status: NotificationStatus.SNOOZED, snoozedUntil: until },
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
      { status: NotificationStatus.OPEN, snoozedUntil: null },
      notification.version,
    );
  }

  async archiveNotification(notificationId: string, organizationId: string, at: Date = new Date()) {
    const notification = await this.requireNotification(notificationId, organizationId);
    this.assertTransition(notification.status, NotificationStatus.ARCHIVED, { administrativeArchive: true });

    return this.repository.updateNotification(
      notificationId,
      { status: NotificationStatus.ARCHIVED, archivedAt: at },
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

    const resolved = await this.resolveNotification(active.id, candidate.organizationId, resolvedAt);
    await this.repository.createOccurrence({
      notificationId: resolved.id,
      organizationId: candidate.organizationId,
      occurredAt: candidate.occurredAt,
      sourceType: candidate.sourceType,
      sourceRef: candidate.sourceRef,
      severityAtOccurrence: candidate.severity,
      payload: { recovery: true, ...(candidate.metadata ?? {}) } as Prisma.InputJsonValue,
    });

    this.logOperation('resolved', candidate, {
      notificationId: resolved.id,
      fingerprint,
      operation: 'resolved',
      runId: options.runId,
    });

    return { operation: 'resolved', notification: resolved };
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
      {
        notificationId: notification.id,
        organizationId: candidate.organizationId,
        occurredAt: candidate.occurredAt,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        severityAtOccurrence: candidate.severity,
        payload: candidate.metadata as Prisma.InputJsonValue,
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
      ? mergeTemplateParams(
          (existing.templateParams ?? {}) as Record<string, string | number | boolean | null>,
          candidate.templateParams,
        )
      : (existing.templateParams as Prisma.InputJsonValue);

    await this.repository.createOccurrence(
      {
        notificationId: existing.id,
        organizationId: candidate.organizationId,
        occurredAt: candidate.occurredAt,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        severityAtOccurrence: candidate.severity,
        payload: candidate.metadata as Prisma.InputJsonValue,
      },
      tx,
    );

    return this.repository.updateNotification(
      existing.id,
      {
        severity: newSeverity,
        lastSeenAt: candidate.occurredAt,
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
    await this.repository.createOccurrence(
      {
        notificationId: existing.id,
        organizationId: candidate.organizationId,
        occurredAt: candidate.occurredAt,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        severityAtOccurrence: candidate.severity,
        payload: candidate.metadata as Prisma.InputJsonValue,
      },
      tx,
    );

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
        lastSeenAt: candidate.occurredAt,
        occurrenceCount: existing.occurrenceCount + 1,
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
