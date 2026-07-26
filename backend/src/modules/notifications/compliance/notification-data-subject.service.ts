import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationRetentionService } from './notification-retention.service';
import type { NotificationDataSubjectExport } from './notification-retention.types';

@Injectable()
export class NotificationDataSubjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: NotificationRetentionService,
  ) {}

  /** Art. 15 — access/export for DSAR (org-scoped). */
  async exportForSubject(input: {
    organizationId: string;
    userId?: string;
    customerId?: string;
  }): Promise<NotificationDataSubjectExport> {
    const where: Record<string, unknown> = { organizationId: input.organizationId };
    if (input.customerId) {
      where.OR = [
        { templateParams: { path: ['customerId'], equals: input.customerId } },
        { actionTarget: { path: ['customerId'], equals: input.customerId } },
      ];
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      select: {
        id: true,
        eventType: true,
        status: true,
        severity: true,
        entityType: true,
        entityId: true,
        firstSeenAt: true,
        lastSeenAt: true,
        templateParams: true,
        receipts: input.userId
          ? {
              where: { userId: input.userId },
              select: { userId: true, readAt: true, acknowledgedAt: true },
            }
          : false,
      },
      take: 500,
      orderBy: { lastSeenAt: 'desc' },
    });

    return {
      organizationId: input.organizationId,
      userId: input.userId,
      customerId: input.customerId,
      notifications: notifications.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        status: row.status,
        severity: row.severity,
        entityType: row.entityType,
        entityId: row.entityId,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        templateParams: (row.templateParams ?? {}) as Record<string, unknown>,
        receipts: Array.isArray(row.receipts)
          ? row.receipts.map((r) => ({
              userId: r.userId,
              readAt: r.readAt?.toISOString() ?? null,
              acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
            }))
          : undefined,
      })),
    };
  }

  /** Art. 17 — erasure via anonymization (legal hold respected). */
  eraseForSubject(input: {
    organizationId: string;
    customerId?: string;
    userId?: string;
    dryRun?: boolean;
  }) {
    return this.retention.eraseSubjectData(input);
  }

  /** Art. 18 — restriction via legal hold flag. */
  async restrictProcessing(input: {
    organizationId: string;
    notificationId: string;
    reason: string;
  }) {
    return this.prisma.notification.update({
      where: { id: input.notificationId, organizationId: input.organizationId },
      data: {
        legalHold: true,
        legalHoldReason: input.reason.slice(0, 500),
        legalHoldSetAt: new Date(),
      },
    });
  }

  async releaseRestriction(input: { organizationId: string; notificationId: string }) {
    return this.prisma.notification.update({
      where: { id: input.notificationId, organizationId: input.organizationId },
      data: {
        legalHold: false,
        legalHoldReason: null,
        legalHoldSetAt: null,
      },
    });
  }
}
