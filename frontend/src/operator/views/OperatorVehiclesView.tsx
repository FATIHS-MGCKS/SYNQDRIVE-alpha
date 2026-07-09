import { useState } from 'react';
import { Car } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { deriveVehicleOperatorStatuses } from '../lib/operatorStatus';
import {
  OPERATOR_VEHICLE_FILTERS,
  vehicleMatchesOperatorFilter,
  isHealthKnownForVehicle,
  type OperatorVehicleFilter,
} from '../lib/operatorVehicleQuickView.utils';
import { useOperatorData } from '../context/OperatorDataContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorVehiclesData } from '../hooks/useOperatorVehiclesData';
import { OperatorListCard } from '../components/OperatorListCard';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { OperatorVehicleQuickView } from '../components/OperatorVehicleQuickView';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';

export function OperatorVehiclesView() {
  const [filter, setFilter] = useState<OperatorVehicleFilter>('all');
  const [localSearch, setLocalSearch] = useState('');
  const { vehicles, healthMap, loading, refresh, healthLoading, healthError } =
    useOperatorVehiclesData(localSearch);
  const { tasksByVehicleId } = useOperatorData();
  const { selectedVehicleId, setSelectedVehicleId } = useOperatorShell();
  const isTablet = useOperatorTabletLayout();

  const filtered = vehicles.filter((v) => {
    const health = healthMap.get(v.id);
    const healthKnown = isHealthKnownForVehicle(v.id, healthMap, healthLoading, healthError);
    const openTasks = tasksByVehicleId.get(v.id) ?? 0;
    return vehicleMatchesOperatorFilter(filter, v, health, healthKnown, openTasks);
  });

  const listContent = (
    <div className="flex h-full min-h-0 flex-col space-y-3">
      <input
        type="search"
        placeholder="Kennzeichen oder Fahrzeugname…"
        value={localSearch}
        onChange={(e) => setLocalSearch(e.target.value)}
        className="h-11 w-full shrink-0 rounded-xl border border-border surface-premium px-3 text-sm"
      />
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {OPERATOR_VEHICLE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`sq-press shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold min-h-[36px] ${
              filter === f.id
                ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                : 'border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-2">
        {loading && <SkeletonRows rows={5} />}
        {!loading && filtered.length === 0 && (
          <EmptyState
            compact
            icon={<Car className="h-5 w-5" />}
            title="Keine Fahrzeuge"
            description="Keine Fahrzeuge für diesen Filter."
          />
        )}
        {!loading &&
          filtered.map((v) => {
            const health = healthMap.get(v.id);
            const openTasks = tasksByVehicleId.get(v.id) ?? 0;
            return (
              <OperatorListCard
                key={v.id}
                title={`${v.model} · ${v.license}`}
                subtitle={v.station || undefined}
                badges={deriveVehicleOperatorStatuses(v, health, openTasks)}
                onClick={() => setSelectedVehicleId(v.id)}
              />
            );
          })}
      </div>
    </div>
  );

  const detail = selectedVehicleId ? (
    <OperatorVehicleQuickView vehicleId={selectedVehicleId} onClose={() => setSelectedVehicleId(null)} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 p-8 text-center">
      <Car className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Fahrzeug für Quick View wählen</p>
    </div>
  );

  if (isTablet) {
    return <OperatorTabletFrame list={listContent} detail={detail} showDetail={Boolean(selectedVehicleId)} />;
  }

  if (selectedVehicleId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="min-h-[44px] text-sm font-semibold text-[color:var(--brand-ink)]"
          onClick={() => setSelectedVehicleId(null)}
        >
          ← Zurück zur Liste
        </button>
        <OperatorVehicleQuickView vehicleId={selectedVehicleId} />
      </div>
    );
  }

  if (!loading && vehicles.length === 0) {
    return (
      <ErrorState compact title="Flotte nicht geladen" onRetry={() => void refresh()} retryLabel="Erneut laden" />
    );
  }

  return listContent;
}
