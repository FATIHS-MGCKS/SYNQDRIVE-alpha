import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatRentalTenantBillingDate,
} from '../../lib/rental-tenant-billing-i18n';
import type { TenantBillableVehicleListItemDto } from '../../types/billing.types';
import type { BillingPaginatedMeta } from './billing-query.utils';
import type { BillableVehicleListQuery } from './useBillingTariffVehicles';
import { Icon } from '../ui/Icon';

interface TenantBillableVehiclesTableProps {
  vehicles: TenantBillableVehicleListItemDto[];
  meta: BillingPaginatedMeta | null;
  query: BillableVehicleListQuery;
  loading: boolean;
  error: string | null;
  onQueryChange: (query: BillableVehicleListQuery) => void;
  onRetry: () => void;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-background text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';

export function TenantBillableVehiclesTable({
  vehicles,
  meta,
  query,
  loading,
  error,
  onQueryChange,
  onRetry,
}: TenantBillableVehiclesTableProps) {
  const { t, locale } = useLanguage();

  if (error) {
    return (
      <ErrorState
        title={t('tenantBilling.tariff.vehicles.loadErrorTitle')}
        description={error}
        onRetry={() => void onRetry()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const columnLabels = [
    t('fleet.licensePlate'),
    t('bookings.vehicle'),
    t('tenantBilling.tariff.col.station'),
    t('tenantBilling.tariff.col.billableFrom'),
    t('tenantBilling.tariff.col.billableUntil'),
    t('tenantBilling.tariff.col.billingStatus'),
    t('tenantBilling.tariff.col.reason'),
  ];

  return (
    <div className="space-y-3" data-testid="tenant-billable-vehicles-table">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">{t('tenantBilling.tariff.vehicles.title')}</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            className={`${inputClass} sm:w-52`}
            placeholder={t('tenantBilling.tariff.vehicles.searchPlaceholder')}
            value={query.search ?? ''}
            onChange={(event) =>
              onQueryChange({ ...query, page: 1, search: event.target.value || undefined })
            }
          />
          <select
            className={`${inputClass} sm:w-44`}
            value={query.status ?? ''}
            onChange={(event) =>
              onQueryChange({
                ...query,
                page: 1,
                status: (event.target.value as 'BILLABLE' | 'EXCLUDED' | '') || undefined,
              })
            }
          >
            <option value="">{t('tenantBilling.tariff.filter.allStatuses')}</option>
            <option value="BILLABLE">{t('tenantBilling.tariff.filter.billable')}</option>
            <option value="EXCLUDED">{t('tenantBilling.tariff.filter.excluded')}</option>
          </select>
        </div>
      </div>

      {loading && vehicles.length === 0 ? (
        <div className="h-40 rounded-2xl border border-border/60 bg-muted/10" />
      ) : vehicles.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="car" className="w-5 h-5" />}
          title={t('tenantBilling.tariff.vehicles.emptyTitle')}
          description={t('tenantBilling.tariff.vehicles.emptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-muted/40">
                {columnLabels.map((label) => (
                  <th
                    key={label}
                    className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-[12px] font-medium">{vehicle.licensePlate ?? '—'}</td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">{vehicle.vehicleLabel}</td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                    {vehicle.stationName ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums">
                    {formatRentalTenantBillingDate(locale, vehicle.billableFrom)}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums">
                    {formatRentalTenantBillingDate(locale, vehicle.billableUntil)}
                  </td>
                  <td className="px-3 py-2.5 text-[12px]">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        vehicle.billingStatus === 'BILLABLE'
                          ? 'sq-tone-brand'
                          : 'sq-tone-warning'
                      }`}
                    >
                      {vehicle.billingStatusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                    {vehicle.reasonLabel ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t('tenantBilling.tariff.pagination.shownOfTotal', {
              shown: vehicles.length,
              total: meta.total,
            })}
          </span>
          <div className="flex items-center gap-2">
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
        </div>
      ) : null}
    </div>
  );
}
