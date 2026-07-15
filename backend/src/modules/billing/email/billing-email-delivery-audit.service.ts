import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingDomainEventOutboxDeliveryStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginationParams,
} from '@shared/utils/pagination';
import { BillingDomainEventOutboxRepository } from '../billing-domain-event-outbox.repository';
import {
  buildBillingEmailDeliveryStatus,
  mapOutboundEventLabel,
  sanitizeBillingEmailLogDetail,
} from './billing-email-delivery.util';

export interface BillingEmailDeliveryAuditDto {
  deliveryId: string;
  outboxEventId: string;
  eventType: string;
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  deliveryStatus: BillingDomainEventOutboxDeliveryStatus;
  deliveryState: string;
  retryCount: number;
  deadLetterReason: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  resendMessageId: string | null;
  recipientEmail: string | null;
  billingInvoiceId: string | null;
  billingSubscriptionId: string | null;
  outboundEmail: ReturnType<OutboundEmailService['toDto']> | null;
  timeline: Array<{
    at: string;
    kind: 'delivery' | 'outbound';
    status: string;
    label: string;
    detail: string | null;
  }>;
  capabilities: {
    manualRetry: { allowed: boolean; reason: string | null };
    replayDeadLetter: { allowed: boolean; reason: string | null };
  };
}

@Injectable()
export class BillingEmailDeliveryAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: BillingDomainEventOutboxRepository,
    private readonly outboundEmail: OutboundEmailService,
  ) {}

  async listDeliveries(
    params: PaginationParams & {
      organizationId?: string;
      status?: BillingDomainEventOutboxDeliveryStatus;
    },
  ) {
    const { skip, take } = parsePagination(params);
    const { rows, total } = await this.outboxRepo.listEmailDeliveries({
      organizationId: params.organizationId,
      status: params.status,
      skip,
      take,
    });
    return buildPaginatedResult(
      rows.map((row) => this.toSummaryDto(row)),
      total,
      params,
    );
  }

  async getDelivery(deliveryId: string): Promise<BillingEmailDeliveryAuditDto> {
    const row = await this.outboxRepo.findEmailDeliveryById(deliveryId);
    if (!row) {
      throw new NotFoundException('Billing email delivery not found');
    }
    return this.toDetailDto(row);
  }

  private toSummaryDto(row: Awaited<ReturnType<BillingDomainEventOutboxRepository['findEmailDeliveryById']>> & object) {
    const outbound = row.outboundEmail ? this.outboundEmail.toDto(row.outboundEmail) : null;
    return {
      deliveryId: row.id,
      outboxEventId: row.outboxEventId,
      eventType: row.outboxEvent.eventType,
      organizationId: row.outboxEvent.organizationId,
      deliveryStatus: row.status,
      deliveryState: buildBillingEmailDeliveryStatus({
        deliveryStatus: row.status,
        outboundStatus: row.outboundEmail?.status ?? null,
        outboundEvents: row.outboundEmail?.events,
      }),
      retryCount: row.retryCount,
      deadLetterReason:
        row.status === BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER
          ? sanitizeBillingEmailLogDetail(row.lastError)
          : null,
      resendMessageId: row.outboundEmail?.providerMessageId ?? null,
      recipientEmail: row.outboundEmail?.toEmail ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetailDto(row: NonNullable<Awaited<ReturnType<BillingDomainEventOutboxRepository['findEmailDeliveryById']>>>) {
    const outbound = row.outboundEmail ? this.outboundEmail.toDto(row.outboundEmail) : null;
    const timeline = this.buildTimeline(row);
    const bouncedOrComplained = outbound?.events.some(
      (event) => event.eventType === 'BOUNCED' || event.eventType === 'COMPLAINED',
    );
    return {
      deliveryId: row.id,
      outboxEventId: row.outboxEventId,
      eventType: row.outboxEvent.eventType,
      organizationId: row.outboxEvent.organizationId,
      aggregateType: row.outboxEvent.aggregateType,
      aggregateId: row.outboxEvent.aggregateId,
      deliveryStatus: row.status,
      deliveryState: buildBillingEmailDeliveryStatus({
        deliveryStatus: row.status,
        outboundStatus: row.outboundEmail?.status ?? null,
        outboundEvents: row.outboundEmail?.events,
      }),
      retryCount: row.retryCount,
      deadLetterReason:
        row.status === BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER
          ? sanitizeBillingEmailLogDetail(row.lastError)
          : null,
      nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      resendMessageId: row.outboundEmail?.providerMessageId ?? null,
      recipientEmail: row.outboundEmail?.toEmail ?? null,
      billingInvoiceId: row.outboundEmail?.billingInvoiceId ?? null,
      billingSubscriptionId: row.outboundEmail?.billingSubscriptionId ?? null,
      outboundEmail: outbound,
      timeline,
      capabilities: {
        manualRetry: {
          allowed:
            row.status === BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER
            || row.status === BillingDomainEventOutboxDeliveryStatus.DELIVERED,
          reason:
            row.status === BillingDomainEventOutboxDeliveryStatus.PENDING
            || row.status === BillingDomainEventOutboxDeliveryStatus.PROCESSING
              ? 'Delivery is still in progress'
              : null,
        },
        replayDeadLetter: {
          allowed: row.status === BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER && !bouncedOrComplained,
          reason: bouncedOrComplained
            ? 'Recipient is suppressed after bounce/complaint'
            : row.status !== BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER
              ? 'Delivery is not in dead letter state'
              : null,
        },
      },
    };
  }

  private buildTimeline(
    row: NonNullable<Awaited<ReturnType<BillingDomainEventOutboxRepository['findEmailDeliveryById']>>>,
  ) {
    const timeline: BillingEmailDeliveryAuditDto['timeline'] = [
      {
        at: row.createdAt.toISOString(),
        kind: 'delivery',
        status: 'CREATED',
        label: 'Outbox-Zustellung erstellt',
        detail: row.outboxEvent.eventType,
      },
    ];
    if (row.deliveredAt) {
      timeline.push({
        at: row.deliveredAt.toISOString(),
        kind: 'delivery',
        status: 'DELIVERED',
        label: 'Outbox-Zustellung abgeschlossen',
        detail: null,
      });
    }
    if (row.status === BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER) {
      timeline.push({
        at: row.updatedAt.toISOString(),
        kind: 'delivery',
        status: 'DEAD_LETTER',
        label: 'Dead Letter',
        detail: sanitizeBillingEmailLogDetail(row.lastError),
      });
    }
    for (const event of row.outboundEmail?.events ?? []) {
      timeline.push({
        at: event.occurredAt.toISOString(),
        kind: 'outbound',
        status: event.eventType,
        label: mapOutboundEventLabel(event.eventType),
        detail: sanitizeBillingEmailLogDetail(
          typeof (event.payload as Record<string, unknown> | null)?.errorMessage === 'string'
            ? ((event.payload as Record<string, unknown>).errorMessage as string)
            : null,
        ),
      });
    }
    return timeline.sort((a, b) => a.at.localeCompare(b.at));
  }
}
