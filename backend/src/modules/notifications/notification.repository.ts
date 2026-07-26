import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationOccurrenceRecoveryState,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export const ACTIVE_NOTIFICATION_STATUSES: NotificationStatus[] = [
  NotificationStatus.OPEN,
  NotificationStatus.ACKNOWLEDGED,
  NotificationStatus.SNOOZED,
];

export type NotificationTx = Prisma.TransactionClient;

export interface CreateNotificationInput {
  organizationId: string;
  fingerprint: string;
  lifecycleGeneration?: number;
  eventType: string;
  eventKind: NotificationEventKind;
  conditionCode: string;
  domain: NotificationDomain;
  severity: NotificationSeverity;
  status?: NotificationStatus;
  entityType: NotificationEntityType;
  entityId: string;
  titleKey: string;
  bodyKey: string;
  templateParams?: Prisma.InputJsonValue;
  actionType: NotificationActionType;
  actionTarget?: Prisma.InputJsonValue;
  sourceType: NotificationSourceType;
  primarySourceRef: string;
  legacyInsightId?: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  expiresAt?: Date | null;
  resolvedAt?: Date | null;
  reopenCount?: number;
}

export interface CreateOccurrenceInput {
  notificationId: string;
  organizationId: string;
  occurredAt: Date;
  observedAt?: Date;
  sourceType: NotificationSourceType;
  sourceRef: string;
  sourceEventId: string;
  severityAtOccurrence: NotificationSeverity;
  recoveryState?: NotificationOccurrenceRecoveryState;
  correlationId?: string | null;
  causationId?: string | null;
  payload?: Prisma.InputJsonValue;
}

export interface UpsertReceiptInput {
  notificationId: string;
  userId: string;
  organizationId: string;
  readAt?: Date | null;
  acknowledgedAt?: Date | null;
  snoozedUntil?: Date | null;
  hiddenAt?: Date | null;
  lastSeenAt?: Date | null;
}

export interface UpdateNotificationInput {
  severity?: NotificationSeverity;
  status?: NotificationStatus;
  titleKey?: string;
  bodyKey?: string;
  templateParams?: Prisma.InputJsonValue;
  lastSeenAt?: Date;
  occurrenceCount?: number | { increment: number };
  reopenCount?: number;
  acknowledgedAt?: Date | null;
  snoozedUntil?: Date | null;
  resolvedAt?: Date | null;
  archivedAt?: Date | null;
  expiresAt?: Date | null;
  primarySourceRef?: string;
  legacyInsightId?: string | null;
  firstSeenAt?: Date;
  version?: { increment: number };
}

export interface ListNotificationsFilter {
  organizationId: string;
  status?: NotificationStatus[];
  domain?: NotificationDomain;
  entityType?: NotificationEntityType;
  entityId?: string;
  fingerprint?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationReceiptMap {
  [notificationId: string]: {
    readAt: Date | null;
    acknowledgedAt: Date | null;
    snoozedUntil: Date | null;
    hiddenAt: Date | null;
  };
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: NotificationTx) {
    return tx ?? this.prisma;
  }

