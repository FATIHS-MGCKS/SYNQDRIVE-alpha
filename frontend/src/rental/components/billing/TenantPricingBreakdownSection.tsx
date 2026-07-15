import type { TenantSubscriptionTariffPricingDto } from '../../types/billing.types';
import { pricingModelLabel } from './tenant-billing-overview.utils';
import { pricingBreakdownRows } from './tenant-tariff-vehicles.utils';

interface TenantPricingBreakdownSectionProps {
  pricing: TenantSubscriptionTariffPricingDto | null;
  loading?: boolean;
  error?: string | null;
}

export function TenantPricingBreakdownSection({
  pricing,
  loading = false,
  error = null,
}: TenantPricingBreakdownSectionProps) {
  if (loading) {
    return <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5 h-48" />;
  }

  if (error) {
    return (
      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5">
        <p className="text-sm font-semibold">Preisaufschlüsselung</p>
        <p className="text-xs mt-2 sq-tone-warning px-2 py-1 rounded">{error}</p>
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">Preisaufschlüsselung noch nicht verfügbar.</p>
      </div>
    );
  }

  const rows = pricingBreakdownRows(pricing);
  const showGraduatedTable =
    pricing.pricingModel === 'GRADUATED' && pricing.tierBreakdown.length > 0;

  return (
    <div
      className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5 space-y-4"
      data-testid="tenant-pricing-breakdown"
    >
      <div>
        <h3 className="text-sm font-semibold">Preisaufschlüsselung</h3>
        <p className="text-[12px] text-muted-foreground mt-1">
          {pricingModelLabel(pricing.pricingModel)} · {pricing.billableVehicleCount} abrechenbare
          Fahrzeuge
        </p>
      </div>

      {showGraduatedTable ? (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Staffel</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Menge</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">
                  Stückpreis
                </th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Summe</th>
              </tr>
            </thead>
            <tbody>
              {pricing.tierBreakdown.map((line) => (
                <tr key={`${line.tierLabel}-${line.quantity}`} className="border-t border-border/50">
                  <td className="px-3 py-2.5">{line.tierLabel}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.unitPrice.formatted}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                    {line.subtotal.formatted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex justify-between gap-3 border-b border-border/40 pb-2 ${
              row.emphasize ? 'sm:col-span-2' : ''
            }`}
          >
            <span className={row.emphasize ? 'font-semibold text-muted-foreground' : 'text-muted-foreground'}>
              {row.label}
            </span>
            <span className={row.emphasize ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
