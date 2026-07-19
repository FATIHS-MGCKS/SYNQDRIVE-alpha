import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Car,
  ChevronRight,
  Link2,
  Plug,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Signal,
  SignalZero,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonMetricGrid,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
  type StatusTone,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { api, type FleetConnectivityResponse, type FleetConnectivityVehicle } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  DashboardSectionLabel,
  META_TEXT_CLASS,
  ROW_BODY_CLASS,
  ROW_TITLE_CLASS,
} from '../dashboard/dashboardShell';
import { fhs } from '../fleet-health-service/fleet-health-service-shell';
import { FleetConnectivityDetailDrawer } from './FleetConnectivityDetailDrawer';
import {
  ConnectionStatusChip,
  DeviceConnectionWebhookChip,
  JammingSnapshotChip,
  ObdRowChip,
  ReadinessChip,
} from './fleet-connectivity.badges';
import {
  type FleetConnectionScopeFilter,
  type FleetReadinessFilter,
  type FleetSignalFilter,
  filterFleetConnectivityVehicles,
  hasActiveFleetFilters,
} from './fleet-connectivity.utils';

interface FleetConnectivityTabProps {
  /** When true, omits the standalone page header (Fleet hub provides top-level chrome). */
  embedded?: boolean;
}

const KPI_TONE: Record<
  'neutral' | 'info' | 'success' | 'watch' | 'critical' | 'warning',
  StatusTone
> = {
  neutral: 'neutral',
  info: 'info',
  success: 'success',
  watch: 'warning',
  critical: 'critical',
  warning: 'warning',
};

function ConnectivityVehicleIdentity({ vehicle }: { vehicle: FleetConnectivityVehicle }) {
  const title = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  return (
    <div className="min-w-[168px]">
      <p className={cn(ROW_TITLE_CLASS, 'text-[13px] tabular-nums')}>
        {vehicle.licensePlate ?? '—'}
      </p>
      <p className={cn(ROW_BODY_CLASS, 'mt-0.5 truncate text-[11px]')}>{title || vehicle.vin}</p>
    </div>
  );
}