  runTransaction<T>(fn: (tx: NotificationTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  /**
   * Row lock for ingest serialization — must run inside an open transaction.
   * Returns the locked active notification id, if any.
   */
  async lockAnyActiveByFingerprintForUpdate(
    organizationId: string,
    fingerprint: string,
    tx: NotificationTx,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM notifications
      WHERE organization_id = ${organizationId}
        AND fingerprint = ${fingerprint}
        AND status::text IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
      ORDER BY lifecycle_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    return rows[0]?.id ?? null;
  }

  /**
   * Locks the latest notification row for a fingerprint (any status) to serialize
   * generation/reopen decisions when no active row exists yet.
   */
  async lockLatestByFingerprintForUpdate(
    organizationId: string,
    fingerprint: string,
    tx: NotificationTx,
  ): Promise<string | null> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM notifications
      WHERE organization_id = ${organizationId}
        AND fingerprint = ${fingerprint}
      ORDER BY lifecycle_generation DESC
      LIMIT 1
      FOR UPDATE
    `;
    return rows[0]?.id ?? null;
  }

  findByIdForUpdate(id: string, organizationId: string, tx: NotificationTx) {
    return this.findById(id, organizationId, tx);
  }

  findById(id: string, organizationId: string, tx?: NotificationTx) {
    return this.client(tx).notification.findFirst({
      where: { id, organizationId },
      include: { occurrences: { orderBy: { occurredAt: 'desc' }, take: 20 } },
    });
  }

  findActiveByFingerprint(
    organizationId: string,
    fingerprint: string,
    lifecycleGeneration: number,
    tx?: NotificationTx,
  ) {
    return this.client(tx).notification.findFirst({
      where: {
        organizationId,
        fingerprint,
        lifecycleGeneration,
        status: { in: ACTIVE_NOTIFICATION_STATUSES },
      },
    });
  }

  findAnyActiveByFingerprint(organizationId: string, fingerprint: string, tx?: NotificationTx) {
    return this.client(tx).notification.findFirst({
      where: {
        organizationId,
        fingerprint,
        status: { in: ACTIVE_NOTIFICATION_STATUSES },
      },
      orderBy: { lifecycleGeneration: 'desc' },
    });
  }

  findLatestByFingerprint(organizationId: string, fingerprint: string, tx?: NotificationTx) {
    return this.client(tx).notification.findFirst({
      where: { organizationId, fingerprint },
      orderBy: { lifecycleGeneration: 'desc' },
    });
  }

  findByFingerprintAndGeneration(
    organizationId: string,
    fingerprint: string,
    lifecycleGeneration: number,
    tx?: NotificationTx,
  ) {
    return this.client(tx).notification.findFirst({
      where: { organizationId, fingerprint, lifecycleGeneration },
    });
  }

  createNotification(data: CreateNotificationInput, tx?: NotificationTx) {
    return this.client(tx).notification.create({
      data: {
        organizationId: data.organizationId,
        fingerprint: data.fingerprint,
        lifecycleGeneration: data.lifecycleGeneration ?? 1,
        eventType: data.eventType,
        eventKind: data.eventKind,
        conditionCode: data.conditionCode,
        domain: data.domain,
        severity: data.severity,
        status: data.status ?? NotificationStatus.OPEN,
        entityType: data.entityType,
        entityId: data.entityId,
        titleKey: data.titleKey,
        bodyKey: data.bodyKey,
        templateParams: data.templateParams ?? {},
        actionType: data.actionType,
        actionTarget: data.actionTarget ?? {},
        sourceType: data.sourceType,
        primarySourceRef: data.primarySourceRef,
        legacyInsightId: data.legacyInsightId ?? undefined,
        firstSeenAt: data.firstSeenAt,
        lastSeenAt: data.lastSeenAt,
        expiresAt: data.expiresAt ?? undefined,
        resolvedAt: data.resolvedAt ?? undefined,
        reopenCount: data.reopenCount ?? 0,
      },
    });
  }

  createOccurrence(data: CreateOccurrenceInput, tx?: NotificationTx) {
    return this.client(tx).notificationOccurrence.create({
      data: {
        notificationId: data.notificationId,
        organizationId: data.organizationId,
        occurredAt: data.occurredAt,
        observedAt: data.observedAt ?? new Date(),
        sourceType: data.sourceType,
        sourceRef: data.sourceRef,
        sourceEventId: data.sourceEventId,
        severityAtOccurrence: data.severityAtOccurrence,
        recoveryState: data.recoveryState ?? NotificationOccurrenceRecoveryState.ACTIVE,
        correlationId: data.correlationId ?? undefined,
        causationId: data.causationId ?? undefined,
        payload: data.payload ?? undefined,
      },
    });
  }

  findOccurrenceBySourceEventId(
    notificationId: string,
    sourceEventId: string,
    tx?: NotificationTx,
  ) {
    return this.client(tx).notificationOccurrence.findUnique({
      where: {
        notificationId_sourceEventId: {
          notificationId,
          sourceEventId,
        },
      },
    });
  }

  countOccurrences(notificationId: string, tx?: NotificationTx) {
    return this.client(tx).notificationOccurrence.count({
      where: { notificationId },
    });
  }

  updateNotification(
    id: string,
    data: UpdateNotificationInput,
    expectedVersion?: number,
    tx?: NotificationTx,
  ) {
    return this.client(tx).notification.update({
      where: expectedVersion != null ? { id, version: expectedVersion } : { id },
      data: {
        ...data,
        version: data.version ?? { increment: 1 },
      },
    });
  }

  incrementOccurrenceStats(
    notificationId: string,
    occurredAt: Date,
    tx?: NotificationTx,
  ) {
    return this.client(tx).notification.update({
      where: { id: notificationId },
      data: {
        lastSeenAt: occurredAt,
        occurrenceCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
  }

  upsertReceipt(data: UpsertReceiptInput, tx?: NotificationTx) {
    const createData = {
      notificationId: data.notificationId,
      userId: data.userId,
      organizationId: data.organizationId,
      ...(data.readAt !== undefined ? { readAt: data.readAt } : {}),
      ...(data.acknowledgedAt !== undefined ? { acknowledgedAt: data.acknowledgedAt } : {}),
      ...(data.snoozedUntil !== undefined ? { snoozedUntil: data.snoozedUntil } : {}),
      ...(data.hiddenAt !== undefined ? { hiddenAt: data.hiddenAt } : {}),
      ...(data.lastSeenAt !== undefined ? { lastSeenAt: data.lastSeenAt } : {}),
    };
    const updateData = {
      ...(data.readAt !== undefined ? { readAt: data.readAt } : {}),
      ...(data.acknowledgedAt !== undefined ? { acknowledgedAt: data.acknowledgedAt } : {}),
      ...(data.snoozedUntil !== undefined ? { snoozedUntil: data.snoozedUntil } : {}),
      ...(data.hiddenAt !== undefined ? { hiddenAt: data.hiddenAt } : {}),
      ...(data.lastSeenAt !== undefined ? { lastSeenAt: data.lastSeenAt } : {}),
    };

    return this.client(tx).notificationReceipt.upsert({
      where: {
        notificationId_userId: {
          notificationId: data.notificationId,
          userId: data.userId,
        },
      },
      create: createData,
      update: updateData,
    });
  }

  listNotifications(filter: ListNotificationsFilter) {
    const where: Prisma.NotificationWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(filter.domain ? { domain: filter.domain } : {}),
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.fingerprint ? { fingerprint: filter.fingerprint } : {}),
    };

    return this.prisma.notification.findMany({
      where,
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });
  }

  listNotificationsWhere(
    where: Prisma.NotificationWhereInput,
    options: {
      skip: number;
      take: number;
      orderBy?: Prisma.NotificationOrderByWithRelationInput[];
    },
  ) {
    return this.prisma.notification.findMany({
      where,
      orderBy: options.orderBy ?? [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      skip: options.skip,
      take: options.take,
    });
  }

  countNotificationsWhere(where: Prisma.NotificationWhereInput) {
    return this.prisma.notification.count({ where });
  }

  groupCountBySeverityWhere(where: Prisma.NotificationWhereInput) {
    return this.prisma.notification.groupBy({
      by: ['severity'],
      where,
      _count: { _all: true },
    });
  }

  groupCountByDomainWhere(where: Prisma.NotificationWhereInput) {
    return this.prisma.notification.groupBy({
      by: ['domain'],
      where,
      _count: { _all: true },
    });
  }

  findReceiptsForUser(notificationIds: string[], userId: string) {
    if (!notificationIds.length) return Promise.resolve([]);
    return this.prisma.notificationReceipt.findMany({
      where: { notificationId: { in: notificationIds }, userId },
    });
  }

  findReceipt(notificationId: string, userId: string) {
    return this.prisma.notificationReceipt.findUnique({
      where: {
        notificationId_userId: { notificationId, userId },
      },
    });
  }

  findReceiptForUserInOrg(notificationId: string, userId: string, organizationId: string) {
    return this.prisma.notificationReceipt.findFirst({
      where: { notificationId, userId, organizationId },
    });
  }

  countNotifications(organizationId: string, status?: NotificationStatus[]) {
    return this.prisma.notification.count({
      where: {
        organizationId,
        ...(status?.length ? { status: { in: status } } : {}),
      },
    });
  }

  countBySeverity(organizationId: string, status?: NotificationStatus[]) {
    return this.prisma.notification.groupBy({
      by: ['severity'],
      where: {
        organizationId,
        ...(status?.length ? { status: { in: status } } : {}),
      },
      _count: { _all: true },
    });
  }

  countUnreadForUser(organizationId: string, userId: string, referenceNow = new Date()) {
    return this.prisma.notification.count({
      where: {
        organizationId,
        status: { in: ACTIVE_NOTIFICATION_STATUSES },
        NOT: {
          receipts: {
            some: {
              userId,
              readAt: { not: null },
            },
          },
        },
        AND: [
          {
            NOT: {
              AND: [
                { severity: { not: NotificationSeverity.CRITICAL } },
                {
                  receipts: {
                    some: {
                      userId,
                      snoozedUntil: { gt: referenceNow },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });
  }

  expireNotifications(organizationId: string, referenceNow: Date) {
    return this.prisma.notification.updateMany({
      where: {
        organizationId,
        status: { in: ACTIVE_NOTIFICATION_STATUSES },
        expiresAt: { not: null, lte: referenceNow },
      },
      data: {
        status: NotificationStatus.RESOLVED,
        resolvedAt: referenceNow,
      },
    });
  }
}

export type NotificationWithOccurrences = Notification & {
  occurrences?: { id: string; occurredAt: Date }[];
};
