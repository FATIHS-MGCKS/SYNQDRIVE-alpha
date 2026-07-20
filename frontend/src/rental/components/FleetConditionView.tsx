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
  StatusChip,
  EmptyState,
  ErrorState,
  SkeletonMetricGrid,
  chipClassForTone,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { cn } from '../../components/ui/utils';
import { FleetHealthKpiCard } from './fleet/FleetHealthKpiCard';

import { getShortModel } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { BrandLogoMark, getBrandFromModel } from './BrandLogo';
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
  vehicleLastUpdatedIso,
  type HealthIssueChip,
  type OperatorDataQualityFilter,
  type OperatorGroupKey,
  type OperatorModuleFilter,
  type OperatorSortMode,
  type OperatorStatusFilter,
} from '../lib/fleet-health-control-center';
import {
  filterAndSortFleetConditionVehicles,
  groupFleetConditionVehicles,
  shouldVirtualizeFleetConditionGroup,
} from '../lib/fleet-condition-pipeline';
import { FleetConditionVirtualizedVehicleRows } from './FleetConditionVirtualizedVehicleRows';

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
  /** When embedded in FleetHub, header refresh is owned by the hub. */
  hideHeaderActions?: boolean;
  /** Hide KPI strip when parent already shows overview KPIs (Zustand & Service Übersicht). */
  hideKpiStrip?: boolean;
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
  /** UI copy locale — Fleet Zustand & Service uses `de`. */
  uiLocale?: 'de' | 'en';
  /** Applied when navigating from overview KPIs (Fleet Health Service). */
  initialStatusFilter?: OperatorStatusFilter;
  /** Deep-link vehicle scope (Fleet Health Service P56). */
  initialVehicleId?: string;
  /** Deep-link station scope (Fleet Health Service P56). */
  initialStationId?: string;
  /** Restrict list to vehicles with rental-blocking open service cases. */
  blockingVehicleIds?: ReadonlySet<string>;
  /** Optional task bridge from FleetHealthService view model. */
  getExistingTaskId?: (vehicleId: string) => string | null;
}

type Tone = 'neutral' | 'success' | 'warning' | 'critical' | 'brand';

const GROUP_CONFIG_EN: Record<
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

const GROUP_CONFIG_DE: Record<
  OperatorGroupKey,
  { title: string; subtitle: string; emptyTitle: string; tone: Tone; icon: LucideIcon }
> = {
  action_required: {
    title: 'Handlungsbedarf',
    subtitle: 'Blockiert oder kritisch — vor Vermietung klären',
    emptyTitle: 'Aktuell keine kritischen Fahrzeuge.',
    tone: 'critical',
    icon: ShieldAlert,
  },
  needs_review: {
    title: 'Technisch prüfen',
    subtitle: 'Warnsignale — Inspektion einplanen',
    emptyTitle: 'Keine Fahrzeuge mit Prüfbedarf.',
    tone: 'warning',
    icon: AlertTriangle,
  },
  limited_data: {
    title: 'Nicht bewertbar',
    subtitle: 'Zustand nicht voll bewertbar — Daten fehlen, verzögert oder nicht unterstützt.',
    emptyTitle: 'Alle Fahrzeuge haben bewertbare Zustandsdaten.',
    tone: 'neutral',
    icon: CircleDot,
  },
  good: {
    title: 'Technisch unauffällig',
    subtitle: 'Vermietungsbereit bestätigt',
    emptyTitle: 'Kein Fahrzeug ist derzeit vollständig bereit.',
    tone: 'success',
    icon: ShieldCheck,
  },
};

const MODULE_FILTER_OPTIONS_EN: Array<{ value: OperatorModuleFilter; label: string }> = [
  { value: 'all', label: 'All modules' },
  { value: 'battery', label: 'Battery' },
  { value: 'tires', label: 'Tires' },
  { value: 'brakes', label: 'Brakes' },
  { value: 'error_codes', label: 'DTC' },
  { value: 'service_compliance', label: 'Service / Compliance' },
  { value: 'complaints', label: 'Complaints' },
  { value: 'vehicle_alerts', label: 'OEM Alerts' },
];

const MODULE_FILTER_OPTIONS_DE: Array<{ value: OperatorModuleFilter; label: string }> = [
  { value: 'all', label: 'Alle Module' },
  { value: 'battery', label: 'Batterie' },
  { value: 'tires', label: 'Reifen' },
  { value: 'brakes', label: 'Bremsen' },
  { value: 'error_codes', label: 'DTC' },
  { value: 'service_compliance', label: 'Service / TÜV' },
  { value: 'complaints', label: 'Beschwerden' },
  { value: 'vehicle_alerts', label: 'OEM-Hinweise' },
];

