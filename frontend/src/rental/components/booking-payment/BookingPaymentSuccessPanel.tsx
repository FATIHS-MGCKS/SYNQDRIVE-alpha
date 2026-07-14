import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { formatMoneyCents, normalizeCurrencyCode } from '../../../lib/money';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import type { BookingSuccessPaymentFlow } from '../new-booking/BookingSuccessState';
import {
  canCopyPaymentLink,
  canResendPaymentLink,
  copyTextToClipboard,
  formatPaymentTimestamp,
  paymentRequestStatusLabel,
  paymentRequestStatusTone,
  resolvePaymentSuccessMessageKey,
  resolvePaymentSuccessScenario,
  type BookingPaymentRequestDto,
} from './booking-payment-status.utils';

export interface BookingPaymentSuccessPanelProps {
  orgId: string;
  bookingId: string;
  paymentFlow: BookingSuccessPaymentFlow | null;
  checkoutOnlineAmountCents?: number | null;
  checkoutDepositAmountCents?: number | null;
  checkoutCurrency?: string | null;
  onViewBooking?: (bookingId: string) => void;
}

function toneClass(tone: ReturnType<typeof paymentRequestStatusTone>): string {
  switch (tone) {
    case 'positive':
      return 'text-[color:var(--status-positive)]';
    case 'watch':
      return 'text-[color:var(--status-watch)]';
    case 'negative':
      return 'text-[color:var(--status-negative)]';
    default:
      return 'text-muted-foreground';
  }
}

