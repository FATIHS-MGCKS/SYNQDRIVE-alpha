import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  Car,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Star,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, type Station, type StationOverviewStats, type StationsStats } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  PageHeader,
  StatusChip,
  EmptyState,
  ErrorState,
  SkeletonMetricGrid,
  SkeletonCard,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import {
  formatStationAddress,
  getStationWarnings,
  stationHasProblems,
  stationStatusTone,
  stationTypeTone,
} from '../../lib/stationUtils';
import { StationFormModal } from './StationFormModal';
import { StationAssignVehicleModal } from './StationAssignVehicleModal';

type ViewMode = 'cards' | 'list';

type Filters = {
  status: '' | Station['status'];
  type: '' | Station['type'];
  city: string;
  pickupOnly: boolean;
  returnOnly: boolean;
  problemsOnly: boolean;
  primaryOnly: boolean;
};

interface StationsViewProps {
  onOpenStation?: (station: Station) => void;
}

interface StationKpiCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: 'critical' | 'watch' | 'success';
  subdued?: boolean;
}

function StationKpiCard({
  label,
  value,
  icon,
  tone,
  subdued = false,
}: StationKpiCardProps) {
  const numericValue = typeof value === 'number' ? value : null;
  const isCritical = tone === 'critical' && numericValue !== null && numericValue > 0;
  const isWatch = tone === 'watch' && numericValue !== null && numericValue > 0;
  const isSuccess = tone === 'success' && numericValue !== null && numericValue > 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden border text-left',
        'min-h-[96px] rounded-lg surface-premium/55 px-2.5 py-2',
        isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
        isWatch && 'border-[color:var(--status-watch)]/30 surface-premium/55',
        isSuccess && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
        !isCritical && !isWatch && !isSuccess && 'border-border/45',
      )}
      aria-label={`${label}: ${value}`}
    >
      <div className="flex h-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
              (subdued || value === '—') && 'text-muted-foreground',
              isCritical && 'text-[color:var(--status-critical)]',
              isSuccess && 'text-[color:var(--status-positive)]',
              isWatch && 'text-[color:var(--status-watch)]',
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            isCritical && 'sq-tone-critical',
            isWatch && 'sq-tone-watch',
            isSuccess && 'sq-tone-success',
            !isCritical && !isWatch && !isSuccess && 'bg-muted text-muted-foreground',
          )}
        >
          {icon}
        </div>
      </div>
      {isWatch ? (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-watch)]"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