const DATA_QUALITY_OPTIONS_EN: Array<{ value: OperatorDataQualityFilter; label: string }> = [
  { value: 'all', label: 'All data quality' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'stale', label: 'Delayed data' },
  { value: 'no_tracking', label: 'No tracking' },
  { value: 'estimated', label: 'Estimated' },
];

const DATA_QUALITY_OPTIONS_DE: Array<{ value: OperatorDataQualityFilter; label: string }> = [
  { value: 'all', label: 'Alle Datenqualität' },
  { value: 'fresh', label: 'Aktuell' },
  { value: 'stale', label: 'Verzögerte Daten' },
  { value: 'no_tracking', label: 'Kein Tracking' },
  { value: 'estimated', label: 'Geschätzt' },
];

const SORT_OPTIONS_EN: Array<{ value: OperatorSortMode; label: string; helper: string }> = [
  { value: 'priority', label: 'Priority', helper: 'blocked & critical first' },
  { value: 'station', label: 'Station', helper: 'A-Z' },
  { value: 'license', label: 'License plate', helper: 'A-Z' },
  { value: 'updated', label: 'Last updated', helper: 'newest first' },
];

const SORT_OPTIONS_DE: Array<{ value: OperatorSortMode; label: string; helper: string }> = [
  { value: 'priority', label: 'Priorität', helper: 'blockiert & kritisch zuerst' },
  { value: 'station', label: 'Station', helper: 'A-Z' },
  { value: 'license', label: 'Kennzeichen', helper: 'A-Z' },
  { value: 'updated', label: 'Zuletzt aktualisiert', helper: 'neueste zuerst' },
];

