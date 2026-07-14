export type ConnectPaymentAuditSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type ConnectPaymentAuditCategory =
  | 'missing_booking'
  | 'missing_invoice'
  | 'deposit_in_amount'
  | 'fee_exceeds_amount'
  | 'paid_without_transaction'
  | 'paid_without_invoice_payment'
  | 'duplicate_payment_intent'
  | 'duplicate_checkout_session'
  | 'duplicate_stripe_event'
  | 'livemode_mismatch'
  | 'account_conflict'
  | 'booking_summary_mismatch'
  | 'refund_exceeds_paid'
  | 'fake_paid_candidate'
  | 'unresolved_webhook_account'
  | 'stuck_webhook'
  | 'processing_stuck';

export interface ConnectPaymentAuditFinding {
  category: ConnectPaymentAuditCategory;
  severity: ConnectPaymentAuditSeverity;
  organizationId: string | null;
  paymentRequestId: string | null;
  bookingId: string | null;
  invoiceId: string | null;
  stripeEventId: string | null;
  message: string;
  evidence: Record<string, string | number | boolean | null>;
}

export interface ConnectPaymentAuditReport {
  generatedAt: string;
  organizationId: string | null;
  findings: ConnectPaymentAuditFinding[];
  summary: {
    total: number;
    bySeverity: Record<ConnectPaymentAuditSeverity, number>;
    byCategory: Partial<Record<ConnectPaymentAuditCategory, number>>;
  };
}

export interface ConnectPaymentAuditOptions {
  organizationId?: string;
}
