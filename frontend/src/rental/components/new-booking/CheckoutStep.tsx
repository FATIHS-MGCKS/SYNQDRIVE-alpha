import { Banknote, CreditCard, FileText, Mail, Store } from 'lucide-react';
import { formatMoneyCents } from '../../../lib/money';
import type { TranslationKey } from '../../i18n/translations/en';
import { useLanguage } from '../../i18n/LanguageContext';
import { BookingStepCard } from './BookingStepCard';
import { CheckoutDocumentsPanel } from './CheckoutDocumentsPanel';
import { formatBookingAmount } from './format';
import { formatCheckoutExpiryDays, paymentIntentLabel } from './payment-intent';
import type { BookingPaymentIntent, CheckoutStepProps } from './types';

const PAYMENT_OPTIONS: Array<{
  id: BookingPaymentIntent;
  icon: typeof CreditCard;
}> = [
  { id: 'payment_link', icon: Mail },
  { id: 'pay_on_pickup', icon: Store },
  { id: 'cash', icon: Banknote },
  { id: 'invoice', icon: FileText },
];

function eligibilityReasonMessage(
  reason: string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const map: Record<string, TranslationKey> = {
    ORG_PAYMENTS_DISABLED: 'newBooking.paymentIntent.reason.paymentsDisabled',
    CONNECT_ACCOUNT_NOT_READY: 'newBooking.paymentIntent.reason.connectNotReady',
    MISSING_CUSTOMER_EMAIL: 'newBooking.paymentIntent.reason.missingEmail',
    PAYMENT_AMOUNT_UNAVAILABLE: 'newBooking.paymentIntent.reason.amountUnavailable',
  };
  return map[reason] ? t(map[reason]) : reason;
}

