import { Injectable } from '@nestjs/common';
import {
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

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByFingerprint(
    organizationId: string,
    fingerprint: string,
    lifecycleGeneration: number,
  ) {
    return this.prisma.notification.findFirst({
      where: {
        organizationId,
        fingerprint,
        lifecycleGeneration,
        status: { in: ACTIVE_NOTIFICATION_STATUSES },
      },
    });
  }

  createNotification(data: CreateNotificationInput) {
    return this.prisma.notification.create({
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
      },
    });
  }

  createOccurrence(data: CreateOccurrenceInput) {
    return this.prisma.$transaction([
      this.prisma.notificationOccurrence.create({
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
      }),
      this.prisma.notification.update({
        where: { id: data.notificationId },
        data: {
          lastSeenAt: data.occurredAt,
          occurrenceCount: { increment: 1 },
          version: { increment: 1 },
        },
      }),
    ]);
  }

  upsertReceipt(data: UpsertReceiptInput) {
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

    return this.prisma.notificationReceipt.upsert({
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
}
