import type { BillingSummaryDto } from '../../types/billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  paymentMethodLabel,
  planLabelFromSummary,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from './billing.utils';
import {
  stripeStateHint,
  stripeStateLabel,
  stripeStateTone,
  type BillingStripeUiState,
} from './billing-stripe-ui';

interface BillingStatusHeroProps {
  summary: BillingSummaryDto;
  stripeState: BillingStripeUiState;
}

export function BillingStatusHero({ summary, stripeState }: BillingStatusHeroProps) {
  const currency = summary.priceBook?.currency ?? summary.nextInvoicePreview.currency ?? 'EUR';
  const pm = summary.paymentMethod;
  const pmLabel = pm.exists
    ? pm.brand && pm.last4
      ? `${paymentMethodLabel(pm.type)} · ${pm.brand} •••• ${pm.last4}`
      : paymentMethodLabel(pm.type)
    : 'Nicht hinterlegt';

  const subStatus = summary.subscriptionStatus ?? 'NONE';
  const planLabel = planLabelFromSummary(summary);

  const metrics: Array<{
    label: string;
    value: string;
    hint?: string;
    badgeTone?: string;
  }> = [
    { label: 'Plan / Produkt', value: planLabel },
    {
      label: 'Abo-Status',
      value: subscriptionStatusLabel(subStatus),
      badgeTone: subscriptionStatusTone(subStatus),
    },
    {
      label: 'Abrechenbare Fahrzeuge',
      value: String(summary.billableVehicleCount),
      hint: `${summary.connectedVehicleCount} verbunden`,
    },
    {
      label: 'Nächster Zeitraum',
      value: `${formatDateDe(summary.currentPeriodStart)} – ${formatDateDe(summary.currentPeriodEnd)}`,
    },
    {
      label: 'Geschätzte nächste Rechnung',
      value:
        summary.calculationStatus === 'OK' && summary.nextInvoicePreview.totalCents != null
          ? formatMoneyCents(summary.nextInvoicePreview.totalCents, currency)
          : '—',
      hint:
        summary.calculationStatus !== 'OK'
          ? summary.nextInvoicePreview.explanation
          : undefined,
    },
    {
      label: 'Zahlungsstatus',
      value: pmLabel,
      hint: stripeStateLabel(stripeState),
    },
  ];

  const showPaymentWarning = summary.warnings.includes('PAYMENT_METHOD_MISSING');
  const showPriceWarning =
    summary.warnings.includes('PRICE_NOT_CONFIGURED') ||
    summary.warnings.includes('NO_ACTIVE_PRICE_VERSION');

  return (
    <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)] space-y-4">
      <p className="text-[12px] leading-relaxed text-muted-foreground max-w-[70ch]">
        Verwalte Subscription, Zahlungsmethode und Rechnungen für diese Organisation.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-border/60 bg-muted/15 px-3.5 py-3 min-w-0"
          >
            <p className="text-[12px] font-medium text-muted-foreground">{metric.label}</p>
            <div className="mt-1">
              {metric.badgeTone ? (
                <span
                  className={`inline-flex px-2.5 py-1 rounded-md text-[13px] font-semibold ${metric.badgeTone}`}
                >
                  {metric.value}
                </span>
              ) : (
                <p className="text-[20px] sm:text-[22px] font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate leading-tight">
                  {metric.value}
                </p>
              )}
            </div>
            {metric.hint && (
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{metric.hint}</p>
            )}
          </div>
        ))}
      </div>

      <div
        className={`rounded-xl border border-border/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] ${stripeStateTone(stripeState)}`}
      >
        <span className="font-semibold">{stripeStateLabel(stripeState)}</span>
        <span className="text-muted-foreground">{stripeStateHint(stripeState)}</span>
      </div>

      {(showPaymentWarning || showPriceWarning) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {showPaymentWarning && (
            <div className="rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3">
              <p className="text-[13px] font-semibold text-foreground">
                Keine Zahlungsmethode hinterlegt
              </p>
              <p className="text-[12px] mt-1 text-muted-foreground">
                {stripeState === 'configured'
                  ? 'Bitte Zahlungsmethode im Bereich rechts hinzufügen.'
                  : 'Zahlungsmethode kann ergänzt werden, sobald Stripe aktiv ist.'}
              </p>
            </div>
          )}
          {showPriceWarning && (
            <div className="rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3">
              <p className="text-[13px] font-semibold text-foreground">
                Preisstaffel noch nicht final
              </p>
              <p className="text-[12px] mt-1 text-muted-foreground">
                Die Abrechnungsvorschau kann erst berechnet werden, wenn eine aktive Preisversion
                veröffentlicht ist.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
