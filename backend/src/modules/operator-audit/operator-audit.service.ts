import { Injectable, Logger } from '@nestjs/common';
import { BusinessAuditOutboxStatus } from '@prisma/client';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import { buildBusinessAuditIdempotencyKey } from '@modules/business-audit/business-audit-idempotency.util';
import type {
  BusinessAuditActionCode,
  BusinessAuditEntityType,
} from '@modules/business-audit/business-audit.constants';
import { BusinessAuditAction } from '@modules/business-audit/business-audit.constants';
import { PrismaService } from '@shared/database/prisma.service';
import { minimizeOperatorAuditState } from './operator-audit-payload.util';
import type { OperatorAuditListQuery, OperatorAuditRecordInput } from './operator-audit.types';

@Injectable()
export class OperatorAuditService {
  private readonly logger = new Logger(OperatorAuditService.name);

  constructor(
    private readonly businessAudit: BusinessAuditService,
    private readonly prisma: PrismaService,
  ) {}

  async record(input: OperatorAuditRecordInput): Promise<string | null> {
    const correlationId =
      input.correlationId?.trim() ||
      `${input.action.toLowerCase()}:${input.entityId}:${Date.now()}`;

    const idempotencyKey = buildBusinessAuditIdempotencyKey({
      action: input.action,
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId,
    });

    try {
      const outbox = await this.businessAudit.enqueue({
        organizationId: input.organizationId,
        idempotencyKey,
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId,
        before: input.before ? minimizeOperatorAuditState(input.before) : undefined,
        after: input.after ? minimizeOperatorAuditState(input.after) : undefined,
        changeReason: input.changeReason ?? null,
        outcome: input.outcome,
        description: input.description,
        metadata: {
          eventType: input.action,
          timestamp: new Date().toISOString(),
          requestId: input.requestId ?? null,
          stationId: input.stationId ?? null,
          resourceType: input.entityType,
          resourceId: input.entityId,
          action: input.action,
          outcome: input.outcome,
          ...input.metadata,
        },
      });

      if (input.critical) {
        await this.businessAudit.flushCritical([outbox.id]);
      }

      return outbox.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Operator audit record failed action=${input.action} org=${input.organizationId}: ${message}`,
      );
      if (input.critical) throw err;
      return null;
    }
  }

  recordPermissionDenied(input: {
    organizationId: string;
    actorUserId?: string | null;
    module: string;
    level: string;
    route?: string;
    requestId?: string | null;
  }): void {
    const correlationId = `deny:${input.requestId ?? 'unknown'}:${input.module}.${input.level}`;
    void this.record({
      organizationId: input.organizationId,
      action: BusinessAuditAction.OPERATOR_PERMISSION_DENIED,
      entityType: 'ORGANIZATION',
      entityId: input.organizationId,
      actorUserId: input.actorUserId,
      outcome: 'DENIED',
      correlationId,
      requestId: input.requestId ?? null,
      description: `Permission denied: ${input.module}.${input.level}`,
      metadata: {
        module: input.module,
        level: input.level,
        route: input.route ?? null,
      },
    });
  }

  async listForOrganization(organizationId: string, query: OperatorAuditListQuery = {}) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    const actionPrefix = query.action?.startsWith('OPERATOR_')
      ? query.action
      : 'OPERATOR_';

    const rows = await this.prisma.businessAuditOutbox.findMany({
      where: {
        organizationId,
        action: query.action ? actionPrefix : { startsWith: 'OPERATOR_' },
        status: BusinessAuditOutboxStatus.PROCESSED,
        ...(query.bookingId
          ? {
              OR: [
                { entityId: query.bookingId, entityType: 'BOOKING' },
                {
                  payload: {
                    path: ['metadata', 'bookingId'],
                    equals: query.bookingId,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        eventId: true,
        organizationId: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        correlationId: true,
        occurredAt: true,
        beforeSummary: true,
        afterSummary: true,
        changeReason: true,
        outcome: true,
        payload: true,
      },
    });

    return rows.map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
      return {
        eventId: row.eventId,
        eventType: row.action,
        timestamp: row.occurredAt.toISOString(),
        actorUserId: row.actorUserId,
        organizationId: row.organizationId,
        stationId: (metadata.stationId as string | null) ?? null,
        resourceType: row.entityType,
        resourceId: row.entityId,
        action: row.action,
        outcome: row.outcome,
        changeReason: row.changeReason,
        correlationId: row.correlationId,
        requestId: (metadata.requestId as string | null) ?? null,
        beforeSummary: row.beforeSummary,
        afterSummary: row.afterSummary,
        description: typeof payload.description === 'string' ? payload.description : null,
        metadata,
      };
    });
  }
}
