import type { BillingPriceTierDto } from '../../types/billing.types';
import { formatMoneyCents, formatTierRange } from './billing.utils';
import { pricingModelLabel } from './tenant-billing-overview.utils';
import { EmptyState } from '../../../components/patterns/states';
import { Icon } from '../ui/Icon';

interface BillingPriceTierLadderProps {
  tiers: BillingPriceTierDto[];
  currency: string;
  currentTierId: string | null;
  pricingModel?: 'VOLUME' | 'GRADUATED' | null;
}

export function BillingPriceTierLadder({
  tiers,
  currency,
  currentTierId,
  pricingModel = 'VOLUME',
}: BillingPriceTierLadderProps) {
  if (!tiers.length) {
    return (
      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground mb-3">
          Preisstaffel
        </h3>
        <EmptyState
          compact
          icon={<Icon name="layers" className="w-5 h-5" />}
          title="Preisstaffeln wurden noch nicht konfiguriert."
          description="Sobald eine aktive Preisversion veröffentlicht ist, erscheinen die Staffeln hier."
        />
      </div>
    );
  }

  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder || a.minVehicles - b.minVehicles);

  return (
    <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">Preisstaffel</h3>
        <p className="text-[11px] mt-0.5 text-muted-foreground">
          {pricingModelLabel(pricingModel)}: Ihr gesamter Fahrzeugbestand wird mit der passenden
          Staffel berechnet.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {sorted.map((tier) => {
          const isCurrent = tier.id === currentTierId;
          return (
            <div
              key={tier.id}
              className={`rounded-xl border p-4 transition-all duration-200 ${
                isCurrent
                  ? 'border-[var(--brand)]/40 bg-[var(--brand-soft)]/30 shadow-[var(--shadow-1)]'
                  : 'border-border/70 surface-premium'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {formatTierRange(tier.minVehicles, tier.maxVehicles)}
                </p>
                {isCurrent && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-brand">
                    Aktuell
                  </span>
                )}
              </div>
              <p className="mt-3 text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">
                {tier.unitPriceCents != null
                  ? formatMoneyCents(tier.unitPriceCents, currency)
                  : 'Noch nicht konfiguriert'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">pro Fahrzeug / Monat</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