function localizedHealthBadge(label: string, locale: 'de' | 'en'): string {
  if (locale === 'en') return label;
  const map: Record<string, string> = {
    'Action required': 'Technisch blockiert',
    'Needs review': 'Technisch prüfen',
    Healthy: 'Technisch unauffällig',
    'Limited data': 'Nicht bewertbar',
    Blocked: 'Mietblockade',
    'Can rent': 'Technisch unauffällig',
    Review: 'Technisch prüfen',
  };
  return map[label] ?? label;
}

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
  hideHeaderActions = false,
  hideKpiStrip = false,
  onOpenServiceCenter,
  onOpenExistingTask,
  uiLocale = 'en',
  initialStatusFilter,
  initialVehicleId,
  initialStationId,
  blockingVehicleIds,
  getExistingTaskId,
}: FleetConditionViewProps) {
  const GROUP_CONFIG = uiLocale === 'de' ? GROUP_CONFIG_DE : GROUP_CONFIG_EN;
  const MODULE_FILTER_OPTIONS = uiLocale === 'de' ? MODULE_FILTER_OPTIONS_DE : MODULE_FILTER_OPTIONS_EN;
  const DATA_QUALITY_OPTIONS = uiLocale === 'de' ? DATA_QUALITY_OPTIONS_DE : DATA_QUALITY_OPTIONS_EN;
  const SORT_OPTIONS = uiLocale === 'de' ? SORT_OPTIONS_DE : SORT_OPTIONS_EN;
  const searchPlaceholder =
    uiLocale === 'de' ? 'Kennzeichen suchen…' : 'Search plate, vehicle or station…';
  const sortLabelPrefix = uiLocale === 'de' ? 'Sortierung' : 'Sort';
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

  const [statusFilter, setStatusFilter] = useState<OperatorStatusFilter>(
    initialStatusFilter ?? 'all',
  );
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

  useEffect(() => {
    if (!initialStatusFilter) return;
    setStatusFilter(initialStatusFilter);
    if (initialStatusFilter === 'action' || initialStatusFilter === 'blocked') {
      setExpandedGroups((prev) => new Set(prev).add('action_required'));
    } else if (initialStatusFilter === 'review') {
      setExpandedGroups((prev) => new Set(prev).add('needs_review'));
    } else if (initialStatusFilter === 'limited') {
      setExpandedGroups((prev) => new Set(prev).add('limited_data'));
    } else if (initialStatusFilter === 'good') {
      setExpandedGroups((prev) => new Set(prev).add('good'));
    }
  }, [initialStatusFilter]);

  useEffect(() => {
    if (!initialVehicleId) return;
    setSelectedVehicleId(initialVehicleId);
    setMobileDrawerOpen(true);
  }, [initialVehicleId]);

  const scopedVehicleIds = useMemo(() => {
    if (!blockingVehicleIds || blockingVehicleIds.size === 0) return undefined;
    return blockingVehicleIds;
  }, [blockingVehicleIds]);

  const filtered = useMemo(
    () =>
      filterAndSortFleetConditionVehicles({
        fleetVehicles,
        healthMap,
        statusFilter,
        moduleFilter,
        dataQualityFilter,
        searchQuery,
        sortMode,
        vehicleId: initialVehicleId,
        stationId: initialStationId,
        vehicleIds: scopedVehicleIds,
      }),
    [
      fleetVehicles,
      healthMap,
      statusFilter,
      moduleFilter,
      dataQualityFilter,
      searchQuery,
      sortMode,
      initialVehicleId,
      initialStationId,
      scopedVehicleIds,
    ],
  );

  const groupedVehicles = useMemo(() => {
    const buckets = groupFleetConditionVehicles(filtered, healthMap);
    return (Object.keys(GROUP_CONFIG) as OperatorGroupKey[]).map((key) => ({
      key,
      ...GROUP_CONFIG[key],
      vehicles: buckets[key],
    }));
  }, [filtered, healthMap, GROUP_CONFIG]);

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
      label: uiLocale === 'de' ? 'Handlungsbedarf' : 'Action required',
      value: kpis.actionRequired,
      hint:
        kpis.blocked > 0
          ? uiLocale === 'de'
            ? `${kpis.blocked} blockiert`
            : `${kpis.blocked} blocked`
          : uiLocale === 'de'
            ? 'kritisch oder gesperrt'
            : 'blocked or critical',
      filter: 'action' as OperatorStatusFilter,
      tone: 'critical' as StatusTone,
      icon: ShieldAlert,
      emphasize: true,
    },
    {
      key: 'review',
      label: uiLocale === 'de' ? 'Technisch prüfen' : 'Needs review',
      value: kpis.needsReview,
      hint: uiLocale === 'de' ? 'bald prüfen' : 'inspect soon',
      filter: 'review' as OperatorStatusFilter,
      tone: 'warning' as StatusTone,
      icon: AlertTriangle,
    },
    {
      key: 'healthy',
      label: uiLocale === 'de' ? 'Technisch unauffällig' : 'Technically unremarkable',
      value: kpis.healthy,
      hint: uiLocale === 'de' ? 'vermietungsbereit' : 'ready for rental',
      filter: 'good' as OperatorStatusFilter,
      tone: 'success' as StatusTone,
      icon: ShieldCheck,
    },
    {
      key: 'limited',
      label: uiLocale === 'de' ? 'Nicht bewertbar' : 'Limited data',
      value: kpis.limited,
      hint:
        kpis.naModuleVehicles > 0
          ? uiLocale === 'de'
            ? `${kpis.naModuleVehicles} ohne Tracking`
            : `${kpis.naModuleVehicles} no tracking`
          : uiLocale === 'de'
            ? 'nicht voll bewertbar'
            : 'not fully assessable',
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
        className="sq-press inline-flex items-center gap-2 rounded-lg border border-border/70 surface-premium px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted disabled:opacity-60"
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

      {embedded && !hideHeaderActions && (
        <div className="flex items-center justify-end gap-2">{headerActions}</div>
      )}

      {healthError && !healthLoading && (
        <ErrorState
          compact
          title="Health data could not be loaded."
          description={healthError}
          onRetry={() => reloadHealth()}
          retryLabel="Retry"
          className="surface-premium rounded-2xl shadow-[var(--shadow-1)]"
        />
      )}

      {healthLoading && kpis.total === 0 && !hideKpiStrip ? (
        <SkeletonMetricGrid count={4} />
      ) : !hideKpiStrip ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kpiCards.map((card) => {
            const active = statusFilter === card.filter && card.filter !== 'all';
            const CardIcon = card.icon;
            return (
              <FleetHealthKpiCard
                key={card.key}
                label={card.label}
                value={card.value}
                hint={card.hint}
                tone={card.tone}
                icon={CardIcon}
                active={active}
                emphasize={card.emphasize}
                onClick={() => applyStatusFilter(card.filter)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Icon
              name="search"
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-border/70 bg-background py-2.5 pl-10 pr-4 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>

          <FilterDropdown
            label={`${sortLabelPrefix}: ${SORT_OPTIONS.find((o) => o.value === sortMode)?.label ?? (uiLocale === 'de' ? 'Priorität' : 'Priority')}`}
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
                : 'border-border/70 surface-premium text-foreground hover:bg-muted'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{uiLocale === 'de' ? 'Mehr Filter' : 'More filters'}</span>
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
              className="sq-press flex items-center gap-1.5 rounded-lg border border-border/60 surface-premium px-2.5 py-2.5 text-[11px] font-semibold text-foreground transition-all hover:bg-muted"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
              {uiLocale === 'de' ? 'Zurücksetzen' : 'Clear'}
            </button>
          )}
        </div>

        {advancedOpen && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5">
            <FilterDropdown
              label={
                moduleFilter === 'all'
                  ? uiLocale === 'de'
                    ? 'Modul'
                    : 'Module'
                  : MODULE_FILTER_OPTIONS.find((o) => o.value === moduleFilter)?.label ??
                    (uiLocale === 'de' ? 'Modul' : 'Module')
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
                  ? uiLocale === 'de'
                    ? 'Datenqualität'
                    : 'Data quality'
                  : DATA_QUALITY_OPTIONS.find((o) => o.value === dataQualityFilter)?.label ??
                    (uiLocale === 'de' ? 'Datenqualität' : 'Data quality')
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
              {uiLocale === 'de'
                ? `${filtered.length} von ${kpis.total} Fahrzeugen`
                : `Showing ${filtered.length} of ${kpis.total} vehicles`}
            </p>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="search" className="h-5 w-5" />}
          title={uiLocale === 'de' ? 'Keine Fahrzeuge für diesen Filter.' : 'No vehicles found for this filter.'}
          className="surface-premium rounded-2xl shadow-[var(--shadow-1)]"
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
                  className="surface-premium rounded-2xl overflow-hidden shadow-[var(--shadow-1)]"
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

                  {isGroupOpen &&
                    (shouldVirtualizeFleetConditionGroup(group.vehicles.length) ? (
                      <FleetConditionVirtualizedVehicleRows
                        items={group.vehicles}
                        getItemKey={(vehicle) => vehicle.id}
                        renderItem={(vehicle) => (
                          <OperatorVehicleRow
                            vehicle={vehicle}
                            health={healthMap.get(vehicle.id)}
                            healthLoading={healthLoading}
                            systemDark={systemDark}
                            selected={selectedVehicleId === vehicle.id}
                            uiLocale={uiLocale}
                            existingTaskId={getExistingTaskId?.(vehicle.id) ?? null}
                            onOpenExistingTask={onOpenExistingTask}
                            onOpen={() => openVehicleDetail(vehicle.id)}
                            onModuleClick={(chipKey) =>
                              openVehicleDetail(vehicle.id, moduleKeyToTab(chipKey))
                            }
                          />
                        )}
                      />
                    ) : (
                      <div className="border-t border-border/60 divide-y divide-border/40">
                        {group.vehicles.map((vehicle) => (
                          <OperatorVehicleRow
                            key={vehicle.id}
                            vehicle={vehicle}
                            health={healthMap.get(vehicle.id)}
                            healthLoading={healthLoading}
                            systemDark={systemDark}
                            selected={selectedVehicleId === vehicle.id}
                            uiLocale={uiLocale}
                            existingTaskId={getExistingTaskId?.(vehicle.id) ?? null}
                            onOpenExistingTask={onOpenExistingTask}
                            onOpen={() => openVehicleDetail(vehicle.id)}
                            onModuleClick={(chipKey) =>
                              openVehicleDetail(vehicle.id, moduleKeyToTab(chipKey))
                            }
                          />
                        ))}
                      </div>
                    ))}
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
            : 'border-border/70 surface-premium text-foreground hover:bg-muted'
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
  uiLocale,
  existingTaskId,
  onOpenExistingTask,
  onOpen,
  onModuleClick,
}: {
  vehicle: ReturnType<typeof useFleetVehicles>['fleetVehicles'][number];
  health: VehicleHealthResponse | undefined;
  healthLoading: boolean;
  systemDark: boolean;
  selected: boolean;
  uiLocale: 'de' | 'en';
  existingTaskId: string | null;
  onOpenExistingTask?: (taskId: string) => void;
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
      <BrandLogoMark brand={brand} isDarkMode={systemDark} />

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
              {healthLoading && !health
                ? '…'
                : localizedHealthBadge(display.primaryBadge.label, uiLocale)}
            </StatusChip>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span className="truncate">{vehicle.station || (uiLocale === 'de' ? 'Keine Station' : 'No station')}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{odometer}</span>
            <span aria-hidden>·</span>
            <span>
              {uiLocale === 'de' ? 'Zustand' : 'Health'}{' '}
              {healthLoading && !health ? '…' : lastUpdated}
            </span>
            {display.rentalBlocked && (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-[color:var(--status-critical)]">
                  {uiLocale === 'de' ? 'Vermietung blockiert' : 'Rental blocked'}
                </span>
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
              <span className="text-[10px] font-medium text-muted-foreground">
                +{hiddenChipCount} {uiLocale === 'de' ? 'weitere' : 'more'}
              </span>
            )}
            {showClearSummary && (
              <span className="text-[10px] text-muted-foreground">
                {display.clearModuleCount}{' '}
                {uiLocale === 'de' ? 'Module in Ordnung' : 'modules clear'}
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

      {existingTaskId && onOpenExistingTask ? (
        <button
          type="button"
          onClick={() => onOpenExistingTask(existingTaskId)}
          className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 self-center rounded-md border border-border/60 px-2 text-[10px] font-semibold text-foreground opacity-90 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {uiLocale === 'de' ? 'Aufgabe' : 'Task'}
        </button>
      ) : null}

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
