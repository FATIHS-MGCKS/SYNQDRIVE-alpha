import type { BookingPaymentRequestDto as ApiBookingPaymentRequestDto } from '../../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';

export type BookingPaymentRequestDto = ApiBookingPaymentRequestDto;

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
  | 'checkout_ready'
  | 'email_failed'
  | 'request_failed'
  | 'non_payment_link'
  | 'paid'
  | 'expired';

export interface BookingPaymentCardRequestDto {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  refundableAmountCents: number;
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

export function canRefundPaymentRequest(request: {
  status: string;
  refundableAmountCents?: number;
  disputeStatus?: 'NONE' | 'OPEN';
}): boolean {
  const status = request.status.toUpperCase();
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(status)) return false;
  if (request.disputeStatus === 'OPEN' || status === 'DISPUTED') return false;
  return (request.refundableAmountCents ?? 0) > 0;
}

const CHECKOUT_READY_STATUSES = new Set([
  'CHECKOUT_READY',
  'LINK_SENT',
  'LINK_PENDING',
  'PROCESSING',
  'OPEN',
]);

export function formatPaymentTimestamp(
  iso: string | null | undefined,
  locale: 'de' | 'en',
): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function resolvePaymentSuccessMessageKey(
  scenario: BookingPaymentSuccessScenario,
): TranslationKey {
  const keyMap: Record<BookingPaymentSuccessScenario, TranslationKey> = {
    full_success: 'bookingPayment.success.full',
    checkout_ready: 'bookingPayment.success.checkoutReady',
    email_failed: 'bookingPayment.success.emailFailed',
    request_failed: 'bookingPayment.success.requestFailed',
    non_payment_link: 'bookingPayment.success.nonLink',
    paid: 'bookingPayment.success.paid',
    expired: 'bookingPayment.success.expired',
  };
  return keyMap[scenario];
}

export function resolvePaymentSuccessScenario(params: {
  paymentIntent: string | null | undefined;
  paymentRequestCreated?: boolean;
  checkoutCreated?: boolean;
  emailQueued?: boolean;
  partialFailures?: Array<{ step: string }>;
  liveRequest?: BookingPaymentRequestDto | null;
}): BookingPaymentSuccessScenario {
  if (params.paymentIntent !== 'payment_link') return 'non_payment_link';

  const liveStatus = params.liveRequest?.status?.toUpperCase() ?? '';
  if (liveStatus === 'PAID') return 'paid';
  if (liveStatus === 'EXPIRED') return 'expired';

  const hasPaymentRequest = Boolean(params.paymentRequestCreated || params.liveRequest);
  if (!hasPaymentRequest) return 'request_failed';

  const hasCheckout =
    Boolean(params.checkoutCreated)
    || Boolean(params.liveRequest?.checkoutUrl)
    || CHECKOUT_READY_STATUSES.has(liveStatus);
  if (!hasCheckout) return 'request_failed';

  const emailFailed = params.partialFailures?.some((failure) => failure.step === 'email');
  const liveEmailFailed =
    !!params.liveRequest?.lastEmailErrorMessage
    && !params.liveRequest?.lastSentAt
    && CHECKOUT_READY_STATUSES.has(liveStatus);
  if (emailFailed || liveEmailFailed) return 'email_failed';

  const emailSent =
    Boolean(params.liveRequest?.lastSentAt)
    || (Boolean(params.emailQueued) && Boolean(params.checkoutCreated) && !emailFailed);
  if (emailSent) return 'full_success';

  return 'checkout_ready';
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
