/**
 * Billing domain events — emitted for downstream handlers (audit, workflows, email).
 * The publisher does NOT send email directly.
 */

export const BillingDomainEventType = {
  SUBSCRIPTION_SYNCED: 'billing.subscription.synced',
  SUBSCRIPTION_STATUS_CHANGED: 'billing.subscription.status_changed',
  INVOICE_MIRRORED: 'billing.invoice.mirrored',
  PAYMENT_METHOD_SYNCED: 'billing.payment_method.synced',
  PAYMENT_RECORDED: 'billing.payment.recorded',
  REFUND_RECORDED: 'billing.refund.recorded',
  CREDIT_NOTE_RECORDED: 'billing.credit_note.recorded',
  DISPUTE_OPENED: 'billing.dispute.opened',
  DISPUTE_CLOSED: 'billing.dispute.closed',
  WEBHOOK_UNRESOLVED: 'billing.webhook.unresolved_mapping',
  PRICE_VERSION_PUBLISHED: 'billing.price_version.published',
  USAGE_SNAPSHOT_CREATED: 'billing.usage_snapshot.created',
  CONTRACT_RESOLVED: 'billing.contract.resolved',
} as const;

export type BillingDomainEventType =
  (typeof BillingDomainEventType)[keyof typeof BillingDomainEventType];

export interface BillingDomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  type: BillingDomainEventType;
  organizationId: string | null;
  occurredAt: Date;
  payload: TPayload;
  correlationId?: string;
  actorUserId?: string | null;
}
