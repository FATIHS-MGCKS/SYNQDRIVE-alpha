import type { TranslationKey } from '../../i18n/translations/en';

export type BookingPaymentRequestStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'LINK_PENDING'
  | 'CHECKOUT_READY'
  | 'LINK_SENT'
  | 'PROCESSING'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

export type BookingPaymentSuccessScenario =
  | 'full_success'
  | 'email_failed'
  | 'request_failed'
  | 'non_payment_link';

export interface BookingPaymentRequestDto {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  currency: string;
  depositInfoCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  sendEmailOnLink: boolean;
  sendAttemptCount: number;
  lastSentAt: string | null;
  lastEmailErrorMessage: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
}

export interface BookingPaymentCardRequestDto {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  currency: string;
  depositAmountCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  lastSentAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  sendAttemptCount: number;
  lastEmailErrorMessage: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  paymentMethodLabel: string | null;
  refundStatus: 'NONE' | 'PARTIAL' | 'FULL';
  disputeStatus: 'NONE' | 'OPEN';
}

export interface BookingPaymentCardDto {
  enabled: boolean;
  summary: {
    bookingPaymentStatus: string;
    paymentIntent: string | null;
  };
  primaryRequest: BookingPaymentCardRequestDto | null;
  requests: BookingPaymentCardRequestDto[];
  invoice: {
    id: string;
    invoiceNumber: string | null;
    status: string;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
  } | null;
}

const STATUS_I18N: Record<string, TranslationKey> = {
  DRAFT: 'bookingPayment.status.draft',
  OPEN: 'bookingPayment.status.open',
  LINK_PENDING: 'bookingPayment.status.linkPending',
  CHECKOUT_READY: 'bookingPayment.status.checkoutReady',
  LINK_SENT: 'bookingPayment.status.linkSent',
  PROCESSING: 'bookingPayment.status.processing',
  PAID: 'bookingPayment.status.paid',
  PARTIALLY_REFUNDED: 'bookingPayment.status.partiallyRefunded',
  REFUNDED: 'bookingPayment.status.refunded',
  FAILED: 'bookingPayment.status.failed',
  CANCELLED: 'bookingPayment.status.cancelled',
  EXPIRED: 'bookingPayment.status.expired',
  DISPUTED: 'bookingPayment.status.disputed',
  UNPAID: 'bookingPayment.status.unpaid',
  PENDING: 'bookingPayment.status.pending',
  PARTIALLY_PAID: 'bookingPayment.status.partiallyPaid',
};

export function paymentRequestStatusLabel(
  status: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!status) return t('bookingPayment.status.unknown');
  const key = STATUS_I18N[status.toUpperCase()];
  return key ? t(key) : status;
}

export function paymentRequestStatusTone(
  status: string | null | undefined,
): 'positive' | 'watch' | 'negative' | 'neutral' {
  const s = status?.toUpperCase();
  if (s === 'PAID' || s === 'REFUNDED') return 'positive';
  if (s === 'FAILED' || s === 'DISPUTED' || s === 'EXPIRED') return 'negative';
  if (s === 'LINK_SENT' || s === 'CHECKOUT_READY' || s === 'PROCESSING' || s === 'OPEN') return 'watch';
  return 'neutral';
}

export function canResendPaymentLink(status: string): boolean {
  return ['CHECKOUT_READY', 'LINK_SENT', 'EXPIRED'].includes(status.toUpperCase());
}

export function canCancelPaymentRequest(status: string): boolean {
  return ['DRAFT', 'OPEN', 'LINK_PENDING', 'CHECKOUT_READY', 'LINK_SENT', 'EXPIRED', 'FAILED'].includes(
    status.toUpperCase(),
  );
}

export function canCopyPaymentLink(request: { checkoutUrl: string | null; status: string }): boolean {
  return !!request.checkoutUrl && !['PAID', 'CANCELLED', 'REFUNDED'].includes(request.status.toUpperCase());
}

export function resolvePaymentSuccessScenario(params: {
  paymentIntent: string | null | undefined;
  paymentRequestCreated?: boolean;
  partialFailures?: Array<{ step: string }>;
  liveRequest?: BookingPaymentRequestDto | null;
}): BookingPaymentSuccessScenario {
  if (params.paymentIntent !== 'payment_link') return 'non_payment_link';
  if (!params.paymentRequestCreated && !params.liveRequest) return 'request_failed';
  const emailFailed = params.partialFailures?.some((f) => f.step === 'email');
  const liveEmailFailed =
    !!params.liveRequest?.lastEmailErrorMessage
    && !params.liveRequest?.lastSentAt
    && ['CHECKOUT_READY', 'LINK_SENT', 'OPEN'].includes(params.liveRequest.status.toUpperCase());
  if (emailFailed || liveEmailFailed) return 'email_failed';
  return 'full_success';
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