export function CheckoutStep({
  selectedCustomer,
  paymentIntent,
  onPaymentIntentChange,
  checkoutContext,
  checkoutContextLoading,
  checkoutContextError,
  discountPercent,
  onDiscountPercentChange,
  discountAmount,
  agbAccepted,
  privacyAccepted,
  onAgbAcceptedChange,
  onPrivacyAcceptedChange,
  orgId,
  draftBookingId,
  draftBundle,
  draftBundleLoading,
  draftBundleError,
  onRefreshDraftBundle,
  pricingCurrency,
  bookingPeriodLabel,
  wizardEligibilityPreview,
  canOverrideEligibility = false,
  eligibilityOverrideReason = '',
  onEligibilityOverrideReasonChange,
}: CheckoutStepProps) {
  const { t, locale } = useLanguage();
  const ccy = checkoutContext?.currency ?? pricingCurrency;
  const fmt = (value: number | null | undefined) =>
    ccy ? formatMoneyCents(value, ccy, locale === 'de' ? 'de-DE' : 'en-US') : '—';

  const paymentLinkEligible = checkoutContext?.paymentLinkEligibility.eligible === true;
  const paymentLinkReasons = checkoutContext?.paymentLinkEligibility.reasons ?? [];

  return (
    <div className="space-y-4">
      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">{t('newBooking.paymentIntent.title')}</h2>
          {checkoutContextLoading && (
            <p className="mb-3 text-xs text-muted-foreground">{t('newBooking.paymentIntent.loading')}</p>
          )}
          {checkoutContextError && (
            <p className="mb-3 text-xs text-[color:var(--status-watch)]">{checkoutContextError}</p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PAYMENT_OPTIONS.map((option) => {
              const isInvoiceDisabled = option.id === 'invoice' && selectedCustomer?.type !== 'Corporate';
              const isPaymentLinkDisabled = option.id === 'payment_link' && !paymentLinkEligible;
              const disabled = isInvoiceDisabled || isPaymentLinkDisabled;
              const selected = paymentIntent === option.id;
              const IconComponent = option.icon;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (!disabled) onPaymentIntentChange(option.id);
                  }}
                  disabled={disabled}
                  className={`rounded-lg border p-3.5 text-center transition-all ${
                    disabled
                      ? 'cursor-not-allowed border-border bg-muted/20 opacity-40'
                      : selected
                        ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]'
                        : 'border-border bg-muted/40 hover:border-border'
                  }`}
                >
                  <IconComponent
                    className={`mx-auto mb-1.5 h-5 w-5 ${
                      disabled
                        ? 'text-muted-foreground'
                        : selected
                          ? 'text-status-info'
                          : 'text-muted-foreground'
                    }`}
                  />
                  <p className="text-xs text-foreground">{paymentIntentLabel(option.id, t)}</p>
                  {isInvoiceDisabled && (
                    <p className="mt-1 text-[11px] text-[color:var(--status-watch)]">
                      {t('newBooking.paymentIntent.corporateOnly')}
                    </p>
                  )}
                  {isPaymentLinkDisabled && (
                    <p className="mt-1 text-[11px] text-[color:var(--status-watch)]">
                      {t('newBooking.paymentIntent.notAvailable')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {paymentIntent === 'payment_link' && checkoutContext && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-left">
              <p className="mb-3 text-sm font-medium text-foreground">
                {t('newBooking.paymentIntent.linkSummaryTitle')}
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('newBooking.paymentIntent.rentalAmount')}</span>
                  <span className="text-foreground">{fmt(checkoutContext.rentalAmountCents)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('newBooking.paymentIntent.onlineAmount')}</span>
                  <span className="text-right text-foreground">
                    {fmt(checkoutContext.onlineAmountCents)}
                    <span className="ml-1 text-muted-foreground">
                      ({t('newBooking.paymentIntent.excludingDeposit')})
                    </span>
                  </span>
                </div>
                {checkoutContext.rentalPaidCents > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t('newBooking.paymentIntent.rentalPaid')}</span>
                    <span className="text-[color:var(--status-positive)]">{fmt(checkoutContext.rentalPaidCents)}</span>
                  </div>
                )}
                {checkoutContext.depositAmountCents > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t('newBooking.paymentIntent.depositTotal')}</span>
                    <span className="text-foreground">{fmt(checkoutContext.depositAmountCents)}</span>
                  </div>
                )}
                {checkoutContext.depositPreauthorizedCents > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t('newBooking.paymentIntent.depositPreauthorized')}</span>
                    <span className="text-foreground">{fmt(checkoutContext.depositPreauthorizedCents)}</span>
                  </div>
                )}
                {checkoutContext.depositPaidCents > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t('newBooking.paymentIntent.depositPaid')}</span>
                    <span className="text-[color:var(--status-positive)]">{fmt(checkoutContext.depositPaidCents)}</span>
                  </div>
                )}
                {checkoutContext.depositDueAtPickupCents > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t('newBooking.paymentIntent.depositAtPickup')}</span>
                    <span className="text-[color:var(--status-watch)]">{fmt(checkoutContext.depositDueAtPickupCents)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('newBooking.paymentIntent.recipientEmail')}</span>
                  <span className="truncate text-foreground">{checkoutContext.recipientEmail ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('newBooking.paymentIntent.linkExpiry')}</span>
                  <span className="text-foreground">
                    {t('newBooking.paymentIntent.linkExpiryDays', {
                      days: formatCheckoutExpiryDays(checkoutContext.checkoutExpiresInSeconds),
                    })}
                  </span>
                </div>
              </div>
              <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                <p>{t('newBooking.paymentIntent.bookingConfirmedNote')}</p>
                <p>{t('newBooking.paymentIntent.paymentOpenNote')}</p>
              </div>
            </div>
          )}

          {paymentIntent === 'payment_link' && !paymentLinkEligible && paymentLinkReasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[color:var(--status-watch)]">
              {paymentLinkReasons.map((reason) => (
                <li key={reason}>• {eligibilityReasonMessage(reason, t)}</li>
              ))}
            </ul>
          )}

          {paymentIntent !== 'payment_link' && checkoutContext && checkoutContext.depositAmountCents > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-left">
              <p className="mb-2 text-sm font-medium text-foreground">{t('newBooking.paymentIntent.depositSummaryTitle')}</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('newBooking.paymentIntent.rentalAmount')}</span>
                  <span className="text-foreground">{fmt(checkoutContext.rentalAmountCents)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('newBooking.paymentIntent.depositDueAtPickup')}</span>
                  <span className="text-[color:var(--status-watch)]">{fmt(checkoutContext.depositDueAtPickupCents)}</span>
                </div>
              </div>
            </div>
          )}

          {paymentIntent === 'pay_on_pickup' && (
            <p className="mt-3 text-xs text-muted-foreground">{t('newBooking.paymentIntent.payOnPickupHint')}</p>
          )}
          {paymentIntent === 'cash' && (
            <p className="mt-3 text-xs text-muted-foreground">{t('newBooking.paymentIntent.cashHint')}</p>
          )}
          {paymentIntent === 'invoice' && (
            <p className="mt-3 text-xs text-muted-foreground">{t('newBooking.paymentIntent.invoiceHint')}</p>
          )}
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">{t('newBooking.discount.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {[0, 5, 10, 15, 20].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDiscountPercentChange(d)}
                className={`rounded-lg border px-3.5 py-1.5 text-xs transition-all ${discountPercent === d ? 'sq-tone-success border border-border' : 'border-border bg-muted/40 text-muted-foreground hover:border-border'}`}
              >
                {d}%
              </button>
            ))}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
              <input
                type="number"
                min={0}
                max={100}
                placeholder={t('newBooking.discount.custom')}
                value={![0, 5, 10, 15, 20].includes(discountPercent) ? discountPercent : ''}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                  onDiscountPercentChange(val);
                }}
                className="w-16 bg-transparent text-center text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          {discountPercent > 0 && ccy && (
            <p className="mt-2 text-xs text-[color:var(--status-positive)]">
              {t('newBooking.discount.savings', { amount: formatBookingAmount(discountAmount, ccy) })}
            </p>
          )}
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">{t('newBooking.documents.title')}</h2>
          <CheckoutDocumentsPanel
            orgId={orgId}
            bookingId={draftBookingId}
            customerEmail={selectedCustomer?.email}
            customerName={
              selectedCustomer
                ? selectedCustomer.name?.trim() ||
                  selectedCustomer.company?.trim() ||
                  null
                : null
            }
            bookingPeriodLabel={bookingPeriodLabel}
            bundle={draftBundle}
            loading={draftBundleLoading}
            error={draftBundleError}
            onRefresh={onRefreshDraftBundle}
          />
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">{t('newBooking.confirmations.title')}</h2>
          {wizardEligibilityPreview?.status === 'MANUAL_APPROVAL_REQUIRED' && (
            <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Manuelle Freigabe erforderlich</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Die finale Buchungsfreigabe erfolgt serverseitig beim Abschluss. Bei Ausnahmen bitte eine Begründung hinterlegen.
              </p>
              {canOverrideEligibility ? (
                <textarea
                  value={eligibilityOverrideReason}
                  onChange={(e) => onEligibilityOverrideReasonChange?.(e.target.value)}
                  placeholder="Begründung für manuelle Freigabe"
                  className="w-full min-h-[72px] rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              ) : (
                <p className="text-xs text-[color:var(--status-watch)]">
                  Keine Berechtigung für Eligibility-Ausnahmen — die Buchung kann nur als offene Anfrage gespeichert werden, sofern erlaubt.
                </p>
              )}
            </div>
          )}
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agbAccepted}
                onChange={(e) => onAgbAcceptedChange(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-foreground">
                {t('newBooking.confirmations.agbPrefix')}{' '}
                <span className="text-status-info underline">{t('newBooking.confirmations.agbLink')}</span>{' '}
                {t('newBooking.confirmations.agbSuffix')}
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => onPrivacyAcceptedChange(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-foreground">
                {t('newBooking.confirmations.privacyPrefix')}{' '}
                <span className="text-status-info underline">{t('newBooking.confirmations.privacyLink')}</span>{' '}
                {t('newBooking.confirmations.privacySuffix')}
              </span>
            </label>
          </div>
        </div>
      </BookingStepCard>
    </div>
  );
}
