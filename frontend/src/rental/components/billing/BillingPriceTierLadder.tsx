import type { BillingPriceTierDto } from '../../types/billing.types';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatTierRangeDisplay,
  resolvePricingModelDisplayLabel,
  resolveTenantBillingMoneyDisplay,
} from '../../lib/rental-tenant-billing-i18n';
import { EmptyState } from '../../../components/patterns/states';
import { Icon } from '../ui/Icon';

interface BillingPriceTierLadderProps {
  tiers: BillingPriceTierDto[];
  currency: string;
  currentTierId: string | null;
  pricingModel?: 'VOLUME' | 'GRADUATED' | null;
  locale: string;
}

export function BillingPriceTierLadder({
  tiers,
  currency,
  currentTierId,
  pricingModel = 'VOLUME',
  locale,
}: BillingPriceTierLadderProps) {
  const { t } = useLanguage();
  const modelLabel = resolvePricingModelDisplayLabel(pricingModel, t);

  if (!tiers.length) {
    return (
      <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground mb-3">
          {t('tenantBilling.overview.pricingTier')}
        </h3>
        <EmptyState
          compact
          icon={<Icon name="layers" className="w-5 h-5" />}
          title={t('tenantBilling.tariff.tierLadder.emptyTitle')}
          description={t('tenantBilling.tariff.tierLadder.emptyDescription')}
        />
      </div>
    );
  }

  const sorted = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder || a.minVehicles - b.minVehicles);

  return (
    <div className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          {t('tenantBilling.overview.pricingTier')}
        </h3>
        <p className="text-[11px] mt-0.5 text-muted-foreground">
          {t('tenantBilling.tariff.tierLadder.fleetHint', { model: modelLabel })}
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
                  {formatTierRangeDisplay(tier.minVehicles, tier.maxVehicles, t)}
                </p>
                {isCurrent && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-brand">
                    {t('tenantBilling.tariff.tierLadder.current')}
                  </span>
                )}
              </div>
              <p className="mt-3 text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">
                {tier.unitPriceCents != null
                  ? resolveTenantBillingMoneyDisplay(
                      null,
                      locale,
                      tier.unitPriceCents,
                      currency,
                    )
                  : t('tenantBilling.tariff.tierLadder.notConfigured')}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('tenantBilling.tariff.tierLadder.perVehicleMonth')}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
