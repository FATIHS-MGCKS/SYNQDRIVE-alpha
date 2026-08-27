import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatRentalTenantBillingDate,
  resolveVehicleChangeTypeLabel,
} from '../../lib/rental-tenant-billing-i18n';
import type { TenantVehicleBillingChangeDto } from '../../types/billing.types';
import type { BillingPaginatedMeta } from './billing-query.utils';
import type { VehicleBillingChangesQuery } from './useBillingTariffVehicles';
import { changeTypeTone } from './tenant-tariff-vehicles.utils';

interface TenantVehicleChangesSectionProps {
  changes: TenantVehicleBillingChangeDto[];
  meta: BillingPaginatedMeta | null;
  query: VehicleBillingChangesQuery;
  loading: boolean;
  error: string | null;
  onQueryChange: (query: VehicleBillingChangesQuery) => void;
  onRetry: () => void;
}

export function TenantVehicleChangesSection({
  changes,
  meta,
  query,
  loading,
  error,
  onQueryChange,
  onRetry,
}: TenantVehicleChangesSectionProps) {
  const { t, locale } = useLanguage();

  if (error) {
    return (
      <ErrorState
        title={t('tenantBilling.tariff.changes.loadErrorTitle')}
        description={error}
        onRetry={() => void onRetry()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="tenant-vehicle-changes">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('tenantBilling.tariff.changes.title')}</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {t('tenantBilling.tariff.changes.subtitle')}
          </p>
        </div>
      </div>

      {loading && changes.length === 0 ? (
        <div className="h-28 rounded-2xl border border-border/60 bg-muted/10" />
      ) : changes.length === 0 ? (
        <EmptyState compact title={t('tenantBilling.tariff.changes.emptyTitle')} />
      ) : (
        <div className="space-y-2">
          {changes.map((change) => (
            <div
              key={change.id}
              className="rounded-xl border border-border/60 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold text-foreground">
                    {change.licensePlate ?? change.vehicleLabel ?? t('tenantBilling.tariff.changes.vehicleFallback')}
                  </p>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${changeTypeTone(change.changeType)}`}
                  >
                    {resolveVehicleChangeTypeLabel(change.changeType, t)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {change.eventTypeLabel} · {formatRentalTenantBillingDate(locale, change.effectiveAt)}
                </p>
                {change.reason ? (
                  <p className="text-[11px] text-muted-foreground mt-1">{change.reason}</p>
                ) : null}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('tenantBilling.tariff.changes.prorationLabel')}
                </p>
                <p className="text-[13px] font-semibold tabular-nums">
                  {change.prorationAmount?.formatted ?? '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || (query.page ?? 1) <= 1}
            onClick={() => onQueryChange({ ...query, page: Math.max(1, (query.page ?? 1) - 1) })}
          >
            {t('common.back')}
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {t('tenantBilling.tariff.pagination.page', {
              page: meta.page,
              totalPages: meta.totalPages,
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || (query.page ?? 1) >= meta.totalPages}
            onClick={() => onQueryChange({ ...query, page: (query.page ?? 1) + 1 })}
          >
            {t('common.next')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
