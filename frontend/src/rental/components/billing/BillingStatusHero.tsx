import type { BillingSummaryDto } from '../../types/billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  paymentMethodLabel,
  subscriptionStatusLabel,
} from './billing.utils';
import { Icon } from '../ui/Icon';

interface BillingStatusHeroProps {
  summary: BillingSummaryDto;
  stripePortalPrepared?: boolean;
}

export function BillingStatusHero({ summary, stripePortalPrepared = true }: BillingStatusHeroProps) {
  const currency = summary.priceBook?.currency ?? summary.nextInvoicePreview.currency ?? 'EUR';
  const pm = summary.paymentMethod;
  const pmLabel = pm.exists
    ? pm.brand && pm.last4
      ? `${paymentMethodLabel(pm.type)} · ${pm.brand} •••• ${pm.last4}`
      : paymentMethodLabel(pm.type)
    : 'Nicht hinterlegt';

  const facts = [
    {
      label: 'Status',
      value: subscriptionStatusLabel(summary.subscriptionStatus),
    },
    {
      label: 'Abrechnungszeitraum',
      value: `${formatDateDe(summary.currentPeriodStart)} – ${formatDateDe(summary.currentPeriodEnd)}`,
    },
    {
      label: 'Nächste Rechnung',
      value:
        summary.calculationStatus === 'OK' && summary.nextInvoicePreview.totalCents != null
          ? formatMoneyCents(summary.nextInvoicePreview.totalCents, currency)
          : 'Nicht berechenbar',
      hint: summary.nextInvoicePreview.explanation,
    },
    {
      label: 'Abrechenbare Fahrzeuge',
      value: String(summary.billableVehicleCount),
      hint: `${summary.connectedVehicleCount} verbunden`,
    },
    {
      label: 'Zahlungsmethode',
      value: pmLabel,
    },
  ];

  const showPaymentWarning = summary.warnings.includes('PAYMENT_METHOD_MISSING');
  const showPriceWarning =
    summary.warnings.includes('PRICE_NOT_CONFIGURED') ||
    summary.warnings.includes('NO_ACTIVE_PRICE_VERSION');

  return (
    <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)] space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
              {fact.label}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate">
              {fact.value}
            </p>
            {fact.hint && (
              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{fact.hint}</p>
            )}
          </div>
        ))}
      </div>

      {(showPaymentWarning || showPriceWarning) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
          {showPaymentWarning && (
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 flex items-start gap-3">
              <div className="sq-tone-warning w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
                <Icon name="credit-card" className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  Es ist noch keine Zahlungsmethode hinterlegt.
                </p>
                <p className="text-[11px] mt-1 text-muted-foreground">
                  Stripe-Zahlungsportal wird vorbereitet.
                </p>
                <button
                  type="button"
                  disabled={stripePortalPrepared}
                  title={stripePortalPrepared ? 'Stripe-Zahlungsportal wird vorbereitet.' : undefined}
                  className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 ${
                    stripePortalPrepared
                      ? 'text-muted-foreground cursor-not-allowed'
                      : 'text-[var(--brand)] hover:bg-[var(--brand-soft)]'
                  }`}
                >
                  Zahlungsmethode hinzufügen
                </button>
              </div>
            </div>
          )}
          {showPriceWarning && (
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 flex items-start gap-3">
              <div className="sq-tone-warning w-9 h-9 rounded-lg flex items-center justify-center shrink-0">
                <Icon name="alert-circle" className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  Preisstaffel noch nicht final konfiguriert.
                </p>
                <p className="text-[11px] mt-1 text-muted-foreground">
                  Die Subscription ist vorbereitet, aber es wird keine finale Abrechnungsvorschau berechnet.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
