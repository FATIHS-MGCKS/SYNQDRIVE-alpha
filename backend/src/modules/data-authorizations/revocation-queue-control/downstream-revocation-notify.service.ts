import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DataAuthorizationAuditOutboxRepository } from '../privacy-domain/audit-log/data-authorization-audit-outbox.repository';
import { DataAuthorizationAuditEventKind } from '@prisma/client';
import { buildAuditIdempotencyKey } from '../privacy-domain/audit-log/data-authorization-audit.constants';
import { buildDownstreamNotifyIdempotencyKey } from './revocation-queue-control.constants';

export interface DownstreamRevocationNotifyInput {
  organizationId: string;
  workflowId: string;
  correlationId: string;
  recipient: string;
  channel: string;
  dataCategories: string[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class DownstreamRevocationNotifyService {
  private readonly logger = new Logger(DownstreamRevocationNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditOutbox: DataAuthorizationAuditOutboxRepository,
  ) {}

  async dispatch(input: DownstreamRevocationNotifyInput): Promise<{
    idempotentReplay: boolean;
    notifyId: string;
    status: string;
  }> {
    const idempotencyKey = buildDownstreamNotifyIdempotencyKey({
      workflowId: input.workflowId,
      recipient: input.recipient,
      channel: input.channel,
    });

    const existing = await this.prisma.dataAuthorizationDownstreamRevocationNotify.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { idempotentReplay: true, notifyId: existing.id, status: existing.status };
    }

    const row = await this.prisma.dataAuthorizationDownstreamRevocationNotify.create({
      data: {
        organizationId: input.organizationId,
        workflowId: input.workflowId,
        correlationId: input.correlationId,
        recipient: input.recipient,
        channel: input.channel,
        idempotencyKey,
        payloadJson: {
          event: 'REVOCATION_NOTICE',
          dataCategories: input.dataCategories,
          metadata: input.metadata ?? {},
        } as Prisma.InputJsonValue,
      },
    });

    try {
      await this.auditOutbox.enqueue({
        organizationId: input.organizationId,
        idempotencyKey: buildAuditIdempotencyKey({
          eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
          organizationId: input.organizationId,
          correlationId: `${input.correlationId}:downstream:${input.channel}`,
        }),
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        correlationId: input.correlationId,
        payload: {
          entityType: 'DOWNSTREAM_REVOCATION_NOTIFY',
          entityId: row.id,
          eventType: 'PARTNER_NOTIFIED',
          newStatus: 'DISPATCHED',
          metadata: {
            recipient: input.recipient,
            channel: input.channel,
            dataCategories: input.dataCategories,
          },
        },
      });

      await this.prisma.dataAuthorizationDownstreamRevocationNotify.update({
        where: { id: row.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          attempts: { increment: 1 },
        },
      });

      return { idempotentReplay: false, notifyId: row.id, status: 'DELIVERED' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      const deadLetter = attempts >= row.maxAttempts;

      await this.prisma.dataAuthorizationDownstreamRevocationNotify.update({
        where: { id: row.id },
        data: {
          status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
          attempts,
          lastError: message,
          deadLetteredAt: deadLetter ? new Date() : null,
        },
      });

      this.logger.error(
        `Downstream revocation notify failed recipient=${input.recipient}: ${message}`,
      );
      return { idempotentReplay: false, notifyId: row.id, status: deadLetter ? 'DEAD_LETTER' : 'FAILED' };
    }
  }

  async retryDeadLetter(notifyId: string, organizationId: string): Promise<{ status: string }> {
    const row = await this.prisma.dataAuthorizationDownstreamRevocationNotify.findFirst({
      where: { id: notifyId, organizationId, status: 'DEAD_LETTER' },
    });
    if (!row) {
      throw new Error('downstream_notify_not_found_or_not_dead_letter');
    }

    const payload = row.payloadJson as { dataCategories?: string[]; metadata?: Record<string, unknown> };
    return this.dispatch({
      organizationId: row.organizationId,
      workflowId: row.workflowId,
      correlationId: `${row.correlationId}:manual-retry`,
      recipient: row.recipient,
      channel: row.channel,
      dataCategories: payload.dataCategories ?? [],
      metadata: { ...payload.metadata, manualRetry: true, originalNotifyId: notifyId },
    }).then((r) => ({ status: r.status }));
  }
}
