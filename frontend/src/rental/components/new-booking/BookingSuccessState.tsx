import { useCallback, useEffect, useState } from 'react';
import type { VehicleData } from '../../data/vehicles';
import { api, type BookingDocumentBundleView } from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import type { TranslationKey } from '../../i18n/translations/en';
import { useLanguage } from '../../i18n/LanguageContext';
import { buildMMY } from '../../lib/vehicleMmy';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import { CheckoutDocumentsPanel } from './CheckoutDocumentsPanel';
import { formatBookingAmount } from './format';
import { formatCheckoutExpiryDays, paymentIntentLabel } from './payment-intent';
import type { BookingCustomer, BookingPaymentIntent } from './types';

export interface BookingSuccessAutoSendResult {
  sent: boolean;
  reason?: string;
  error?: string;
}

export interface BookingSuccessPaymentFlow {
  intent: 'payment_link';
  bookingConfirmed: boolean;
  paymentRequestCreated: boolean;
  paymentRequestId?: string;
  checkoutCreated: boolean;
  checkoutUrl?: string;
  emailQueued: boolean;
  partialFailures: Array<{ step: string; message: string }>;
}

export interface BookingSuccessStateProps {
  orgId: string;
  bookingId: string | null;
  selectedCustomer: BookingCustomer | null;
  selectedVehicle: VehicleData | null;
  rentalDays: number;
  grandTotal: number | null;
  pricingCurrency: string | null;
  bookingRef?: string | null;
  redirectCountdown: number | null;
  initialBundle?: BookingDocumentBundleView | null;
  autoSend?: BookingSuccessAutoSendResult | null;
  paymentIntent?: BookingPaymentIntent | null;
  paymentFlow?: BookingSuccessPaymentFlow | null;
  checkoutOnlineAmountCents?: number | null;
  checkoutDepositAmountCents?: number | null;
  checkoutCurrency?: string | null;
  onBack: () => void;
  onNewBooking: () => void;
}

function partialFailureLabel(
  step: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const map: Record<string, TranslationKey> = {
    payment_request: 'newBooking.success.partial.paymentRequest',
    checkout: 'newBooking.success.partial.checkout',
    email: 'newBooking.success.partial.email',
  };
  return map[step] ? t(map[step]) : step;
}

