import type { ReactNode } from 'react';
import type { BillingSummaryDto } from '../../types/billing.types';
import { Button } from '../../../components/ui/button';
import {
  formatDateDe,
  formatMoneyCents,
  formatTierRange,
  planLabelFromSummary,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from './billing.utils';
import { Icon } from '../ui/Icon';

interface BillingSubscriptionCardProps {
  summary: BillingSummaryDto;
  onShowVehicles: () => void;
}

export function BillingSubscriptionCard({ summary, onShowVehicles }: BillingSubscriptionCardProps) {
  const currency = summary.priceBook?.currency ?? 'EUR';
  const subStatus = summary.subscriptionStatus ?? 'NONE';
  const planLabel = planLabelFromSummary(summary);

  const tierLabel = summary.currentTier
    ? formatTierRange(summary.currentTier.minVehicles, summary.currentTier.maxVehicles)
    : '—';

  const unitPriceLabel =
    summary.currentTier?.unitPriceCents != null
      ? formatMoneyCents(summary.currentTier.unitPriceCents, currency)
      : 'Noch nicht konfiguriert';

  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Tarif', value: planLabel },
    { label: 'Abrechnungsmodell', value: 'Pro verbundenem Fahrzeug' },
    { label: 'Aktive Fahrzeuge (verbunden)', value: String(summary.connectedVehicleCount) },
    { label: 'Abrechenbare Fahrzeuge', value: String(summary.billableVehicleCount) },
    { label: 'Aktuelle Preisstaffel', value: tierLabel },
    { label: 'Preis pro Fahrzeug', value: unitPriceLabel },
    {
      label: 'Aktueller Zeitraum',
      value: `${formatDateDe(summary.currentPeriodStart)} – ${formatDateDe(summary.currentPeriodEnd)}`,
    },
    {
      label: 'Status',
      value: (
        <span
          className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${subscriptionStatusTone(subStatus)}`}
        >
          {subscriptionStatusLabel(subStatus)}
        </span>
      ),
    },
  ];

  if (summary.cancelAtPeriodEnd) {
    rows.push({ label: 'Kündigung', value: 'Zum Periodenende' });
  }

  return (
    <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          SynqDrive-Abo
        </h3>
        <p className="text-[12px] mt-0.5 text-muted-foreground">
          Abrechnung basiert auf verbundenen, abrechenbaren Fahrzeugen.
        </p>
      </div>

      <div className="space-y-0">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0"
          >
            <span className="text-[12px] text-muted-foreground shrink-0">{row.label}</span>
            <span className="text-[12px] font-semibold text-foreground text-right">{row.value}</span>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4 w-full sm:w-auto"
        onClick={onShowVehicles}
      >
        <Icon name="car" className="w-3.5 h-3.5" />
        Abrechenbare Fahrzeuge ansehen
      </Button>
    </div>
  );
}
