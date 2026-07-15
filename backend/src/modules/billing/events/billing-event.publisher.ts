import { Injectable, Logger } from '@nestjs/common';
import { BillingDomainEvent, BillingDomainEventType } from '../domain/billing-domain.events';
import { BillingAuditService } from '../billing-audit.service';

export type BillingDomainEventListener = (event: BillingDomainEvent) => void | Promise<void>;

/**
 * Publishes billing domain events for audit and downstream handlers.
 * Does NOT send email — email delivery is a separate concern (Prompt 30+).
 */
@Injectable()
export class BillingEventPublisher {
  private readonly logger = new Logger(BillingEventPublisher.name);
  private readonly listeners = new Set<BillingDomainEventListener>();

  constructor(private readonly audit: BillingAuditService) {}

  registerListener(listener: BillingDomainEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: BillingDomainEvent): Promise<void> {
    this.logger.debug(`Billing domain event: ${event.type} org=${event.organizationId ?? 'n/a'}`);

    await this.audit.log({
      organizationId: event.organizationId,
      actorUserId: event.actorUserId ?? null,
      action: event.type,
      entityType: 'BillingDomainEvent',
      entityId: event.correlationId ?? null,
      after: {
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload,
      },
    });

    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  async publishSubscriptionSynced(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.SUBSCRIPTION_SYNCED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishSubscriptionStatusChanged(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
    actorUserId?: string | null,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.SUBSCRIPTION_STATUS_CHANGED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
      actorUserId,
    });
  }

  async publishPaymentMethodSynced(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
    actorUserId?: string | null,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.PAYMENT_METHOD_SYNCED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
      actorUserId,
    });
  }

  async publishInvoiceMirrored(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.INVOICE_MIRRORED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishPaymentRecorded(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.PAYMENT_RECORDED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishRefundRecorded(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.REFUND_RECORDED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishCreditNoteRecorded(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.CREDIT_NOTE_RECORDED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishDisputeOpened(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.DISPUTE_OPENED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishDisputeClosed(
    organizationId: string,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.DISPUTE_CLOSED,
      organizationId,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }

  async publishWebhookUnresolved(
    payload: Record<string, unknown>,
    correlationId?: string,
  ): Promise<void> {
    await this.publish({
      type: BillingDomainEventType.WEBHOOK_UNRESOLVED,
      organizationId: null,
      occurredAt: new Date(),
      payload,
      correlationId,
    });
  }
}