export function BookingSuccessState({
  orgId,
  bookingId,
  selectedCustomer,
  selectedVehicle,
  rentalDays,
  grandTotal,
  pricingCurrency,
  bookingRef,
  redirectCountdown,
  initialBundle = null,
  autoSend = null,
  paymentIntent = null,
  paymentFlow = null,
  checkoutOnlineAmountCents = null,
  checkoutDepositAmountCents = null,
  checkoutCurrency = null,
  onBack,
  onNewBooking,
}: BookingSuccessStateProps) {
  const { t, locale } = useLanguage();
  const refLabel = bookingRef
    ? t('newBooking.success.refLabel', { ref: bookingRef })
    : t('newBooking.success.created');
  const [bundle, setBundle] = useState<BookingDocumentBundleView | null>(initialBundle);
  const [bundleLoading, setBundleLoading] = useState(false);

  const displayCurrency = checkoutCurrency ?? pricingCurrency;
  const fmtCents = (cents: number | null | undefined) =>
    displayCurrency
      ? formatMoneyCents(cents, displayCurrency, locale === 'de' ? 'de-DE' : 'en-US')
      : '—';

  const refreshBundle = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setBundleLoading(true);
    try {
      const view = await api.documents.listForBooking(orgId, bookingId);
      setBundle(view);
    } finally {
      setBundleLoading(false);
    }
  }, [orgId, bookingId]);

  useEffect(() => {
    if (!orgId || !bookingId) return;
    if (autoSend?.sent) {
      const timer = setTimeout(() => void refreshBundle(), 1500);
      return () => clearTimeout(timer);
    }
    if (!initialBundle) void refreshBundle();
  }, [orgId, bookingId, autoSend?.sent, initialBundle, refreshBundle]);

  const hasPartialFailures = (paymentFlow?.partialFailures?.length ?? 0) > 0;
  const paymentOpen =
    paymentIntent === 'payment_link' ||
    paymentIntent === 'pay_on_pickup' ||
    paymentIntent === 'invoice' ||
    paymentIntent === 'cash';

  return (
    <div className="flex items-center justify-center py-8">
      <BookingStepCard>
        <div className="max-w-lg p-8 text-center sm:p-10">
          <div
            className={`mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full ${
              hasPartialFailures ? 'sq-tone-watch' : 'sq-tone-success'
            }`}
          >
            <Icon
              name={hasPartialFailures ? 'alert-circle' : 'check-circle'}
              className={`h-5 w-5 ${
                hasPartialFailures
                  ? 'text-[color:var(--status-watch)]'
                  : 'text-[color:var(--status-positive)]'
              }`}
            />
          </div>
          <h2 className="mb-2 text-lg text-foreground">{t('newBooking.success.title')}</h2>
          <p className="mb-2 text-xs text-muted-foreground">{refLabel}</p>

          {paymentIntent && (
            <p className="mb-2 text-xs text-foreground">
              {t('newBooking.success.paymentIntent', {
                intent: paymentIntentLabel(paymentIntent, t),
              })}
            </p>
          )}

          {paymentIntent === 'payment_link' && paymentFlow && (
            <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-left text-xs">
              <p className="mb-2 font-medium text-foreground">{t('newBooking.success.paymentLinkStatus')}</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>
                  {paymentFlow.bookingConfirmed
                    ? `✓ ${t('newBooking.success.step.bookingConfirmed')}`
                    : `✗ ${t('newBooking.success.step.bookingConfirmed')}`}
                </li>
                <li>
                  {paymentFlow.paymentRequestCreated
                    ? `✓ ${t('newBooking.success.step.paymentRequest')}`
                    : `✗ ${t('newBooking.success.step.paymentRequest')}`}
                </li>
                <li>
                  {paymentFlow.checkoutCreated
                    ? `✓ ${t('newBooking.success.step.checkout')}`
                    : `✗ ${t('newBooking.success.step.checkout')}`}
                </li>
                <li>
                  {paymentFlow.emailQueued
                    ? `✓ ${t('newBooking.success.step.emailSent')}`
                    : `○ ${t('newBooking.success.step.emailPending')}`}
                </li>
              </ul>
              {checkoutOnlineAmountCents != null && (
                <div className="mt-2 border-t border-border pt-2">
                  <div className="flex justify-between gap-2">
                    <span>{t('newBooking.paymentIntent.onlineAmount')}</span>
                    <span className="text-foreground">
                      {fmtCents(checkoutOnlineAmountCents)}
                      <span className="ml-1 text-muted-foreground">
                        ({t('newBooking.paymentIntent.excludingDeposit')})
                      </span>
                    </span>
                  </div>
                  {(checkoutDepositAmountCents ?? 0) > 0 && (
                    <div className="mt-1 flex justify-between gap-2">
                      <span>{t('newBooking.paymentIntent.depositAtPickup')}</span>
                      <span className="text-foreground">{fmtCents(checkoutDepositAmountCents)}</span>
                    </div>
                  )}
                </div>
              )}
              {paymentOpen && (
                <p className="mt-2 text-[color:var(--status-watch)]">
                  {t('newBooking.success.paymentOpen')}
                </p>
              )}
            </div>
          )}

          {hasPartialFailures && (
            <div className="mb-3 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/10 p-3 text-left">
              <p className="mb-1 text-xs font-medium text-[color:var(--status-watch)]">
                {t('newBooking.success.partial.title')}
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {paymentFlow?.partialFailures.map((failure) => (
                  <li key={`${failure.step}-${failure.message}`}>
                    • {partialFailureLabel(failure.step, t)}: {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {autoSend?.sent && (
            <p className="mb-2 text-xs text-[color:var(--status-positive)]">
              {t('newBooking.success.documentsSent', { email: selectedCustomer?.email ?? '' })}
            </p>
          )}
          {autoSend && !autoSend.sent && autoSend.reason === 'NO_CUSTOMER_EMAIL' && (
            <p className="mb-2 text-xs text-[color:var(--status-watch)]">
              {t('newBooking.success.noCustomerEmail')}
            </p>
          )}
          {redirectCountdown !== null && redirectCountdown > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">
              {t('newBooking.success.redirect', { seconds: redirectCountdown })}
            </p>
          )}
          <div className="mb-4 space-y-2 rounded-lg bg-muted/50 p-4 text-left">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('newBooking.success.customer')}</span>
              <span className="text-foreground">{selectedCustomer?.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('newBooking.success.vehicle')}</span>
              <span className="text-foreground">{selectedVehicle ? buildMMY(selectedVehicle) : '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t('newBooking.success.period')}</span>
              <span className="text-foreground">
                {t('newBooking.success.days', { count: rentalDays })}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-xs">
              <span className="text-muted-foreground">{t('newBooking.success.total')}</span>
              <span className="text-[color:var(--status-positive)]">
                {pricingCurrency ? formatBookingAmount(grandTotal, pricingCurrency) : '—'}
              </span>
            </div>
          </div>

          {bookingId && (
            <div className="mb-4 text-left">
              <h3 className="mb-2 text-sm text-muted-foreground">{t('newBooking.documents.title')}</h3>
              <CheckoutDocumentsPanel
                orgId={orgId}
                bookingId={bookingId}
                customerEmail={selectedCustomer?.email}
                bundle={bundle}
                loading={bundleLoading && !bundle}
                onRefresh={() => void refreshBundle()}
                showBulkSend
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-lg border border-border surface-premium px-3 py-2 text-xs text-foreground transition-all hover:bg-muted"
            >
              {t('newBooking.success.backToOverview')}
            </button>
            <button
              type="button"
              onClick={onNewBooking}
              className="sq-3d-btn sq-3d-btn--primary flex-1 px-3 py-2 text-xs"
            >
              {t('newBooking.success.newBooking')}
            </button>
          </div>
        </div>
      </BookingStepCard>
    </div>
  );
}
