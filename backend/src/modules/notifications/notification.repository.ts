import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
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
  detectedAt?: Date;
  sourceType: NotificationSourceType;
  sourceRef: string;
  severityAtOccurrence: NotificationSeverity;
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
}

export interface UpdateNotificationInput {
  severity?: NotificationSeverity;
  status?: NotificationStatus;
  titleKey?: string;
  bodyKey?: string;
  templateParams?: Prisma.InputJsonValue;
  lastSeenAt?: Date;
  occurrenceCount?: number;
  reopenCount?: number;
  acknowledgedAt?: Date | null;
  snoozedUntil?: Date | null;
  resolvedAt?: Date | null;
  archivedAt?: Date | null;
  expiresAt?: Date | null;
  primarySourceRef?: string;
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
    return this.prisma.$transaction(fn);
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
        detectedAt: data.detectedAt ?? new Date(),
        sourceType: data.sourceType,
        sourceRef: data.sourceRef,
        severityAtOccurrence: data.severityAtOccurrence,
        payload: data.payload ?? undefined,
      },
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
    };
    const updateData = {
      ...(data.readAt !== undefined ? { readAt: data.readAt } : {}),
      ...(data.acknowledgedAt !== undefined ? { acknowledgedAt: data.acknowledgedAt } : {}),
      ...(data.snoozedUntil !== undefined ? { snoozedUntil: data.snoozedUntil } : {}),
      ...(data.hiddenAt !== undefined ? { hiddenAt: data.hiddenAt } : {}),
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

  countUnreadForUser(organizationId: string, userId: string) {
    return this.prisma.notification.count({
      where: {
        organizationId,
        status: { in: ACTIVE_NOTIFICATION_STATUSES },
        receipts: {
          none: {
            userId,
            readAt: { not: null },
          },
        },
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
