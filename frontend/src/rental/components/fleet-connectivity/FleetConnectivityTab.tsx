import {
  AlertTriangle,
  Car,
  ChevronRight,
  Radio,
  RefreshCw,
  Search,
  Signal,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonMetricGrid,
  SkeletonRows,
  type DataTableColumn,
  type StatusTone,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import type { FleetConnectivityListItem } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { META_TEXT_CLASS, ROW_BODY_CLASS, ROW_TITLE_CLASS } from '../dashboard/dashboardShell';
import { fhs } from '../fleet-health-service/fleet-health-service-shell';
import { FleetConnectivityDetailDrawer } from './FleetConnectivityDetailDrawer';
import { OverallStateChip } from './fleet-connectivity.badges';
import {
  filterFleetConnectivityItems,
  hasActiveConnectivityFilters,
  type FleetConnectivityKpiFilter,
  type FleetConnectivityStateFilter,
} from './fleet-connectivity.filters';
import {
  formatLastTelemetry,
  primaryListHint,
  vehicleTitle,
} from './fleet-connectivity.presentation';
import { useFleetConnectivityList } from './useFleetConnectivityList';

interface FleetConnectivityTabProps {
  /** When true, omits the standalone page header (Fleet hub provides top-level chrome). */
  embedded?: boolean;
}

const KPI_TONE: Record<'neutral' | 'success' | 'watch' | 'critical' | 'warning', StatusTone> = {
  neutral: 'neutral',
  success: 'success',
  watch: 'warning',
  critical: 'critical',
  warning: 'warning',
};

function ConnectivityVehicleIdentity({ item }: { item: FleetConnectivityListItem }) {
  const v = item.vehicle;
  return (
    <div className="min-w-[168px]">
      <p className={cn(ROW_TITLE_CLASS, 'text-[13px] tabular-nums')}>
        {v.licensePlate ?? '—'}
      </p>
      <p className={cn(ROW_BODY_CLASS, 'mt-0.5 truncate text-[11px]')}>{vehicleTitle(v)}</p>
    </div>
  );
}

function ConnectivityListCard({
  item,
  t,
  locale,
  onOpen,
  actionLabel,
}: {
  item: FleetConnectivityListItem;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  locale: string;
  onOpen: () => void;
  actionLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-premium w-full rounded-2xl p-3 text-left shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      aria-label={`${item.vehicle.licensePlate ?? item.vehicle.make} — ${actionLabel}`}
    >
      <div className="flex items-start justify-between gap-2">
        <ConnectivityVehicleIdentity item={item} />
        <OverallStateChip state={item.overallState} t={t} />
      </div>
      <p className={cn(META_TEXT_CLASS, 'mt-2 tabular-nums')}>
        {formatLastTelemetry(item.lastTelemetryAt, t, locale)}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-foreground">{primaryListHint(item, t)}</p>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-medium text-[var(--brand)]">
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </div>
    </button>
  );
}

export function FleetConnectivityTab({ embedded = false }: FleetConnectivityTabProps) {
  const { orgId } = useRentalOrg();
  const { t, locale } = useLanguage();
  const { data, loading, error, reload: load } = useFleetConnectivityList(
    orgId,
    t('fleetConnectivity.loadError'),
  );

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<FleetConnectivityKpiFilter>('all');
  const [stateFilter, setStateFilter] = useState<FleetConnectivityStateFilter>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!data?.items) return [];
    return filterFleetConnectivityItems(data.items, {
      search,
      kpiFilter,
      stateFilter,
    });
  }, [data, search, kpiFilter, stateFilter]);

  const s = data?.summary;
  const filtersActive = hasActiveConnectivityFilters({ search, kpiFilter, stateFilter });

  const clearFilters = () => {
    setSearch('');
    setKpiFilter('all');
    setStateFilter('all');
  };

  const kpiCards = useMemo(
    (): Array<{
      id: FleetConnectivityKpiFilter;
      labelKey: TranslationKey;
      value: number;
      status: 'neutral' | 'success' | 'watch' | 'critical' | 'warning';
      icon: LucideIcon;
      hintKey?: TranslationKey;
    }> => [
      {
        id: 'action_required',
        labelKey: 'fleetConnectivity.kpi.actionRequired',
        value: s?.actionRequired ?? 0,
        status: 'critical',
        icon: AlertTriangle,
        hintKey: 'fleetConnectivity.kpi.hint.actionRequired',
      },
      {
        id: 'telemetry_active',
        labelKey: 'fleetConnectivity.kpi.telemetryActive',
        value: s?.telemetryActive ?? 0,
        status: 'success',
        icon: Signal,
      },
      {
        id: 'standby',
        labelKey: 'fleetConnectivity.kpi.standby',
        value: s?.standby ?? 0,
        status: 'watch',
        icon: Radio,
      },
      {
        id: 'no_data_source',
        labelKey: 'fleetConnectivity.kpi.noDataSource',
        value: s?.noActiveDataSource ?? 0,
        status: 'neutral',
        icon: WifiOff,
      },
    ],
    [s],
  );

  const columns: DataTableColumn<FleetConnectivityListItem>[] = useMemo(
    () => [
      {
        key: 'vehicle',
        header: t('fleetConnectivity.col.vehicle'),
        cell: (item) => <ConnectivityVehicleIdentity item={item} />,
      },
      {
        key: 'state',
        header: t('fleetConnectivity.col.currentState'),
        cell: (item) => <OverallStateChip state={item.overallState} t={t} />,
      },
      {
        key: 'lastData',
        header: t('fleetConnectivity.col.lastData'),
        className: 'hidden sm:table-cell',
        cell: (item) => (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {formatLastTelemetry(item.lastTelemetryAt, t, locale)}
          </span>
        ),
      },
      {
        key: 'hint',
        header: t('fleetConnectivity.col.priorityHint'),
        cell: (item) => (
          <span className="text-[12px] leading-snug text-foreground">{primaryListHint(item, t)}</span>
        ),
      },
      {
        key: 'station',
        header: t('fleetConnectivity.col.station'),
        className: 'hidden lg:table-cell',
        cell: (item) => (
          <span className={META_TEXT_CLASS}>{item.vehicle.station ?? '—'}</span>
        ),
      },
      {
        key: 'action',
        header: t('fleetConnectivity.col.action'),
        className: 'w-[88px] text-right',
        cell: () => (
          <span className="text-[11px] font-semibold text-[var(--brand)]">
            {t('fleetConnectivity.openDetail')}
          </span>
        ),
      },
    ],
    [t, locale],
  );

  const snapshotLabel = data?.generatedAt
    ? t('fleetConnectivity.snapshot', {
        time: new Date(data.generatedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB'),
      })
    : null;

  const headerActions = (
    <Button
      type="button"
      variant="neutral"
      size="sm"
      disabled={loading}
      onClick={() => void load()}
      className="h-8 gap-1.5"
      aria-label={t('fleetConnectivity.refresh')}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
      <span className="hidden sm:inline">{t('fleetConnectivity.refresh')}</span>
    </Button>
  );

  const contextHeader = embedded ? (
    <div className="mb-2">
      <p className={META_TEXT_CLASS}>{t('fleetConnectivity.monitoringBadge')}</p>
    </div>
  ) : (
    <PageHeader
      variant="page"
      title={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span>{t('fleetTab.connectivity')}</span>
          {s?.total != null ? (
            <span className="text-[13px] font-normal text-muted-foreground tabular-nums">
              {t('fleetConnectivity.totalVehicles', { total: s.total })}
            </span>
          ) : null}
        </span>
      }
      actions={headerActions}
    />
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4">
        {contextHeader}
        <SkeletonMetricGrid count={4} />
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
      {embedded ? (
        <div className="flex justify-end">{headerActions}</div>
      ) : null}

      <section aria-label={t('fleetConnectivity.kpiSection')} className="space-y-2">
        <p className="sq-section-label">{t('fleetConnectivity.kpiSection')}</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => {
            const KpiIcon = kpi.icon;
            const active = kpiFilter === kpi.id;
            const tone = KPI_TONE[kpi.status];
            return (
              <button
                key={kpi.id}
                type="button"
                onClick={() => setKpiFilter(kpi.id)}
                aria-pressed={active}
                aria-label={t(kpi.labelKey)}
                className={cn(
                  fhs.kpiCard,
                  active && fhs.kpiCardActive,
                  kpi.status === 'critical' && kpi.value > 0 && fhs.kpiCardCritical,
                  kpi.status === 'warning' && kpi.value > 0 && fhs.kpiCardWarning,
                  kpi.status === 'success' && kpi.value > 0 && fhs.kpiCardSuccess,
                )}
              >
                <div className="flex items-center gap-1">
                  <KpiIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  <p className={fhs.kpiTitle}>{t(kpi.labelKey)}</p>
                </div>
                <p
                  className={cn(
                    'mt-1',
                    fhs.kpiNumber,
                    tone === 'critical' && 'text-[color:var(--status-critical)]',
                    tone === 'warning' && 'text-[color:var(--status-watch)]',
                    tone === 'success' && 'text-[color:var(--status-positive)]',
                    tone === 'neutral' && 'text-foreground',
                  )}
                >
                  {kpi.value}
                </p>
                {kpi.hintKey ? (
                  <p className={cn('mt-0.5 truncate', fhs.kpiHint)}>{t(kpi.hintKey)}</p>
                ) : null}
              </button>
            );
          })}
        </div>
        {s && (s.actionRequiredOffline > 0 || s.actionRequiredSoftOffline > 0) ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {s.actionRequiredOffline > 0 ? (
              <span>
                {t('fleetConnectivity.kpi.breakdown.offline', { count: s.actionRequiredOffline })}
              </span>
            ) : null}
            {s.actionRequiredSoftOffline > 0 ? (
              <span>
                {t('fleetConnectivity.kpi.breakdown.softOffline', {
                  count: s.actionRequiredSoftOffline,
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={cn(fhs.filterBar, 'space-y-3')} aria-label={t('fleetConnectivity.filterSection')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="sq-section-label mb-1">{t('fleetConnectivity.filterSection')}</p>
            <p className={META_TEXT_CLASS}>
              {t('fleetConnectivity.showing', { shown: items.length, total: s?.total ?? 0 })}
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
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="relative">
            <label htmlFor="fleet-connectivity-search" className="sr-only">
              {t('fleetConnectivity.searchPlaceholder')}
            </label>
            <Search
              className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="fleet-connectivity-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('fleetConnectivity.searchPlaceholder')}
              className="w-full rounded-xl border border-border/60 bg-background/50 py-2 pl-9 pr-3 text-xs outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>
          <div>
            <label htmlFor="fleet-connectivity-state-filter" className="sr-only">
              {t('fleetConnectivity.filter.stateLabel')}
            </label>
            <select
              id="fleet-connectivity-state-filter"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as FleetConnectivityStateFilter)}
              className="w-full rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs font-medium text-foreground"
            >
              <option value="all">{t('fleetConnectivity.filter.allStates')}</option>
              <option value="TELEMETRY_ACTIVE">{t('fleetConnectivity.state.TELEMETRY_ACTIVE')}</option>
              <option value="STANDBY">{t('fleetConnectivity.state.STANDBY')}</option>
              <option value="SOFT_OFFLINE">{t('fleetConnectivity.state.SOFT_OFFLINE')}</option>
              <option value="OFFLINE">{t('fleetConnectivity.state.OFFLINE')}</option>
              <option value="DEVICE_UNPLUGGED">{t('fleetConnectivity.state.DEVICE_UNPLUGGED')}</option>
              <option value="AUTHORIZATION_REQUIRED">
                {t('fleetConnectivity.state.AUTHORIZATION_REQUIRED')}
              </option>
              <option value="NO_ACTIVE_DATA_SOURCE">
                {t('fleetConnectivity.state.NO_ACTIVE_DATA_SOURCE')}
              </option>
              <option value="INTEGRATION_ERROR">{t('fleetConnectivity.state.INTEGRATION_ERROR')}</option>
              <option value="UNKNOWN">{t('fleetConnectivity.state.UNKNOWN')}</option>
            </select>
          </div>
        </div>
      </section>

      {items.length === 0 ? (
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
              rows={items}
              getRowKey={(item) => item.vehicle.vehicleId}
              onRowClick={(item) => setSelectedVehicleId(item.vehicle.vehicleId)}
              rowActions={() => <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
              card
            />
          </div>

          <div className="space-y-2 md:hidden" role="list" aria-label={t('fleetConnectivity.mobileList')}>
            {items.map((item) => (
              <ConnectivityListCard
                key={item.vehicle.vehicleId}
                item={item}
                t={t}
                locale={locale}
                onOpen={() => setSelectedVehicleId(item.vehicle.vehicleId)}
                actionLabel={t('fleetConnectivity.openDetail')}
              />
            ))}
          </div>
        </>
      )}

      <FleetConnectivityDetailDrawer
        orgId={orgId}
        vehicleId={selectedVehicleId}
        open={!!selectedVehicleId}
        onOpenChange={(open) => !open && setSelectedVehicleId(null)}
      />
    </div>
  );
}
