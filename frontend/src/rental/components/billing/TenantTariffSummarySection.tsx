import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatRentalTenantBillingDate,
  formatTariffPeriodRangeDisplay,
  resolvePlanKindDisplayLabel,
} from '../../lib/rental-tenant-billing-i18n';
import type { TenantSubscriptionTariffDetailsDto } from '../../types/billing.types';

interface TenantTariffSummarySectionProps {
  tariff: TenantSubscriptionTariffDetailsDto | null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-b-0">
      <span className="text-[12px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[12px] font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

export function TenantTariffSummarySection({ tariff }: TenantTariffSummarySectionProps) {
  const { t, locale } = useLanguage();

  if (!tariff) {
    return (
      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5">
        <p className="text-sm text-muted-foreground">{t('tenantBilling.tariff.summary.empty')}</p>
      </div>
    );
  }

  return (
    <div
      className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5"
      data-testid="tenant-tariff-summary"
    >
      <h3 className="text-sm font-semibold mb-3">{t('tenantBilling.tariff.summary.title')}</h3>
      <div className="space-y-0">
        <DetailRow
          label={t('tenantBilling.tariff.summary.product')}
          value={resolvePlanKindDisplayLabel(tariff.planKind, t)}
        />
        <DetailRow
          label={t('tenantBilling.tariff.summary.planNameLabel')}
          value={tariff.planName ?? '—'}
        />
        <DetailRow
          label={t('tenantBilling.tariff.summary.billingInterval')}
          value={tariff.billingIntervalLabel}
        />
        <DetailRow
          label={t('tenantBilling.tariff.summary.priceVersion')}
          value={tariff.priceVersionLabel ?? '—'}
        />
        <DetailRow
          label={t('tenantBilling.tariff.summary.contractStart')}
          value={formatRentalTenantBillingDate(locale, tariff.contractStartedAt)}
        />
        <DetailRow
          label={t('tenantBilling.tariff.summary.nextPeriod')}
          value={formatTariffPeriodRangeDisplay(
            locale,
            tariff.nextPeriodStart,
            tariff.nextPeriodEnd,
          )}
        />
        <DetailRow
          label={t('tenantBilling.tariff.summary.cancellationStatus')}
          value={tariff.cancellationStatusLabel ?? '—'}
        />
        <DetailRow
          label={t('tenantBilling.overview.pricingTier')}
          value={tariff.appliedTierLabel ?? '—'}
        />
      </div>
    </div>
  );
}