export function StationsView({ onOpenStation }: StationsViewProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();

  const [stations, setStations] = useState<Station[]>([]);
  const [stats, setStats] = useState<StationsStats | null>(null);
  const [overviewById, setOverviewById] = useState<Record<string, StationOverviewStats>>({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    status: '',
    type: '',
    city: '',
    pickupOnly: false,
    returnOnly: false,
    problemsOnly: false,
    primaryOnly: false,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [assignStation, setAssignStation] = useState<Station | null>(null);

  const loadOverviewBatch = useCallback(async (list: Station[]) => {
    if (!orgId || list.length === 0) return;
    setStatsLoading(true);
    const entries: Record<string, StationOverviewStats> = {};
    const chunkSize = 8;
    for (let i = 0; i < list.length; i += chunkSize) {
      const chunk = list.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((s) =>
          api.stations.overviewStats(orgId, s.id).catch(() => null),
        ),
      );
      chunk.forEach((s, idx) => {
        if (results[idx]) entries[s.id] = results[idx] as StationOverviewStats;
      });
    }
    setOverviewById(entries);
    setStatsLoading(false);
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, agg] = await Promise.all([
        api.stations.list(orgId),
        api.stations.stats(orgId).catch(() => null),
      ]);
      const rows = Array.isArray(list) ? list : [];
      setStations(rows);
      setStats(agg);
      void loadOverviewBatch(rows);
    } catch (e) {
      setError((e as Error).message || t('stations.errorLoad'));
      setStations([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, loadOverviewBatch, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const cities = useMemo(
    () => [...new Set(stations.map((s) => s.city).filter(Boolean) as string[])].sort(),
    [stations],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stations.filter((s) => {
      if (filters.status && s.status !== filters.status) return false;
      if (filters.type && s.type !== filters.type) return false;
      if (filters.city && s.city !== filters.city) return false;
      if (filters.pickupOnly && !s.pickupEnabled) return false;
      if (filters.returnOnly && !s.returnEnabled) return false;
      if (filters.primaryOnly && !s.isPrimary) return false;
      if (filters.problemsOnly && !stationHasProblems(s, overviewById[s.id])) return false;
      if (!q) return true;
      const hay = [s.name, s.code, s.city, s.address, s.addressLine1, s.postalCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [stations, search, filters, overviewById]);

  const kpi = useMemo(() => {
    const overviews = Object.values(overviewById);
    const problemsCount = stations.filter((s) =>
      stationHasProblems(s, overviewById[s.id]),
    ).length;
    return {
      active: stats?.activeStations ?? stations.filter((s) => s.status === 'ACTIVE').length,
      vehicles: stats?.totalVehicles ?? stations.reduce((n, s) => n + (s.vehicleCount ?? 0), 0),
      available: overviews.reduce((n, o) => n + o.availableVehicles, 0),
      todayPickups: overviews.reduce((n, o) => n + o.todayPickups, 0),
      todayReturns: overviews.reduce((n, o) => n + o.todayReturns, 0),
      problems: problemsCount,
    };
  }, [stats, stations, overviewById]);

  const handleCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (station: Station) => {
    setEditing(station);
    setFormOpen(true);
    setMenuId(null);
  };

  const handleSave = async (payload: Parameters<typeof api.stations.create>[1]) => {
    if (!orgId) return;
    setSaving(true);
    try {
      if (editing) await api.stations.update(orgId, editing.id, payload);
      else await api.stations.create(orgId, payload);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (station: Station) => {
    if (!orgId) return;
    setMenuId(null);
    try {
      await api.stations.archive(orgId, station.id);
      toast.success(t('stations.archived'));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleSetPrimary = async (station: Station) => {
    if (!orgId) return;
    setMenuId(null);
    try {
      await api.stations.setPrimary(orgId, station.id);
      toast.success(t('stations.setPrimaryDone'));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const runBackfill = async () => {
    if (!orgId || backfillRunning) return;
    setBackfillRunning(true);
    try {
      const res = await api.stations.backfillCoordinates(orgId);
      toast.success(
        `${t('stations.backfillDone')}: ${res.totalGeocoded}/${res.totalChecked}`,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBackfillRunning(false);
    }
  };

  const missingCoords = stations.filter((s) => s.latitude == null || s.longitude == null).length;

  const activeFilterCount = [
    filters.status,
    filters.type,
    filters.city,
    filters.pickupOnly,
    filters.returnOnly,
    filters.problemsOnly,
    filters.primaryOnly,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 pb-8 animate-fade-up">
      <PageHeader
        title={t('stations.pageTitle')}
        className="mb-4 flex-row items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-4"
        actions={(
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {missingCoords > 0 && (
              <Button
                type="button"
                onClick={() => void runBackfill()}
                disabled={backfillRunning}
                variant="neutral"
                size="sm"
                className="hidden sm:inline-flex"
              >
                {backfillRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t('stations.backfillCoords')} ({missingCoords})
              </Button>
            )}
            <Button
              type="button"
              onClick={() => setViewMode((m) => (m === 'cards' ? 'list' : 'cards'))}
              variant="secondary"
              size="sm"
              aria-label={viewMode === 'cards' ? t('stations.viewList') : t('stations.viewCards')}
            >
              {viewMode === 'cards' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
              <span className="hidden min-[440px]:inline">
                {viewMode === 'cards' ? t('stations.viewList') : t('stations.viewCards')}
              </span>
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              variant="primary"
              size="sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden min-[400px]:inline">{t('stations.newStation')}</span>
              <span className="min-[400px]:hidden">{t('stations.newStation').split(' ')[0]}</span>
            </Button>
          </div>
        )}
      />

      {loading ? (
        <>
          <SkeletonMetricGrid
            count={6}
            className="gap-3 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-6"
            cardClassName="min-h-[96px] rounded-lg border border-border/45 surface-premium/55 p-2.5"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : (
        <>
          <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
            <StationKpiCard
              label={t('stations.kpi.active')}
              value={kpi.active}
              icon={<MapPin className="h-3 w-3" />}
              tone="success"
              subdued={kpi.active === 0}
            />
            <StationKpiCard
              label={t('stations.kpi.vehicles')}
              value={kpi.vehicles}
              icon={<Car className="h-3 w-3" />}
            />
            <StationKpiCard
              label={t('stations.kpi.available')}
              value={statsLoading && !Object.keys(overviewById).length ? '—' : kpi.available}
              icon={<Car className="h-3 w-3" />}
              subdued={statsLoading && !Object.keys(overviewById).length}
            />
            <StationKpiCard
              label={t('stations.kpi.todayPickups')}
              value={statsLoading && !Object.keys(overviewById).length ? '—' : kpi.todayPickups}
              icon={<Users className="h-3 w-3" />}
              subdued={statsLoading && !Object.keys(overviewById).length}
            />
            <StationKpiCard
              label={t('stations.kpi.todayReturns')}
              value={statsLoading && !Object.keys(overviewById).length ? '—' : kpi.todayReturns}
              icon={<Users className="h-3 w-3" />}
              subdued={statsLoading && !Object.keys(overviewById).length}
            />
            <StationKpiCard
              label={t('stations.kpi.problems')}
              value={kpi.problems}
              icon={<AlertTriangle className="h-3 w-3" />}
              tone="watch"
              subdued={kpi.problems === 0}
            />
          </div>

          <div className="surface-premium rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('stations.searchPlaceholder')}
                className="flex-1 px-3 py-2 rounded-lg border border-border/70 bg-background text-sm outline-none focus:border-[color:var(--brand)]"
              />
              <Button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                variant="neutral"
                size="sm"
                className="justify-center"
              >
                {t('stations.filters')}
                {activeFilterCount > 0 ? (
                  <span className="sq-chip sq-chip-info !text-[10px]">{activeFilterCount}</span>
                ) : null}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>

            {filtersOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-border/50">
                <select
                  className="px-3 py-2 rounded-lg border border-border/70 surface-premium text-sm"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters['status'] }))}
                >
                  <option value="">{t('stations.filter.allStatus')}</option>
                  <option value="ACTIVE">{t('stations.status.ACTIVE')}</option>
                  <option value="INACTIVE">{t('stations.status.INACTIVE')}</option>
                  <option value="ARCHIVED">{t('stations.status.ARCHIVED')}</option>
                </select>
                <select
                  className="px-3 py-2 rounded-lg border border-border/70 surface-premium text-sm"
                  value={filters.type}
                  onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters['type'] }))}
                >
                  <option value="">{t('stations.filter.allTypes')}</option>
                  {(['MAIN', 'BRANCH', 'PARKING', 'PARTNER', 'TEMPORARY'] as const).map((v) => (
                    <option key={v} value={v}>{t(`stations.type.${v}`)}</option>
                  ))}
                </select>
                <select
                  className="px-3 py-2 rounded-lg border border-border/70 surface-premium text-sm"
                  value={filters.city}
                  onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                >
                  <option value="">{t('stations.filter.allCities')}</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2 text-xs items-center">
                  {(
                    [
                      ['pickupOnly', t('stations.filter.pickup')],
                      ['returnOnly', t('stations.filter.return')],
                      ['problemsOnly', t('stations.filter.problems')],
                      ['primaryOnly', t('stations.filter.primary')],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={filters[key]}
                        onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {stations.length === 0 ? (
            <EmptyState
              icon={<MapPin className="w-8 h-8" />}
              title={t('stations.empty.title')}
              description={t('stations.empty.description')}
              action={(
                <Button type="button" onClick={handleCreate} size="sm">
                  {t('stations.empty.action')}
                </Button>
              )}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={t('stations.empty.filteredTitle')}
              description={t('stations.empty.filteredDescription')}
            />
          ) : (
            <div className={viewMode === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-2'}>
              {filtered.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  overview={overviewById[station.id]}
                  viewMode={viewMode}
                  menuOpen={menuId === station.id}
                  onToggleMenu={() => setMenuId((id) => (id === station.id ? null : station.id))}
                  onOpen={() => onOpenStation?.(station)}
                  onEdit={() => handleEdit(station)}
                  onArchive={() => void handleArchive(station)}
                  onSetPrimary={() => void handleSetPrimary(station)}
                  onAssign={() => setAssignStation(station)}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}

      <StationFormModal
        open={formOpen}
        station={editing}
        saving={saving}
        orgId={orgId}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSave}
      />
      <StationAssignVehicleModal
        station={assignStation}
        onClose={() => setAssignStation(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function StationCard({
  station,
  overview,
  viewMode,
  menuOpen,
  onToggleMenu,
  onOpen,
  onEdit,
  onArchive,
  onSetPrimary,
  onAssign,
  t,
}: {
  station: Station;
  overview?: StationOverviewStats;
  viewMode: ViewMode;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onSetPrimary: () => void;
  onAssign: () => void;
  t: (k: TranslationKey) => string;
}) {
  const warnings = getStationWarnings(station, overview);
  const address = formatStationAddress(station);

  const metrics = (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <MetricPill label={t('stations.card.total')} value={overview?.totalVehicles ?? station.vehicleCount ?? 0} />
      <MetricPill label={t('stations.card.available')} value={overview?.availableVehicles ?? '—'} />
      <MetricPill label={t('stations.card.pickups')} value={overview?.todayPickups ?? '—'} />
      <MetricPill label={t('stations.card.returns')} value={overview?.todayReturns ?? '—'} />
    </div>
  );

  const warningBadges = warnings.length > 0 && (
    <div className="flex flex-wrap gap-1 mt-2">
      {warnings.map((w) => (
        <StatusChip key={w} tone="warning">
          {t(`stations.warning.${w}`)}
        </StatusChip>
      ))}
    </div>
  );

  const actions = (
    <div className="relative">
      <button type="button" onClick={onToggleMenu} className="p-2 rounded-lg hover:bg-muted/60">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] surface-premium rounded-lg border border-border shadow-lg py-1 text-sm">
          <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50" onClick={onOpen}>{t('stations.action.open')}</button>
          <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50" onClick={onEdit}>{t('stations.action.edit')}</button>
          <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50" onClick={onAssign}>{t('stations.action.assignVehicle')}</button>
          {!station.isPrimary && (
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50" onClick={onSetPrimary}>{t('stations.action.setPrimary')}</button>
          )}
          {station.status !== 'ARCHIVED' && (
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-[color:var(--status-critical)]" onClick={onArchive}>
              <span className="inline-flex items-center gap-1.5"><Archive className="w-3.5 h-3.5" />{t('stations.action.archive')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (viewMode === 'list') {
    return (
      <div className="surface-premium rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <button type="button" onClick={onOpen} className="flex-1 text-left min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm truncate">{station.name}</span>
            <StatusChip tone={stationStatusTone(station.status)}>{t(`stations.status.${station.status}`)}</StatusChip>
            <StatusChip tone={stationTypeTone(station.type)}>{t(`stations.type.${station.type}`)}</StatusChip>
            {station.isPrimary && <StatusChip tone="info"><Star className="w-3 h-3 inline mr-0.5" />{t('stations.primary')}</StatusChip>}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{address || '—'}</p>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Car className="w-3.5 h-3.5" />{overview?.totalVehicles ?? station.vehicleCount ?? 0}</span>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{overview?.openTasks ?? 0}</span>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="surface-premium rounded-xl p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="text-left min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-semibold text-sm truncate">{station.name}</h3>
            {station.isPrimary && (
              <StatusChip tone="info"><Star className="w-3 h-3 inline mr-0.5" />{t('stations.primary')}</StatusChip>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            <StatusChip tone={stationStatusTone(station.status)}>{t(`stations.status.${station.status}`)}</StatusChip>
            <StatusChip tone={stationTypeTone(station.type)}>{t(`stations.type.${station.type}`)}</StatusChip>
          </div>
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{address || '—'}</p>
        </button>
        {actions}
      </div>

      <div className="mt-3 flex-1">{metrics}</div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{t('stations.card.inService')}: {overview?.inServiceVehicles ?? '—'}</span>
        <span>{t('stations.card.tasks')}: {overview?.openTasks ?? '—'}</span>
        {overview?.capacityUsagePercent != null ? (
          <span>{t('stations.card.capacity')}: {overview.capacityUsagePercent}%</span>
        ) : null}
      </div>

      {warningBadges}

      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={onOpen} variant="neutral" size="sm" className="flex-1">
          {t('stations.action.open')}
        </Button>
        <Button type="button" onClick={onEdit} size="sm" className="flex-1">
          {t('stations.action.edit')}
        </Button>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
