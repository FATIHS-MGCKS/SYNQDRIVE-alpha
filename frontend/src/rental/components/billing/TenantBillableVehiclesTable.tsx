import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import type { TenantBillableVehicleListItemDto } from '../../types/billing.types';
import type { BillingPaginatedMeta } from './billing-query.utils';
import type { BillableVehicleListQuery } from './useBillingTariffVehicles';
import { formatDateDe } from './billing.utils';
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
  if (error) {
    return (
      <ErrorState
        title="Fahrzeugliste konnte nicht geladen werden"
        description={error}
        onRetry={() => void onRetry()}
        retryLabel="Erneut versuchen"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="tenant-billable-vehicles-table">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">Fahrzeuge in der Abrechnung</h3>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            className={`${inputClass} sm:w-52`}
            placeholder="Kennzeichen oder Modell suchen…"
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
            <option value="">Alle Status</option>
            <option value="BILLABLE">Abrechenbar</option>
            <option value="EXCLUDED">Nicht abrechenbar</option>
          </select>
        </div>
      </div>

      {loading && vehicles.length === 0 ? (
        <div className="h-40 rounded-2xl border border-border/60 bg-muted/10" />
      ) : vehicles.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="car" className="w-5 h-5" />}
          title="Keine Fahrzeuge in der Abrechnung"
          description="Sobald Fahrzeuge für Ihr Abo zugeordnet sind, erscheinen sie hier mit Abrechnungsstatus und Zeitraum."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-muted/40">
                {[
                  'Kennzeichen',
                  'Fahrzeug',
                  'Standort',
                  'Abrechenbar seit',
                  'Abrechenbar bis',
                  'Abrechnungsstatus',
                  'Grund',
                ].map((label) => (
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
                    {formatDateDe(vehicle.billableFrom)}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] tabular-nums">
                    {formatDateDe(vehicle.billableUntil)}
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
            {vehicles.length} von {meta.total} Fahrzeugen
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || (query.page ?? 1) <= 1}
              onClick={() => onQueryChange({ ...query, page: Math.max(1, (query.page ?? 1) - 1) })}
            >
              Zurück
            </Button>
            <span className="text-muted-foreground tabular-nums">
              Seite {meta.page} von {meta.totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || (query.page ?? 1) >= meta.totalPages}
              onClick={() => onQueryChange({ ...query, page: (query.page ?? 1) + 1 })}
            >
              Weiter
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
