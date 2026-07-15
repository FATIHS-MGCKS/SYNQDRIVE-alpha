import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingDomainEventOutboxStatus,
} from '@prisma/client';
import { BillingAuditService } from '../billing-audit.service';
import { BillingDomainEventOutboxRepository } from '../billing-domain-event-outbox.repository';
import { BillingEmailSenderService } from './billing-email-sender.service';
import { BillingEmailDeliveryAuditService } from './billing-email-delivery-audit.service';
import { buildBillingEmailIdempotencyKey } from '../domain/billing-outbox';

@Injectable()
export class BillingEmailResendService {
  constructor(
    private readonly outboxRepo: BillingDomainEventOutboxRepository,
    private readonly sender: BillingEmailSenderService,
    private readonly audit: BillingAuditService,
    private readonly deliveryAudit: BillingEmailDeliveryAuditService,
  ) {}

  async replayDeadLetter(deliveryId: string, actorUserId?: string | null) {
    const row = await this.outboxRepo.findEmailDeliveryById(deliveryId);
    if (!row) {
      throw new NotFoundException('Billing email delivery not found');
    }
    if (row.status !== BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER) {
      throw new BadRequestException('Only dead-letter deliveries can be replayed');
    }
    const detail = await this.deliveryAudit.getDelivery(deliveryId);
    if (!detail.capabilities.replayDeadLetter.allowed) {
      throw new BadRequestException(detail.capabilities.replayDeadLetter.reason ?? 'Replay not allowed');
    }

    const requeued = await this.outboxRepo.requeueDeadLetterDelivery(deliveryId);
    if (!requeued) {
      throw new BadRequestException('Delivery could not be requeued');
    }

    await this.audit.log({
      organizationId: row.outboxEvent.organizationId,
      actorUserId,
      action: 'BILLING_EMAIL_DEAD_LETTER_REPLAY',
      entityType: 'BillingDomainEventOutboxDelivery',
      entityId: deliveryId,
      reason: 'manual_replay',
    });

    return this.deliveryAudit.getDelivery(deliveryId);
  }

  async manualResend(deliveryId: string, actorUserId?: string | null, idempotencySuffix?: string) {
    const row = await this.outboxRepo.findEmailDeliveryById(deliveryId);
    if (!row) {
      throw new NotFoundException('Billing email delivery not found');
    }
    const detail = await this.deliveryAudit.getDelivery(deliveryId);
    if (!detail.capabilities.manualRetry.allowed) {
      throw new BadRequestException(detail.capabilities.manualRetry.reason ?? 'Manual retry not allowed');
    }

    const payload =
      row.outboxEvent.payload
      && typeof row.outboxEvent.payload === 'object'
      && !Array.isArray(row.outboxEvent.payload)
        ? (row.outboxEvent.payload as Record<string, unknown>)
        : {};

    const manualKey = `${row.outboxEvent.idempotencyKey}:manual:${idempotencySuffix?.trim() || Date.now()}`;
    const result = await this.sender.sendFromOutboxDelivery({
      deliveryId: row.id,
      eventType: row.outboxEvent.eventType,
      organizationId: row.outboxEvent.organizationId,
      outboxIdempotencyKey: manualKey,
      payload,
      manual: true,
    });

    if (!result.success && !result.skipped) {
      throw new BadRequestException(result.errorMessage ?? 'Manual resend failed');
    }

    await this.audit.log({
      organizationId: row.outboxEvent.organizationId,
      actorUserId,
      action: 'BILLING_EMAIL_MANUAL_RESEND',
      entityType: 'BillingDomainEventOutboxDelivery',
      entityId: deliveryId,
      after: {
        outboundEmailId: result.outboundEmailId ?? null,
        idempotencyKey: buildBillingEmailIdempotencyKey(manualKey),
        skipped: result.skipped ?? false,
        skipReason: result.skipReason ?? null,
      },
    });

    return this.deliveryAudit.getDelivery(deliveryId);
  }
}
