import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import {
  NOTIFICATION_AUDIT_EVENT_RETENTION,
  NOTIFICATION_AUDIT_RETENTION_DAYS,
} from './notification-audit.constants';
import {
  hashNotificationAuditPayload,
  sanitizeNotificationAuditClientMeta,
  sanitizeNotificationAuditState,
  scanNotificationAuditForSecrets,
} from './notification-audit-sanitize.util';
import type {
  ListNotificationAuditInput,
  RecordNotificationAuditInput,
} from './notification-audit.types';

@Injectable()
export class NotificationAuditService {
  private readonly logger = new Logger(NotificationAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /**
   * Append-only audit record. Fire-and-forget — never throws to callers.
   */
  async record(input: RecordNotificationAuditInput): Promise<string | null> {
    const previousState = sanitizeNotificationAuditState(input.previousState);
    const nextState = sanitizeNotificationAuditState(input.nextState);
    const clientMeta = sanitizeNotificationAuditClientMeta(
      input.clientMeta as Record<string, unknown> | null | undefined,
    );
    const retentionClass = NOTIFICATION_AUDIT_EVENT_RETENTION[input.eventType];
    const payloadHash = hashNotificationAuditPayload({
      eventType: input.eventType,
      previousState,
      nextState,
      reasonCode: input.reasonCode,
      correlationId: input.correlationId,
    });

    const violations = scanNotificationAuditForSecrets({
      ...(clientMeta ?? {}),
      ...(previousState ?? {}),
      ...(nextState ?? {}),
    });
    if (violations.length > 0) {
      this.logger.warn(
        `Notification audit secret scan orgId=${input.organizationId} event=${input.eventType} paths=${violations.join(',')}`,
      );
    }

    try {
      const row = await this.prisma.notificationAuditEvent.create({
        data: {
          organizationId: input.organizationId,
          notificationId: input.notificationId ?? null,
          eventType: input.eventType,
          retentionClass,
          actorType: input.actorType,
          actorUserId: input.actorUserId ?? null,
          previousState: previousState
            ? (previousState as Prisma.InputJsonValue)
            : undefined,
          nextState: nextState ? (nextState as Prisma.InputJsonValue) : undefined,
          reasonCode: input.reasonCode ?? null,
          correlationId: input.correlationId ?? null,
          clientMeta: clientMeta ? (clientMeta as Prisma.InputJsonValue) : undefined,
          payloadHash,
          legalHold: input.legalHold ?? false,
        },
      });

      if (retentionClass === 'GOVERNANCE_AUDIT') {
        await this.activityLog.log({
          organizationId: input.organizationId,
          userId: input.actorUserId ?? undefined,
          action: ActivityAction.UPDATE,
          entity: ActivityEntity.ORGANIZATION,
          entityId: input.notificationId ?? input.organizationId,
          description: `Notification audit: ${input.eventType}`,
          metaJson: {
            notificationAudit: {
              eventType: input.eventType,
              notificationId: input.notificationId,
              retentionClass,
              retentionDays: NOTIFICATION_AUDIT_RETENTION_DAYS[retentionClass],
              correlationId: input.correlationId,
              payloadHash,
              reasonCode: input.reasonCode,
            },
          },
          ipAddress: clientMeta?.ipAddress as string | undefined,
        });
      }

      return row.id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to persist notification audit orgId=${input.organizationId} event=${input.eventType}: ${message}`,
      );
      return null;
    }
  }

  recordFireAndForget(input: RecordNotificationAuditInput): void {
    void this.record(input);
  }

  async listEvents(input: ListNotificationAuditInput) {
    const limit = Math.min(input.limit ?? 50, 100);
    const rows = await this.prisma.notificationAuditEvent.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.notificationId ? { notificationId: input.notificationId } : {}),
        ...(input.eventType ? { eventType: input.eventType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((row) => ({
        ...row,
        retentionDays: NOTIFICATION_AUDIT_RETENTION_DAYS[row.retentionClass],
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async getEvent(organizationId: string, eventId: string) {
    const row = await this.prisma.notificationAuditEvent.findFirst({
      where: { id: eventId, organizationId },
    });
    if (!row) throw new NotFoundException('Notification audit event not found');
    return {
      ...row,
      retentionDays: NOTIFICATION_AUDIT_RETENTION_DAYS[row.retentionClass],
    };
  }

  /**
   * Purge expired audit rows respecting legal hold. Called from retention scheduler.
   */
  async purgeExpiredEvents(input: {
    organizationId?: string;
    dryRun?: boolean;
    referenceNow?: Date;
  }): Promise<{ deleted: number; skippedLegalHold: number }> {
    const referenceNow = input.referenceNow ?? new Date();
    let deleted = 0;
    let skippedLegalHold = 0;

    for (const [retentionClass, days] of Object.entries(NOTIFICATION_AUDIT_RETENTION_DAYS)) {
      if (!days || days <= 0) continue;
      const cutoff = new Date(referenceNow);
      cutoff.setUTCDate(cutoff.getUTCDate() - days);

      const eligible = await this.prisma.notificationAuditEvent.findMany({
        where: {
          retentionClass: retentionClass as keyof typeof NOTIFICATION_AUDIT_RETENTION_DAYS,
          createdAt: { lt: cutoff },
          legalHold: false,
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        },
        select: { id: true },
        take: 500,
      });

      if (input.dryRun) {
        deleted += eligible.length;
        continue;
      }

      if (eligible.length === 0) continue;

      const result = await this.prisma.notificationAuditEvent.deleteMany({
        where: { id: { in: eligible.map((r) => r.id) } },
      });
      deleted += result.count;
    }

    const held = await this.prisma.notificationAuditEvent.count({
      where: {
        legalHold: true,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
    });
    skippedLegalHold = held;

    return { deleted, skippedLegalHold };
  }
}
