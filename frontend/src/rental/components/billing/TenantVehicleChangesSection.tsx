import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import type { TenantVehicleBillingChangeDto } from '../../types/billing.types';
import type { BillingPaginatedMeta } from './billing-query.utils';
import type { VehicleBillingChangesQuery } from './useBillingTariffVehicles';
import { formatDateDe } from './billing.utils';
import { changeTypeLabel, changeTypeTone } from './tenant-tariff-vehicles.utils';

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
  if (error) {
    return (
      <ErrorState
        title="Änderungen konnten nicht geladen werden"
        description={error}
        onRetry={() => void onRetry()}
        retryLabel="Erneut versuchen"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="tenant-vehicle-changes">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Änderungen an der Fahrzeugmenge</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Hinzugefügte oder entfernte Fahrzeuge mit anteiliger Berechnung im aktuellen Zeitraum.
          </p>
        </div>
      </div>

      {loading && changes.length === 0 ? (
        <div className="h-28 rounded-2xl border border-border/60 bg-muted/10" />
      ) : changes.length === 0 ? (
        <EmptyState compact title="Noch keine Fahrzeugänderungen" />
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
                    {change.licensePlate ?? change.vehicleLabel ?? 'Fahrzeug'}
                  </p>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${changeTypeTone(change.changeType)}`}
                  >
                    {changeTypeLabel(change)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {change.eventTypeLabel} · {formatDateDe(change.effectiveAt)}
                </p>
                {change.reason ? (
                  <p className="text-[11px] text-muted-foreground mt-1">{change.reason}</p>
                ) : null}
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Anteilige Berechnung
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
      ) : null}
    </div>
  );
}
