import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Car,
  ChevronRight,
  Link2,
  Plug,
  Radio,
  Search,
  ShieldAlert,
  Signal,
  SignalZero,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  SkeletonMetricGrid,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { api, type FleetConnectivityResponse, type FleetConnectivityVehicle } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { FleetConnectivityDetailDrawer } from './fleet-connectivity/FleetConnectivityDetailDrawer';
import {
  ConnectionStatusChip,
  JammingSnapshotChip,
  ObdRowChip,
  ReadinessChip,
} from './fleet-connectivity/fleet-connectivity.badges';
import {
  type FleetConnectionScopeFilter,
  type FleetReadinessFilter,
  type FleetSignalFilter,
  filterFleetConnectivityVehicles,
  hasActiveFleetFilters,
} from './fleet-connectivity/fleet-connectivity.utils';

export function FleetConnectivityTab() {
  const { orgId } = useRentalOrg();
  const [data, setData] = useState<FleetConnectivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FleetConnectionScopeFilter>('all');
  const [readinessFilter, setReadinessFilter] = useState<FleetReadinessFilter>('all');
  const [signalFilter, setSignalFilter] = useState<FleetSignalFilter>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<FleetConnectivityVehicle | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.vehicles.fleetConnectivity(orgId);
      setData(res);
    } catch {
      setData(null);
      setError('Fleet connectivity data could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vehicles = useMemo(() => {
    if (!data?.vehicles) return [];
    return filterFleetConnectivityVehicles(data.vehicles, {
      search,
      statusFilter,
      readinessFilter,
      signalFilter,
    });
  }, [data, search, statusFilter, readinessFilter, signalFilter]);

  const s = data?.summary;
  const filtersActive = hasActiveFleetFilters({
    search,
    statusFilter,
    readinessFilter,
    signalFilter,
  });

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setReadinessFilter('all');
    setSignalFilter('all');
  };

  const kpiCards = useMemo(
    (): Array<{
      id: string;
      label: string;
      value: string | number;
      status: 'neutral' | 'info' | 'success' | 'watch' | 'critical' | 'warning';
      icon: LucideIcon;
      onClick: () => void;
      active: boolean;
      hint?: string;
    }> => [
      {
        id: 'total',
        label: 'Total Vehicles',
        value: s?.total ?? 0,
        status: 'neutral' as const,
        icon: Car,
        onClick: () => setStatusFilter('all'),
        active: statusFilter === 'all' && signalFilter === 'all' && readinessFilter === 'all',
      },
      {
        id: 'connected',
        label: 'Connected',
        value: s?.connected ?? 0,
        status: 'info' as const,
        icon: Link2,
        onClick: () => setStatusFilter('connected'),
        active: statusFilter === 'connected',
      },
      {
        id: 'online',
        label: 'Online',
        value: s?.online ?? 0,
        status: 'success' as const,
        icon: Signal,
        onClick: () => setStatusFilter('online'),
        active: statusFilter === 'online',
      },
      {
        id: 'standby',
        label: 'Standby',
        value: s?.standby ?? 0,
        status: 'watch' as const,
        icon: Activity,
        onClick: () => setStatusFilter('standby'),
        active: statusFilter === 'standby',
      },
      {
        id: 'offline',
        label: 'Offline',
        value: s?.offline ?? 0,
        status: 'critical' as const,
        icon: SignalZero,
        onClick: () => setStatusFilter('offline'),
        active: statusFilter === 'offline',
      },
      {
        id: 'not_connected',
        label: 'Not Connected',
        value: s?.notConnected ?? 0,
        status: 'neutral' as const,
        icon: WifiOff,
        onClick: () => setStatusFilter('not_connected'),
        active: statusFilter === 'not_connected',
      },
      {
        id: 'obd_unplugged',
        label: 'OBD Unplugged',
        value: s?.obdUnplugged ?? 0,
        status: 'warning' as const,
        icon: Plug,
        onClick: () => setSignalFilter('obd_unplugged'),
        active: signalFilter === 'obd_unplugged',
      },
      {
        id: 'readiness',
        label: 'Avg Readiness',
        value:
          s?.avgReadinessScore != null ? `${s.avgReadinessScore}%` : '—',
        status: 'info' as const,
        icon: Radio,
        onClick: () => setReadinessFilter('watch'),
        active: readinessFilter === 'watch',
        hint: 'Telemetry data confidence',
      },
    ],
    [s, statusFilter, signalFilter, readinessFilter],
  );

  const columns: DataTableColumn<FleetConnectivityVehicle>[] = useMemo(
    () => [
      {
        key: 'vehicle',
        header: 'Vehicle',
        cell: (v) => (
          <div className="min-w-[180px]">
            <p className="text-[13px] font-semibold text-foreground">
              {v.make} {v.model}
              {v.year ? ` ${v.year}` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {v.licensePlate ? `${v.licensePlate} · ` : ''}
              {v.vin}
            </p>
          </div>
        ),
      },
      {
        key: 'station',
        header: 'Station',
        className: 'hidden lg:table-cell',
        cell: (v) => (
          <span className="text-[12px] text-muted-foreground">{v.station ?? '—'}</span>
        ),
      },
      {
        key: 'provider',
        header: 'Provider',
        className: 'hidden md:table-cell',
        cell: (v) => (
          <div className="text-[12px]">
            <p className="font-medium">{v.provider}</p>
            <p className="text-muted-foreground">{v.connectionType}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (v) => <ConnectionStatusChip status={v.connectionStatus} />,
      },
      {
        key: 'freshness',
        header: 'Last signal',
        className: 'hidden sm:table-cell',
        cell: (v) => (
          <span
            className={`text-[12px] tabular-nums ${
              v.freshnessLabel === 'Live'
                ? 'text-[color:var(--status-positive)] font-medium'
                : 'text-muted-foreground'
            }`}
          >
            {v.freshnessLabel}
          </span>
        ),
      },
      {
        key: 'readiness',
        header: 'Telemetry readiness',
        className: 'hidden xl:table-cell',
        cell: (v) => (
          <ReadinessChip level={v.readinessLevel} score={v.readinessScore} />
        ),
      },
      {
        key: 'coverage',
        header: 'Coverage',
        className: 'hidden xl:table-cell',
        numeric: true,
        cell: (v) => (
          <span className="text-[12px] tabular-nums">{v.signalCoveragePercent}%</span>
        ),
      },
      {
        key: 'obd',
        header: 'OBD',
        className: 'hidden lg:table-cell',
        cell: (v) => <ObdRowChip plugged={v.obdIsPluggedIn} />,
      },
      {
        key: 'jamming',
        header: 'Jamming',
        className: 'hidden lg:table-cell',
        cell: (v) => <JammingSnapshotChip count={v.jammingDetectedCount} />,
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
        <SkeletonMetricGrid count={8} />
        <SkeletonRows rows={8} className="sq-card rounded-2xl p-4" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <ErrorState
          title="Fleet connectivity data could not be loaded"
          error={error ?? 'Unknown error'}
          onRetry={() => void load()}
          retryLabel="Retry"
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        title="Fleet Connectivity"
        status={
          <StatusChip tone="info" className="text-[11px]">
            Read-only technical overview
          </StatusChip>
        }
      />

      <div className="rounded-xl border border-border/60 bg-muted/25 px-4 py-3 text-[12px] text-muted-foreground flex gap-2.5">
        <Wifi className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
        <p>
          This page shows technical telemetry availability only. Connection setup
          and data authorization are handled in their dedicated areas.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory md:grid md:grid-cols-2 xl:grid-cols-4 md:overflow-visible">
        {kpiCards.map((kpi) => {
          const KpiIcon = kpi.icon;
          return (
          <button
            key={kpi.id}
            type="button"
            onClick={kpi.onClick}
            className={`min-w-[148px] snap-start text-left transition-all rounded-2xl ${
              kpi.active ? 'ring-1 ring-[var(--brand)]' : ''
            }`}
            aria-pressed={kpi.active}
          >
            <MetricCard
              label={kpi.label}
              value={kpi.value}
              status={kpi.status}
              icon={<KpiIcon className="w-5 h-5" />}
              hint={kpi.hint}
              className="h-full hover:shadow-[var(--shadow-2)]"
            />
          </button>
          );
        })}
      </div>

      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Search & filters</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Showing {vehicles.length} of {s?.total ?? 0} vehicles
              {data.generatedAt
                ? ` · snapshot ${new Date(data.generatedAt).toLocaleString('de-DE')}`
                : ''}
            </p>
          </div>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_180px_200px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="VIN, plate, make, model, masked serial, station…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs border border-border/70 bg-card outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FleetConnectionScopeFilter)}
            className="px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs font-medium"
          >
            <option value="all">All statuses</option>
            <option value="connected">Connected</option>
            <option value="online">Online</option>
            <option value="standby">Standby</option>
            <option value="offline">Offline</option>
            <option value="not_connected">Not connected</option>
          </select>
          <select
            value={readinessFilter}
            onChange={(e) => setReadinessFilter(e.target.value as FleetReadinessFilter)}
            className="px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs font-medium"
          >
            <option value="all">All readiness</option>
            <option value="good">Good</option>
            <option value="watch">Watch</option>
            <option value="warning">Warning</option>
            <option value="no_data">No data</option>
          </select>
          <select
            value={signalFilter}
            onChange={(e) => setSignalFilter(e.target.value as FleetSignalFilter)}
            className="px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs font-medium"
          >
            <option value="all">All signals</option>
            <option value="obd_unplugged">OBD unplugged</option>
            <option value="jamming">Jamming snapshot</option>
            <option value="missing_gps">Missing GPS</option>
            <option value="missing_odometer">Missing odometer</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {signalFilter === 'jamming' && (
            <StatusChip tone="watch" className="text-[10px]">
              <ShieldAlert className="w-3 h-3 mr-1 inline" />
              Jamming snapshot filter active
            </StatusChip>
          )}
          {data.thresholds && (
            <StatusChip tone="neutral" className="text-[10px]">
              Online &lt; {data.thresholds.onlineMaxMinutes}m · Standby &lt;{' '}
              {data.thresholds.standbyMaxHours}h
            </StatusChip>
          )}
        </div>
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          icon={<Car className="w-5 h-5" />}
          title={
            filtersActive
              ? 'No vehicles match the selected filters'
              : 'No vehicles available for connectivity overview'
          }
          description={
            filtersActive
              ? 'Try adjusting search or filter criteria.'
              : 'Vehicles appear here once registered in your fleet.'
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              rows={vehicles}
              getRowKey={(v) => v.vehicleId}
              onRowClick={(v) => setSelectedVehicle(v)}
              rowActions={() => (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              card
            />
          </div>

          <div className="md:hidden space-y-2">
            {vehicles.map((v) => (
              <button
                key={v.vehicleId}
                type="button"
                onClick={() => setSelectedVehicle(v)}
                className="sq-card w-full text-left rounded-2xl p-4 shadow-[var(--shadow-1)] hover:shadow-[var(--shadow-2)] transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">
                      {v.make} {v.model} {v.year ?? ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {v.licensePlate ?? v.vin}
                    </p>
                  </div>
                  <ConnectionStatusChip status={v.connectionStatus} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ReadinessChip level={v.readinessLevel} score={v.readinessScore} />
                  <ObdRowChip plugged={v.obdIsPluggedIn} />
                  <JammingSnapshotChip count={v.jammingDetectedCount} />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {v.freshnessLabel} · {v.signalCoveragePercent}% coverage
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <FleetConnectivityDetailDrawer
        vehicle={selectedVehicle}
        open={!!selectedVehicle}
        onOpenChange={(open) => !open && setSelectedVehicle(null)}
      />
    </div>
  );
}
