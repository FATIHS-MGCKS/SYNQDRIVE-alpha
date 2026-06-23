import type { BillingSummaryDto } from '../../types/billing.types';
import { formatDateDe, formatMoneyCents, formatTierRange, subscriptionStatusLabel } from './billing.utils';
import { Icon } from '../ui/Icon';

interface BillingSubscriptionCardProps {
  summary: BillingSummaryDto;
  onShowVehicles: () => void;
}

export function BillingSubscriptionCard({ summary, onShowVehicles }: BillingSubscriptionCardProps) {
  const currency = summary.priceBook?.currency ?? 'EUR';
  const subStatus = summary.subscriptionStatus ?? 'NONE';
  const productLabels = summary.products.length
    ? summary.products.map((p) => p.name).join(' · ')
    : '—';

  const tierLabel = summary.currentTier
    ? formatTierRange(summary.currentTier.minVehicles, summary.currentTier.maxVehicles)
    : '—';

  const unitPriceLabel =
    summary.currentTier?.unitPriceCents != null
      ? formatMoneyCents(summary.currentTier.unitPriceCents, currency)
      : 'Noch nicht konfiguriert';

  const nextInvoiceLabel =
    summary.calculationStatus === 'OK' && summary.nextInvoicePreview.totalCents != null
      ? formatMoneyCents(summary.nextInvoicePreview.totalCents, currency)
      : 'Nicht berechenbar';

  const rows = [
    { label: 'Abo-Status', value: subscriptionStatusLabel(subStatus) },
    { label: 'Produkt / Lizenz', value: productLabels },
    { label: 'Abrechnungsmodell', value: 'Pro angeschlossenem Fahrzeug' },
    { label: 'Verbundene Fahrzeuge', value: String(summary.connectedVehicleCount) },
    { label: 'Abrechenbare Fahrzeuge', value: String(summary.billableVehicleCount) },
    { label: 'Aktuelle Staffel', value: tierLabel },
    { label: 'Preis pro Fahrzeug', value: unitPriceLabel },
    { label: 'Erwartete nächste Rechnung', value: nextInvoiceLabel },
    { label: 'Aktueller Zeitraum', value: `${formatDateDe(summary.currentPeriodStart)} – ${formatDateDe(summary.currentPeriodEnd)}` },
  ];

  if (summary.cancelAtPeriodEnd) {
    rows.push({ label: 'Kündigung', value: 'Zum Periodenende' });
  }

  return (
    <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Aktuelle Subscription
          </h3>
          <p className="text-[11px] mt-0.5 text-muted-foreground">
            Abrechnung basiert auf verbundenen, abrechenbaren Fahrzeugen.
          </p>
        </div>
      </div>

      <div className="space-y-0">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0"
          >
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="text-xs font-semibold text-foreground text-right">{row.value}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onShowVehicles}
        className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border border-border/70 bg-card hover:bg-muted/40 transition-colors duration-200 active:scale-[0.98]"
      >
        <Icon name="car" className="w-4 h-4" />
        Abgerechnete Fahrzeuge anzeigen
      </button>
    </div>
  );
}
