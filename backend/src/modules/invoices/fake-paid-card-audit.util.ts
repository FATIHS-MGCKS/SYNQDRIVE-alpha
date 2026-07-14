import type {
  FakePaidConfidence,
  FakePaidPaymentEvaluationInput,
  FakePaidPaymentEvaluationResult,
} from './fake-paid-card-audit.types';

/** Auto-generated note from the pre-fix booking checkout card path. */
export const AUTO_BOOKING_PREPAY_NOTE = 'Buchungsbestätigung — Vorauszahlung';

/** Payments created within this window of booking confirmation are timing-correlated. */
export const BOOKING_CONFIRM_TIMING_WINDOW_MS = 5 * 60 * 1000;

const STRIPE_REFERENCE_PATTERN = /^(pi_|ch_|cs_|py_|txn_|in_)/i;

export function looksLikeStripeReference(reference: string | null | undefined): boolean {
  const ref = reference?.trim() ?? '';
  if (!ref) return false;
  if (STRIPE_REFERENCE_PATTERN.test(ref)) return true;
  return ref.toLowerCase().startsWith('stripe:');
}

export function isCardLikeWithoutProof(method: string, reference: string | null | undefined): boolean {
  if (method !== 'CARD' && method !== 'STRIPE') return false;
  return !looksLikeStripeReference(reference);
}

export function isBookingConfirmTimingCorrelated(
  paymentCreatedAt: Date,
  bookingUpdatedAt: Date | null,
  windowMs = BOOKING_CONFIRM_TIMING_WINDOW_MS,
): boolean {
  if (!bookingUpdatedAt) return false;
  return Math.abs(paymentCreatedAt.getTime() - bookingUpdatedAt.getTime()) <= windowMs;
}

export function hasExactAutoBookingPrepayNote(note: string | null | undefined): boolean {
  return (note?.trim() ?? '') === AUTO_BOOKING_PREPAY_NOTE;
}

export function evaluateFakePaidCardPayment(
  input: FakePaidPaymentEvaluationInput,
): FakePaidPaymentEvaluationResult {
  const reasons: string[] = [];

  if (!isCardLikeWithoutProof(input.paymentMethod, input.paymentReference)) {
    return { isCandidate: false, confidence: null, reasons: [] };
  }

  reasons.push(`OrgInvoicePayment.method=${input.paymentMethod} without Stripe reference`);

  if (looksLikeStripeReference(input.paymentReference)) {
    return { isCandidate: false, confidence: null, reasons: [] };
  }

  const exactAutoNote = hasExactAutoBookingPrepayNote(input.paymentNote);
  const timingCorrelated = isBookingConfirmTimingCorrelated(
    input.paymentCreatedAt,
    input.bookingUpdatedAt,
  );
  const manualAudit = input.hasManualPaymentActivityLog;

  if (exactAutoNote) {
    reasons.push('Payment note matches auto-generated booking-checkout prepay text');
  }

  if (timingCorrelated) {
    reasons.push('Payment created within 5 minutes of linked booking update (confirmation window)');
  } else if (input.bookingUpdatedAt) {
    reasons.push('Payment timing does not correlate with booking confirmation window');
  } else {
    reasons.push('Linked booking update timestamp unavailable for timing correlation');
  }

  if (manualAudit) {
    reasons.push('Manual invoice payment API activity log found near payment time — may be legitimate staff action');
  } else {
    reasons.push('No manual invoice payment API activity log near payment time');
  }

  reasons.push('No Stripe PaymentIntent/Charge reference on payment record');
  reasons.push('No bank-transfer or cash payment method — card-like method only');

  let confidence: FakePaidConfidence;

  if (exactAutoNote && timingCorrelated && !manualAudit) {
    confidence = 'HIGH';
  } else if (manualAudit && !exactAutoNote) {
    confidence = 'LOW';
  } else if (exactAutoNote || timingCorrelated) {
    confidence = manualAudit ? 'LOW' : 'MEDIUM';
  } else {
    confidence = 'LOW';
  }

  return { isCandidate: true, confidence, reasons };
}

export function buildHumanSummary(report: {
  organizationId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  summary: {
    paymentsScanned: number;
    candidatesTotal: number;
    high: number;
    medium: number;
    low: number;
  };
}): string {
  const scope = report.organizationId ? `org ${report.organizationId}` : 'all organizations';
  const range =
    report.dateFrom || report.dateTo
      ? ` (${report.dateFrom ?? '…'} – ${report.dateTo ?? '…'})`
      : '';
  const { summary } = report;

  return [
    `Read-only fake-PAID card audit — ${scope}${range}`,
    `Scanned ${summary.paymentsScanned} card/stripe booking payment(s).`,
    `Found ${summary.candidatesTotal} suspect candidate(s): HIGH=${summary.high}, MEDIUM=${summary.medium}, LOW=${summary.low}.`,
    'No data was modified. Review LOW confidence rows manually before any remediation.',
  ].join(' ');
}