export function FleetConnectivityTab({ embedded = false }: FleetConnectivityTabProps) {
  const { orgId } = useRentalOrg();
  const { t, locale } = useLanguage();
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
      setError(t('fleetConnectivity.loadError'));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

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
      labelKey: TranslationKey;
      value: string | number;
      status: 'neutral' | 'info' | 'success' | 'watch' | 'critical' | 'warning';
      icon: LucideIcon;
      onClick: () => void;
      active: boolean;
      hintKey?: TranslationKey;
    }> => [
      {
        id: 'total',
        labelKey: 'fleetConnectivity.kpi.total',
        value: s?.total ?? 0,
        status: 'neutral',
        icon: Car,
        onClick: () => {
          setStatusFilter('all');
          setSignalFilter('all');
          setReadinessFilter('all');
        },
        active: statusFilter === 'all' && signalFilter === 'all' && readinessFilter === 'all',
      },
      {
        id: 'connected',
        labelKey: 'fleetConnectivity.kpi.connected',
        value: s?.connected ?? 0,
        status: 'info',
        icon: Link2,
        onClick: () => setStatusFilter('connected'),
        active: statusFilter === 'connected',
      },
      {
        id: 'online',
        labelKey: 'fleetConnectivity.kpi.online',
        value: s?.online ?? 0,
        status: 'success',
        icon: Signal,
        onClick: () => setStatusFilter('online'),
        active: statusFilter === 'online',
      },
      {
        id: 'standby',
        labelKey: 'fleetConnectivity.kpi.standby',
        value: s?.standby ?? 0,
        status: 'watch',
        icon: Activity,
        onClick: () => setStatusFilter('standby'),
        active: statusFilter === 'standby',
      },
      {
        id: 'signal_delayed',
        labelKey: 'fleetConnectivity.kpi.signalDelayed',
        value: s?.signalDelayed ?? 0,
        status: 'watch',
        icon: Activity,
        onClick: () => setStatusFilter('signal_delayed'),
        active: statusFilter === 'signal_delayed',
      },
      {
        id: 'offline',
        labelKey: 'fleetConnectivity.kpi.offline',
        value: s?.offline ?? 0,
        status: 'critical',
        icon: SignalZero,
        onClick: () => setStatusFilter('offline'),
        active: statusFilter === 'offline',
      },
      {
        id: 'not_connected',
        labelKey: 'fleetConnectivity.kpi.notConnected',
        value: s?.notConnected ?? 0,
        status: 'neutral',
        icon: WifiOff,
        onClick: () => setStatusFilter('not_connected'),
        active: statusFilter === 'not_connected',
      },
      {
        id: 'obd_unplugged',
        labelKey: 'fleetConnectivity.kpi.obdUnplugged',
        value: s?.obdUnplugged ?? 0,
        status: 'warning',
        icon: Plug,
        onClick: () => setSignalFilter('obd_unplugged'),
        active: signalFilter === 'obd_unplugged',
        hintKey: 'fleetConnectivity.kpi.hint.obd',
      },
      {
        id: 'device_unplugged_webhook',
        labelKey: 'fleetConnectivity.kpi.deviceUnplugged',
        value: s?.deviceUnpluggedOpenEpisodes ?? 0,
        status: 'critical',
        icon: ShieldAlert,
        onClick: () => setSignalFilter('device_unplugged_webhook'),
        active: signalFilter === 'device_unplugged_webhook',
        hintKey: 'fleetConnectivity.kpi.hint.webhook',
      },
      {
        id: 'readiness',
        labelKey: 'fleetConnectivity.kpi.avgReadiness',
        value: s?.avgReadinessScore != null ? `${s.avgReadinessScore}%` : '—',
        status: 'info',
        icon: Radio,
        onClick: () => setReadinessFilter('watch'),
        active: readinessFilter === 'watch',
        hintKey: 'fleetConnectivity.kpi.hint.readiness',
      },
    ],
    [s, statusFilter, signalFilter, readinessFilter],
  );

  const columns: DataTableColumn<FleetConnectivityVehicle>[] = useMemo(
    () => [
      {
        key: 'vehicle',
        header: t('fleetConnectivity.col.vehicle'),
        cell: (v) => <ConnectivityVehicleIdentity vehicle={v} />,
      },
      {
        key: 'status',
        header: t('fleetConnectivity.col.status'),
        cell: (v) => <ConnectionStatusChip status={v.connectionStatus} />,
      },
      {
        key: 'freshness',
        header: t('fleetConnectivity.col.lastSignal'),
        className: 'hidden sm:table-cell',
        cell: (v) => (
          <span
            className={cn(
              'text-[12px] tabular-nums',
              v.freshnessLabel === 'Live'
                ? 'font-medium text-[color:var(--status-positive)]'
                : 'text-muted-foreground',
            )}
          >
            {v.freshnessLabel}
          </span>
        ),
      },
      {
        key: 'readiness',
        header: t('fleetConnectivity.col.readiness'),
        className: 'hidden lg:table-cell',
        cell: (v) => <ReadinessChip level={v.readinessLevel} score={v.readinessScore} />,
      },
      {
        key: 'coverage',
        header: t('fleetConnectivity.col.coverage'),
        className: 'hidden xl:table-cell',
        numeric: true,
        cell: (v) => (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {v.signalCoveragePercent}%
          </span>
        ),
      },
      {
        key: 'obd',
        header: t('fleetConnectivity.col.obd'),
        className: 'hidden lg:table-cell',
        cell: (v) => <ObdRowChip plugged={v.obdIsPluggedIn} />,
      },
      {
        key: 'deviceWebhook',
        header: t('fleetConnectivity.col.webhook'),
        className: 'hidden xl:table-cell',
        cell: (v) => <DeviceConnectionWebhookChip device={v.deviceConnection} />,
      },
      {
        key: 'station',
        header: t('fleetConnectivity.col.station'),
        className: 'hidden md:table-cell',
        cell: (v) => (
          <span className={META_TEXT_CLASS}>{v.station ?? '—'}</span>
        ),
      },
      {
        key: 'provider',
        header: t('fleetConnectivity.col.provider'),
        className: 'hidden xl:table-cell',
        cell: (v) => (
          <span className={cn(META_TEXT_CLASS, 'truncate')}>{v.provider}</span>
        ),
      },
      {
        key: 'jamming',
        header: t('fleetConnectivity.col.jamming'),
        className: 'hidden xl:table-cell',
        cell: (v) => <JammingSnapshotChip count={v.jammingDetectedCount} />,
      },
    ],
    [t],
  );

  const snapshotLabel = data?.generatedAt
    ? t('fleetConnectivity.snapshot', {
        time: new Date(data.generatedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB'),
      })
    : null;

  const contextHeader = (
    <header className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {!embedded ? (
            <h1 className="font-display text-[length:var(--text-display-md)] font-bold tracking-[var(--tracking-display)] text-foreground">
              {t('fleetTab.connectivity')}
            </h1>
          ) : (
            <DashboardSectionLabel className="mb-0">{t('fleetTab.connectivity')}</DashboardSectionLabel>
          )}
          <p className={META_TEXT_CLASS}>{t('fleetConnectivity.subtitle')}</p>
        </div>
        <StatusChip tone="info" className="max-w-sm text-[10px] leading-snug">
          {t('fleetConnectivity.monitoringBadge')}
        </StatusChip>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4">
        {contextHeader}
        <SkeletonMetricGrid count={8} />
        <SkeletonRows rows={8} className="surface-premium rounded-2xl p-4" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4">
        {contextHeader}
        <ErrorState
          title={t('fleetConnectivity.loadError')}
          error={error ?? 'Unknown error'}
          onRetry={() => void load()}
          retryLabel={t('fleetConnectivity.retry')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {contextHeader}

      <section className="space-y-2">
        <DashboardSectionLabel>{t('fleetConnectivity.kpiSection')}</DashboardSectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {kpiCards.map((kpi) => {
            const KpiIcon = kpi.icon;
            const tone = KPI_TONE[kpi.status];
            return (
              <button
                key={kpi.id}
                type="button"
                onClick={kpi.onClick}
                aria-pressed={kpi.active}
                className={cn(
                  fhs.kpiCard,
                  kpi.active && fhs.kpiCardActive,
                  kpi.status === 'critical' && Number(kpi.value) > 0 && fhs.kpiCardCritical,
                  kpi.status === 'warning' && Number(kpi.value) > 0 && fhs.kpiCardWarning,
                  kpi.status === 'success' && Number(kpi.value) > 0 && fhs.kpiCardSuccess,
                )}
              >
                <div className="flex items-center gap-1">
                  <KpiIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <p className={fhs.kpiTitle}>{t(kpi.labelKey)}</p>
                </div>
                <p
                  className={cn(
                    'mt-1',
                    fhs.kpiNumber,
                    tone === 'critical' && 'text-[color:var(--status-critical)]',
                    tone === 'warning' && 'text-[color:var(--status-watch)]',
                    tone === 'success' && 'text-[color:var(--status-positive)]',
                    tone === 'info' && 'text-[color:var(--brand-ink)]',
                    tone === 'neutral' && 'text-foreground',
                  )}
                >
                  {kpi.value}
                </p>
                {kpi.hintKey ? <p className={cn('mt-0.5 truncate', fhs.kpiHint)}>{t(kpi.hintKey)}</p> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className={cn(fhs.filterBar, 'space-y-3')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <DashboardSectionLabel className="mb-1">{t('fleetConnectivity.filterSection')}</DashboardSectionLabel>
            <p className={META_TEXT_CLASS}>
              {t('fleetConnectivity.showing', { shown: vehicles.length, total: s?.total ?? 0 })}
              {snapshotLabel ? ` · ${snapshotLabel}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-semibold rounded-lg px-2.5 py-1.5 text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              >
                {t('fleetConnectivity.clearFilters')}
              </button>
            ) : null}
            <Button
              type="button"
              variant="neutral"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
              className="h-8 gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              <span className="hidden sm:inline">{t('fleetConnectivity.refresh')}</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_160px_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('fleetConnectivity.searchPlaceholder')}
              className="w-full rounded-xl border border-border/60 bg-background/50 py-2 pl-9 pr-3 text-xs outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FleetConnectionScopeFilter)}
            className="rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs font-medium text-foreground"
          >
            <option value="all">{t('fleetConnectivity.filter.allStatuses')}</option>
            <option value="connected">Connected</option>
            <option value="online">Online</option>
            <option value="standby">Standby</option>
            <option value="signal_delayed">Signal delayed</option>
            <option value="offline">Offline</option>
            <option value="not_connected">Not connected</option>
          </select>
          <select
            value={readinessFilter}
            onChange={(e) => setReadinessFilter(e.target.value as FleetReadinessFilter)}
            className="rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs font-medium text-foreground"
          >
            <option value="all">{t('fleetConnectivity.filter.allReadiness')}</option>
            <option value="good">Good</option>
            <option value="watch">Watch</option>
            <option value="warning">Warning</option>
            <option value="no_data">No data</option>
          </select>
          <select
            value={signalFilter}
            onChange={(e) => setSignalFilter(e.target.value as FleetSignalFilter)}
            className="rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs font-medium text-foreground sm:col-span-2 lg:col-span-1"
          >
            <option value="all">{t('fleetConnectivity.filter.allSignals')}</option>
            <option value="obd_unplugged">OBD unplugged (snapshot)</option>
            <option value="device_unplugged_webhook">Device unplugged (webhook)</option>
            <option value="jamming">Jamming snapshot</option>
            <option value="missing_gps">Missing GPS</option>
            <option value="missing_odometer">Missing odometer</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {signalFilter === 'jamming' ? (
            <StatusChip tone="watch" className="text-[10px]">
              <ShieldAlert className="mr-1 inline h-3 w-3" />
              {t('fleetConnectivity.filter.jammingActive')}
            </StatusChip>
          ) : null}
          {data.thresholds ? (
            <StatusChip tone="neutral" className="text-[10px]">
              Online &lt; {data.thresholds.onlineMaxMinutes}m · Standby &lt;{' '}
              {data.thresholds.standbyMaxHours}h
            </StatusChip>
          ) : null}
        </div>
      </section>

      {vehicles.length === 0 ? (
        <EmptyState
          icon={<Car className="h-5 w-5" />}
          title={
            filtersActive
              ? t('fleetConnectivity.emptyFiltered')
              : t('fleetConnectivity.emptyDefault')
          }
          description={
            filtersActive
              ? t('fleetConnectivity.emptyFilteredHint')
              : t('fleetConnectivity.emptyDefaultHint')
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
              rowActions={() => <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              card
            />
          </div>

          <div className="space-y-2 md:hidden">
            {vehicles.map((v) => (
              <button
                key={v.vehicleId}
                type="button"
                onClick={() => setSelectedVehicle(v)}
                className="surface-premium w-full rounded-2xl p-3 text-left shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-1)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <ConnectivityVehicleIdentity vehicle={v} />
                  <ConnectionStatusChip status={v.connectionStatus} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <ReadinessChip level={v.readinessLevel} score={v.readinessScore} />
                  <ObdRowChip plugged={v.obdIsPluggedIn} />
                  <DeviceConnectionWebhookChip device={v.deviceConnection} />
                  <JammingSnapshotChip count={v.jammingDetectedCount} />
                </div>
                <p className={cn(META_TEXT_CLASS, 'mt-2 tabular-nums')}>
                  {v.freshnessLabel} · {v.signalCoveragePercent}% {t('fleetConnectivity.col.coverage').toLowerCase()}
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