export function BookingPaymentSuccessPanel({
  orgId,
  bookingId,
  paymentFlow,
  checkoutOnlineAmountCents,
  checkoutDepositAmountCents,
  checkoutCurrency,
  onViewBooking,
}: BookingPaymentSuccessPanelProps) {
  const { t, locale } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const [liveRequest, setLiveRequest] = useState<BookingPaymentRequestDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  const canRead = hasPermission('payments', 'read');
  const canResend = hasPermission('payments', 'write');

  const refresh = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    try {
      const list = await api.bookingPaymentRequests.list(orgId, bookingId);
      const match = paymentFlow?.paymentRequestId
        ? list.find((r) => r.id === paymentFlow.paymentRequestId) ?? list[0]
        : list[0];
      setLiveRequest(match ?? null);
    } catch {
      setLiveRequest(null);
    } finally {
      setLoading(false);
    }
  }, [canRead, orgId, bookingId, paymentFlow?.paymentRequestId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const scenario = resolvePaymentSuccessScenario({
    paymentIntent: 'payment_link',
    paymentRequestCreated: paymentFlow?.paymentRequestCreated,
    checkoutCreated: paymentFlow?.checkoutCreated,
    emailQueued: paymentFlow?.emailQueued,
    partialFailures: paymentFlow?.partialFailures,
    liveRequest,
  });

  const checkoutUrl = liveRequest?.checkoutUrl ?? paymentFlow?.checkoutUrl ?? null;
  const currency =
    normalizeCurrencyCode(liveRequest?.currency)
    ?? normalizeCurrencyCode(checkoutCurrency)
    ?? '';
  const fmt = (cents: number | null | undefined) =>
    formatMoneyCents(cents, currency, locale === 'de' ? 'de-DE' : 'en-US');

  const handleCopy = async () => {
    if (!checkoutUrl) return;
    const ok = await copyTextToClipboard(checkoutUrl);
    toast[ok ? 'success' : 'error'](
      ok ? t('bookingPayment.action.linkCopied') : t('bookingPayment.action.linkCopyFailed'),
    );
  };

  const handleResend = async () => {
    if (!liveRequest || !canResend) return;
    setResending(true);
    try {
      await api.bookingPaymentRequests.resend(orgId, bookingId, liveRequest.id);
      toast.success(t('bookingPayment.action.resendQueued'));
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('bookingPayment.action.resendFailed'));
    } finally {
      setResending(false);
    }
  };

  const status = liveRequest?.status ?? (paymentFlow?.checkoutCreated ? 'CHECKOUT_READY' : 'OPEN');
  const tone = paymentRequestStatusTone(status);

  const dateLocale = locale === 'de' ? 'de' : 'en';

  const expiryLabel = formatPaymentTimestamp(liveRequest?.checkoutExpiresAt, dateLocale);

  const renderScenarioMessage = () => t(resolvePaymentSuccessMessageKey(scenario));

  return (
    <section
      className="mb-4 rounded-lg border border-border bg-muted/40 p-4 text-left"
      aria-labelledby="booking-payment-success-title"
    >
      <h3 id="booking-payment-success-title" className="mb-2 text-sm font-medium text-foreground">
        {t('bookingPayment.success.title')}
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">{renderScenarioMessage()}</p>

      {loading ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t('bookingPayment.loading')}
        </p>
      ) : (
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('bookingPayment.field.status')}</dt>
            <dd className={`font-medium ${toneClass(tone)}`} aria-live="polite">
              {paymentRequestStatusLabel(status, t)}
            </dd>
          </div>
          {checkoutOnlineAmountCents != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('newBooking.paymentIntent.onlineAmount')}</dt>
              <dd className="text-foreground">
                {fmt(checkoutOnlineAmountCents)}
                <span className="ml-1 text-muted-foreground">
                  ({t('newBooking.paymentIntent.excludingDeposit')})
                </span>
              </dd>
            </div>
          )}
          {(checkoutDepositAmountCents ?? 0) > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('newBooking.paymentIntent.depositAtPickup')}</dt>
              <dd className="text-foreground">{fmt(checkoutDepositAmountCents)}</dd>
            </div>
          )}
          {scenario !== 'request_failed' && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('bookingPayment.field.amountOpen')}</dt>
              <dd className="text-foreground">
                {fmt(liveRequest?.openAmountCents ?? checkoutOnlineAmountCents)}
              </dd>
            </div>
          )}
          {expiryLabel && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('bookingPayment.field.linkExpiry')}</dt>
              <dd className="text-foreground">{expiryLabel}</dd>
            </div>
          )}
          {liveRequest?.lastSentAt && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('bookingPayment.field.sentAt')}</dt>
              <dd className="text-foreground">
                {formatPaymentTimestamp(liveRequest.lastSentAt, dateLocale) ?? '—'}
              </dd>
            </div>
          )}
          {scenario === 'email_failed' && liveRequest?.lastEmailErrorMessage && (
            <div className="rounded-md bg-[color:var(--status-watch)]/10 p-2 text-[color:var(--status-watch)]" role="alert">
              {t('bookingPayment.success.emailErrorDetail')}: {liveRequest.lastEmailErrorMessage}
            </div>
          )}
        </dl>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {checkoutUrl && canCopyPaymentLink({ checkoutUrl, status }) && (
          <>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sq-3d-btn sq-3d-btn--primary inline-flex min-h-10 items-center justify-center gap-1.5 px-3 py-2 text-xs"
            >
              <Icon name="external-link" className="h-3.5 w-3.5" aria-hidden />
              {t('bookingPayment.action.openLink')}
            </a>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-muted"
            >
              <Icon name="copy" className="h-3.5 w-3.5" aria-hidden />
              {t('bookingPayment.action.copyLink')}
            </button>
          </>
        )}
        {scenario === 'email_failed' && liveRequest && canResendPaymentLink(liveRequest.status) && canResend && (
          <button
            type="button"
            disabled={resending}
            onClick={() => void handleResend()}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Icon name="mail" className="h-3.5 w-3.5" aria-hidden />
            {resending ? t('bookingPayment.action.resending') : t('bookingPayment.action.resendLink')}
          </button>
        )}
        {onViewBooking && (
          <button
            type="button"
            onClick={() => onViewBooking(bookingId)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-muted"
          >
            <Icon name="arrow-right" className="h-3.5 w-3.5" aria-hidden />
            {t('bookingPayment.action.viewBooking')}
          </button>
        )}
      </div>
    </section>
  );
}
