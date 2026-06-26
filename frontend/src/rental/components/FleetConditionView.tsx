import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDot,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import {
  PageHeader,
  MetricCard,
  StatusChip,
  EmptyState,
  ErrorState,
  SkeletonMetricGrid,
  chipClassForTone,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { cn } from '../../components/ui/utils';

import { getShortModel } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import type { VehicleHealthResponse } from '../../lib/api';
import {
  moduleKeyToTab,
  type HealthDetailTab,
} from '../lib/health-detail-utils';
import { HealthVehicleDetailDrawer } from './health/HealthVehicleDetailDrawer';
import { HealthVehicleDetailPanel } from './health/HealthVehicleDetailPanel';
import {
  buildFleetHealthDisplay,
  computeFleetHealthKpis,
  formatRelativeTime,
  latestHealthGeneratedAt,
  matchesDataQualityFilter,
  matchesModuleFilter,
  matchesStatusFilter,
  operatorGroupForVehicle,
  priorityRank,
  vehicleLastUpdatedIso,
  type HealthIssueChip,
  type OperatorDataQualityFilter,
  type OperatorGroupKey,
  type OperatorModuleFilter,
  type OperatorSortMode,
  type OperatorStatusFilter,
} from '../lib/fleet-health-control-center';

export type ConditionCategory =
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'dtc'
  | 'service'
  | 'tuev'
  | 'bokraft'
  | 'driver-feedback'
  | 'alerts';

interface FleetConditionViewProps {
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
  embedded?: boolean;
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
}

type Tone = 'neutral' | 'success' | 'warning' | 'critical' | 'brand';

const GROUP_CONFIG: Record<
  OperatorGroupKey,
  { title: string; subtitle: string; emptyTitle: string; tone: Tone; icon: LucideIcon }
> = {
  action_required: {
    title: 'Action Required',
    subtitle: 'Blocked or critical — resolve before rental',
    emptyTitle: 'No critical vehicles right now.',
    tone: 'critical',
    icon: ShieldAlert,
  },
  needs_review: {
    title: 'Needs Review',
    subtitle: 'Warning signals — schedule inspection',
    emptyTitle: 'No vehicles need review.',
    tone: 'warning',
    icon: AlertTriangle,
  },
  limited_data: {
    title: 'Limited Data',
    subtitle: 'Health cannot be fully assessed — data is missing, delayed or unsupported.',
    emptyTitle: 'All vehicles have assessable health data.',
    tone: 'neutral',
    icon: CircleDot,
  },
  good: {
    title: 'Healthy',
    subtitle: 'Confirmed ready for rental',
    emptyTitle: 'No vehicle is currently fully ready.',
    tone: 'success',
    icon: ShieldCheck,
  },
};

const MODULE_FILTER_OPTIONS: Array<{ value: OperatorModuleFilter; label: string }> = [
  { value: 'all', label: 'All modules' },
  { value: 'battery', label: 'Battery' },
  { value: 'tires', label: 'Tires' },
  { value: 'brakes', label: 'Brakes' },
  { value: 'error_codes', label: 'DTC' },
  { value: 'service_compliance', label: 'Service / Compliance' },
  { value: 'complaints', label: 'Complaints' },
  { value: 'vehicle_alerts', label: 'OEM Alerts' },
];

const DATA_QUALITY_OPTIONS: Array<{ value: OperatorDataQualityFilter; label: string }> = [
  { value: 'all', label: 'All data quality' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'stale', label: 'Delayed data' },
  { value: 'no_tracking', label: 'No tracking' },
  { value: 'estimated', label: 'Estimated' },
];

const SORT_OPTIONS: Array<{ value: OperatorSortMode; label: string; helper: string }> = [
  { value: 'priority', label: 'Priority', helper: 'blocked & critical first' },
  { value: 'station', label: 'Station', helper: 'A-Z' },
  { value: 'license', label: 'License plate', helper: 'A-Z' },
  { value: 'updated', label: 'Last updated', helper: 'newest first' },
];

const MAX_VISIBLE_ISSUE_CHIPS = 3;

function toneClass(tone: Tone): string {
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  if (tone === 'brand') return 'sq-tone-brand';
  return 'sq-tone-neutral';
}

export function FleetConditionView({
  embedded = false,
  onOpenServiceCenter,
  onOpenExistingTask,
}: FleetConditionViewProps) {
  const systemDark = useSyncExternalStore(
    (onStoreChange) => {
      const el = document.documentElement;
      const obs = new MutationObserver(onStoreChange);
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );

  const { fleetVehicles, healthMap, healthLoading, healthError, reloadHealth } = useFleetVehicles();

  const [statusFilter, setStatusFilter] = useState<OperatorStatusFilter>('all');
  const [moduleFilter, setModuleFilter] = useState<OperatorModuleFilter>('all');
  const [dataQualityFilter, setDataQualityFilter] = useState<OperatorDataQualityFilter>('all');
  const [sortMode, setSortMode] = useState<OperatorSortMode>('priority');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<HealthDetailTab>('overview');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<OperatorGroupKey>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isModuleFilterOpen, setIsModuleFilterOpen] = useState(false);
  const [isDataFilterOpen, setIsDataFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const didInitGroups = useRef(false);

  const vehicleIds = useMemo(() => fleetVehicles.map((v) => v.id), [fleetVehicles]);
  const kpis = useMemo(
    () => computeFleetHealthKpis(vehicleIds, healthMap),
    [vehicleIds, healthMap],
  );
  const lastGeneratedAt = useMemo(() => latestHealthGeneratedAt(healthMap), [healthMap]);

  useEffect(() => {
    if (didInitGroups.current || healthLoading) return;
    let cancelled = false;
    didInitGroups.current = true;
    const next = new Set<OperatorGroupKey>();
    if (kpis.actionRequired > 0) {
      next.add('action_required');
    } else if (kpis.needsReview > 0) {
      next.add('needs_review');
    }
    if (kpis.healthy > 0 && kpis.healthy <= 8) next.add('good');
    void Promise.resolve().then(() => {
      if (!cancelled) setExpandedGroups(next);
    });
    return () => {
      cancelled = true;
    };
  }, [healthLoading, kpis]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = fleetVehicles.filter((v) => {
      const health = healthMap.get(v.id);
      if (!matchesStatusFilter(statusFilter, health)) return false;
      if (!matchesModuleFilter(moduleFilter, health)) return false;
      if (!matchesDataQualityFilter(dataQualityFilter, health)) return false;
      if (!q) return true;
      const haystack = [v.model, v.make, v.license, v.station, v.year?.toString()]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    const sorted = [...base];
    sorted.sort((a, b) => {
      const ha = healthMap.get(a.id);
      const hb = healthMap.get(b.id);
      if (sortMode === 'priority') {
        return (
          priorityRank(hb) - priorityRank(ha) ||
          (a.license ?? '').localeCompare(b.license ?? '', 'de')
        );
      }
      if (sortMode === 'station') {
        return (a.station ?? '').localeCompare(b.station ?? '', 'de');
      }
      if (sortMode === 'license') {
        return (a.license ?? '').localeCompare(b.license ?? '', 'de');
      }
      const ua = vehicleLastUpdatedIso(ha);
      const ub = vehicleLastUpdatedIso(hb);
      return Date.parse(ub ?? '0') - Date.parse(ua ?? '0');
    });
    return sorted;
  }, [
    fleetVehicles,
    healthMap,
    statusFilter,
    moduleFilter,
    dataQualityFilter,
    searchQuery,
    sortMode,
  ]);

  const groupedVehicles = useMemo(() => {
    const buckets: Record<OperatorGroupKey, typeof filtered> = {
      action_required: [],
      needs_review: [],
      limited_data: [],
      good: [],
    };
    for (const v of filtered) {
      const health = healthMap.get(v.id);
      buckets[operatorGroupForVehicle(health)].push(v);
    }
    return (Object.keys(GROUP_CONFIG) as OperatorGroupKey[]).map((key) => ({
      key,
      ...GROUP_CONFIG[key],
      vehicles: buckets[key],
    }));
  }, [filtered, healthMap]);

  const selectedVehicle = useMemo(
    () => fleetVehicles.find((v) => v.id === selectedVehicleId) ?? null,
    [fleetVehicles, selectedVehicleId],
  );
  const selectedHealth = selectedVehicleId ? healthMap.get(selectedVehicleId) : undefined;

  const openVehicleDetail = (vehicleId: string, tab: HealthDetailTab = 'overview') => {
    setSelectedVehicleId(vehicleId);
    setDetailTab(tab);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileDrawerOpen(true);
    }
  };

  const toggleGroup = (group: OperatorGroupKey) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const applyStatusFilter = (value: OperatorStatusFilter) => {
    setStatusFilter((prev) => (prev === value && value !== 'all' ? 'all' : value));
    if (value === 'action') {
      setExpandedGroups((prev) => new Set(prev).add('action_required'));
    } else if (value === 'review') {
      setExpandedGroups((prev) => new Set(prev).add('needs_review'));
    } else if (value === 'limited') {
      setExpandedGroups((prev) => new Set(prev).add('limited_data'));
    } else if (value === 'good') {
      setExpandedGroups((prev) => new Set(prev).add('good'));
    }
  };

  const clearSelection = () => {
    setStatusFilter('all');
    setModuleFilter('all');
    setDataQualityFilter('all');
    setSearchQuery('');
    setIsModuleFilterOpen(false);
    setIsDataFilterOpen(false);
    setIsSortOpen(false);
  };

  const advancedActiveCount =
    (moduleFilter !== 'all' ? 1 : 0) + (dataQualityFilter !== 'all' ? 1 : 0);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    moduleFilter !== 'all' ||
    dataQualityFilter !== 'all' ||
    searchQuery.trim().length > 0;

  const kpiCards = [
    {
      key: 'action',
      label: 'Action required',
      value: kpis.actionRequired,
      hint: kpis.blocked > 0 ? `${kpis.blocked} blocked` : 'blocked or critical',
      filter: 'action' as OperatorStatusFilter,
      tone: 'critical' as StatusTone,
      icon: ShieldAlert,
      emphasize: true,
    },
    {
      key: 'review',
      label: 'Needs review',
      value: kpis.needsReview,
      hint: 'inspect soon',
      filter: 'review' as OperatorStatusFilter,
      tone: 'warning' as StatusTone,
      icon: AlertTriangle,
    },
    {
      key: 'healthy',
      label: 'Healthy',
      value: kpis.healthy,
      hint: 'ready for rental',
      filter: 'good' as OperatorStatusFilter,
      tone: 'success' as StatusTone,
      icon: ShieldCheck,
    },
    {
      key: 'limited',
      label: 'Limited data',
      value: kpis.limited,
      hint: kpis.naModuleVehicles > 0 ? `${kpis.naModuleVehicles} no tracking` : 'not fully assessable',
      filter: 'limited' as OperatorStatusFilter,
      tone: 'noData' as StatusTone,
      icon: CircleDot,
    },
  ];

  const headerActions = (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => reloadHealth()}
        disabled={healthLoading}
        className="sq-press inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
      {lastGeneratedAt && (
        <span className="text-[10px] text-muted-foreground">
          Updated {formatRelativeTime(lastGeneratedAt)}
        </span>
      )}
    </div>
  );

  return (
    <div className={`${embedded ? '' : 'max-w-[1600px] mx-auto'}`}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-3">
        <div className="min-w-0 flex-1 space-y-4">
      {!embedded && (
        <PageHeader
          variant="full"
          title="Health Control Center"
          description="Operative vehicle readiness, safety signals and compliance blockers."
          actions={headerActions}
          status={
            healthLoading ? (
              <StatusChip
                tone="neutral"
                icon={
                  <span className="h-2 w-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
                }
              >
                Refreshing
              </StatusChip>
            ) : healthError ? (
              <StatusChip tone="critical">Data unavailable</StatusChip>
            ) : undefined
          }
          meta={
            lastGeneratedAt ? (
              <span>Health snapshot · {new Date(lastGeneratedAt).toLocaleString('de-DE')}</span>
            ) : undefined
          }
        />
      )}

      {embedded && (
        <div className="flex items-center justify-end gap-2">{headerActions}</div>
      )}

      {healthError && !healthLoading && (
        <ErrorState
          compact
          title="Health data could not be loaded."
          description={healthError}
          onRetry={() => reloadHealth()}
          retryLabel="Retry"
          className="sq-card rounded-2xl shadow-[var(--shadow-1)]"
        />
      )}

      {healthLoading && kpis.total === 0 ? (
        <SkeletonMetricGrid count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpiCards.map((card) => {
            const active = statusFilter === card.filter && card.filter !== 'all';
            const CardIcon = card.icon;
            return (
              <MetricCard
                key={card.key}
                label={card.label}
                value={card.value}
                hint={card.hint}
                icon={<CardIcon className="w-4 h-4" />}
                status={card.tone}
                onClick={() => applyStatusFilter(card.filter)}
                className={
                  active
                    ? 'ring-2 ring-[color:var(--brand)]'
                    : card.emphasize && card.value > 0
                      ? 'ring-1 ring-[color:color-mix(in_srgb,var(--status-critical)_25%,transparent)]'
                      : ''
                }
              />
            );
          })}
        </div>
      )}

      <div className="sq-card rounded-2xl p-3 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plate, vehicle or station…"
              className="w-full rounded-lg border border-border/70 bg-card py-2.5 pl-10 pr-4 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>

          <FilterDropdown
            label={`Sort: ${SORT_OPTIONS.find((o) => o.value === sortMode)?.label ?? 'Priority'}`}
            open={isSortOpen}
            onToggle={() => {
              setIsSortOpen(!isSortOpen);
              setIsModuleFilterOpen(false);
              setIsDataFilterOpen(false);
            }}
            active={false}
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSortMode(option.value);
                  setIsSortOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  sortMode === option.value
                    ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                {option.label}
                <span className="ml-1 text-[10px] text-muted-foreground">· {option.helper}</span>
              </button>
            ))}
          </FilterDropdown>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className={`sq-press flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
              advancedActiveCount > 0
                ? 'border-[color:color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                : 'border-border/70 bg-card text-foreground hover:bg-muted'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>More filters</span>
            {advancedActiveCount > 0 && (
              <span className="rounded-full bg-[color:var(--brand)] px-1.5 text-[9px] font-bold text-white">
                {advancedActiveCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearSelection}
              className="sq-press flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-2.5 text-[11px] font-semibold text-foreground transition-all hover:bg-muted"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {advancedOpen && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
            <FilterDropdown
              label={
                moduleFilter === 'all'
                  ? 'Module'
                  : MODULE_FILTER_OPTIONS.find((o) => o.value === moduleFilter)?.label ?? 'Module'
              }
              open={isModuleFilterOpen}
              onToggle={() => {
                setIsModuleFilterOpen(!isModuleFilterOpen);
                setIsDataFilterOpen(false);
                setIsSortOpen(false);
              }}
              active={moduleFilter !== 'all'}
            >
              {MODULE_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setModuleFilter(option.value === moduleFilter && option.value !== 'all' ? 'all' : option.value);
                    setIsModuleFilterOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    moduleFilter === option.value
                      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </FilterDropdown>

            <FilterDropdown
              label={
                dataQualityFilter === 'all'
                  ? 'Data quality'
                  : DATA_QUALITY_OPTIONS.find((o) => o.value === dataQualityFilter)?.label ??
                    'Data quality'
              }
              open={isDataFilterOpen}
              onToggle={() => {
                setIsDataFilterOpen(!isDataFilterOpen);
                setIsModuleFilterOpen(false);
                setIsSortOpen(false);
              }}
              active={dataQualityFilter !== 'all'}
            >
              {DATA_QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setDataQualityFilter(
                      option.value === dataQualityFilter && option.value !== 'all'
                        ? 'all'
                        : option.value,
                    );
                    setIsDataFilterOpen(false);
                  }}
                  className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    dataQualityFilter === option.value
                      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </FilterDropdown>

            <p className="ml-auto text-[10px] text-muted-foreground">
              Showing {filtered.length} of {kpis.total} vehicles
            </p>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="search" className="h-5 w-5" />}
          title="No vehicles found for this filter."
          className="sq-card rounded-2xl shadow-[var(--shadow-1)]"
        />
      ) : (
        <div className="space-y-2.5">
          {groupedVehicles
            .filter((group) => group.vehicles.length > 0)
            .map((group) => {
              const isGroupOpen = expandedGroups.has(group.key);
              const GroupIcon = group.icon;
              return (
                <section
                  key={group.key}
                  className="sq-card rounded-2xl overflow-hidden shadow-[var(--shadow-1)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-muted/35 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`h-7 w-7 rounded-lg flex items-center justify-center ${toneClass(group.tone)}`}
                      >
                        <GroupIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-[12.5px] font-semibold text-foreground">{group.title}</h2>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground tabular-nums">
                            {group.vehicles.length}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{group.subtitle}</p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isGroupOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isGroupOpen && (
                    <div className="border-t border-border/60 divide-y divide-border/40">
                      {group.vehicles.map((vehicle) => (
                        <OperatorVehicleRow
                          key={vehicle.id}
                          vehicle={vehicle}
                          health={healthMap.get(vehicle.id)}
                          healthLoading={healthLoading}
                          systemDark={systemDark}
                          selected={selectedVehicleId === vehicle.id}
                          onOpen={() => openVehicleDetail(vehicle.id)}
                          onModuleClick={(chipKey) =>
                            openVehicleDetail(vehicle.id, moduleKeyToTab(chipKey))
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
        </div>
      )}
        </div>

        {selectedVehicle && (
          <div className="hidden lg:flex w-[min(440px,36vw)] xl:w-[480px] shrink-0 sticky top-4 max-h-[calc(100vh-5rem)] rounded-2xl border border-border overflow-hidden shadow-[var(--shadow-1)]">
            <HealthVehicleDetailPanel
              vehicle={selectedVehicle}
              health={selectedHealth}
              healthLoading={healthLoading}
              initialTab={detailTab}
              onClose={() => setSelectedVehicleId(null)}
              onOpenServiceCenter={onOpenServiceCenter}
              onOpenExistingTask={onOpenExistingTask}
              className="w-full"
            />
          </div>
        )}
      </div>

      <HealthVehicleDetailDrawer
        vehicle={selectedVehicle}
        health={selectedHealth}
        healthLoading={healthLoading}
        open={mobileDrawerOpen && !!selectedVehicle}
        onOpenChange={(open) => {
          setMobileDrawerOpen(open);
          if (!open) setSelectedVehicleId(null);
        }}
        initialTab={detailTab}
        onOpenServiceCenter={onOpenServiceCenter}
        onOpenExistingTask={onOpenExistingTask}
      />
    </div>
  );
}

function FilterDropdown({
  label,
  open,
  onToggle,
  active,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`sq-press flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${
          active
            ? 'border-[color:color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
            : 'border-border/70 bg-card text-foreground hover:bg-muted'
        }`}
      >
        <span>{label}</span>
        <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg p-1">
          {children}
        </div>
      )}
    </div>
  );
}

function IssueChip({
  chip,
  onClick,
}: {
  chip: HealthIssueChip;
  onClick?: () => void;
}) {
  const className = `inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${chipClassForTone(chip.tone)}`;
  const content = (
    <>
      <span className="font-semibold">{chip.label}</span>
      <span className="opacity-60">·</span>
      <span className="truncate">{chip.detail}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={chip.reason} className={`${className} sq-press`}>
        {content}
      </button>
    );
  }
  return (
    <span className={className} title={chip.reason}>
      {content}
    </span>
  );
}

function OperatorVehicleRow({
  vehicle,
  health,
  healthLoading,
  systemDark,
  selected,
  onOpen,
  onModuleClick,
}: {
  vehicle: ReturnType<typeof useFleetVehicles>['fleetVehicles'][number];
  health: VehicleHealthResponse | undefined;
  healthLoading: boolean;
  systemDark: boolean;
  selected: boolean;
  onOpen: () => void;
  onModuleClick: (moduleKey: HealthIssueChip['key']) => void;
}) {
  const brand = getBrandFromModel({ make: vehicle.make, model: vehicle.model });
  const display = buildFleetHealthDisplay(health);

  const odomKm =
    vehicle.odometerKm != null && vehicle.odometerKm > 0
      ? Number(vehicle.odometerKm)
      : typeof vehicle.odometer === 'number' &&
          Number.isFinite(vehicle.odometer) &&
          vehicle.odometer > 0
        ? vehicle.odometer
        : null;
  const odometer = odomKm != null ? `${Math.round(odomKm).toLocaleString('de-DE')} km` : '—';
  const lastUpdated = formatRelativeTime(vehicleLastUpdatedIso(health));

  const visibleChips = display.secondaryIssues.slice(0, MAX_VISIBLE_ISSUE_CHIPS);
  const hiddenChipCount = display.secondaryIssues.length - visibleChips.length;
  const isAction = display.band === 'blocked' || display.band === 'critical';

  // Subtle full-row tint only for the most urgent band — never a left accent bar.
  const tint = isAction
    ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_4%,transparent)]'
    : '';

  const primaryTextTone = isAction
    ? 'text-[color:var(--status-critical)]'
    : display.band === 'review'
      ? 'text-foreground'
      : 'text-muted-foreground';

  const showClearSummary =
    display.secondaryIssues.length === 0 && !display.primaryIssue && display.clearModuleCount > 0;
  const showMetaRow =
    visibleChips.length > 0 ||
    hiddenChipCount > 0 ||
    Boolean(display.dataQualityNote) ||
    showClearSummary;

  return (
    <div
      className={cn(
        'group flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-muted/25',
        tint,
        selected && 'bg-[color:var(--brand-soft)]/40',
      )}
    >
      <div className="h-8 w-8 shrink-0 rounded-lg bg-muted/70 flex items-center justify-center">
        <BrandLogo brand={brand} size={16} isDarkMode={systemDark} />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <button type="button" onClick={onOpen} className="w-full space-y-1 text-left">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-[12px] font-semibold text-foreground">
                {[vehicle.make, getShortModel(vehicle.model), vehicle.year]
                  .filter(Boolean)
                  .join(' ')}
              </span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold text-foreground">
                {vehicle.license}
              </span>
            </div>
            <StatusChip
              tone={display.primaryBadge.tone}
              className="shrink-0 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide"
            >
              {healthLoading && !health ? '…' : display.primaryBadge.label}
            </StatusChip>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="truncate">{vehicle.station || 'No station'}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{odometer}</span>
            <span aria-hidden>·</span>
            <span>Health {healthLoading && !health ? '…' : lastUpdated}</span>
            {display.rentalBlocked && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-[color:var(--status-critical)]">Rental blocked</span>
              </>
            )}
          </div>

          {display.primaryIssue && (
            <p className={cn('line-clamp-1 text-[11px] font-medium leading-snug text-pretty', primaryTextTone)}>
              {display.primaryIssue}
            </p>
          )}
        </button>

        {showMetaRow && (
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleChips.map((chip) => (
              <IssueChip key={chip.key} chip={chip} onClick={() => onModuleClick(chip.key)} />
            ))}
            {hiddenChipCount > 0 && (
              <span className="text-[10px] font-medium text-muted-foreground">+{hiddenChipCount} more</span>
            )}
            {showClearSummary && (
              <span className="text-[10px] text-muted-foreground">
                {display.clearModuleCount} modules clear
              </span>
            )}
            {display.dataQualityNote && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                {(visibleChips.length > 0 || hiddenChipCount > 0 || showClearSummary) && (
                  <span aria-hidden>·</span>
                )}
                <CircleDot className="h-3 w-3 opacity-70" />
                {display.dataQualityNote}
              </span>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open health for ${vehicle.license}`}
        className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 self-center rounded-md px-1.5 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
