import {
  AlertCircle,
  AlertTriangle,
  Battery,
  Bell,
  Calendar,
  Car,
  CheckCircle,
  ChevronDown,
  CircleDot,
  Disc,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import {
  PageHeader,
  MetricCard,
  HealthStatusChip,
  StatusChip,
  EmptyState,
  SkeletonMetricGrid,
  SkeletonCard,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';

import { getShortModel } from '../data/vehicles';
// V4.7.23 — health map now comes from the shared FleetProvider so this
// view, FleetView, the Dashboard popups and the Vehicle-Detail header
// all read the same canonical Rental-Health-V1 data.
import { useFleetVehicles } from '../FleetContext';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import {
  api,
  type TireHealthSummaryResponse,
  type BrakeHealthSummary,
  type BatteryHealthSummary,
  type ServiceInfoStatus,
  type VehicleHealthResponse,
  type RentalHealthState,
} from '../../lib/api';

export type ConditionCategory = 'tires' | 'brakes' | 'battery' | 'dtc' | 'service' | 'tuev' | 'bokraft' | 'driver-feedback' | 'alerts';

interface FleetConditionViewProps {
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
  /** When true, page title is provided by FleetHubView. */
  embedded?: boolean;
}

type HealthCategory = 'all' | 'Good Health' | 'Warning' | 'Critical';
type SortMode = 'critical-first' | 'alpha' | 'license';
type ConditionGroupKey = 'critical' | 'warning' | 'healthy';
type Tone = 'neutral' | 'success' | 'warning' | 'critical' | 'brand';

// V4.7.27 — Effective status drives the actionability of the row.
// `Unknown` is preserved internally so we can still surface a transparent
// `Limited data` indicator on the affected row, but for grouping, counts
// and the row-level pill it collapses into `Good Health` — matching what
// every other Rental surface (FleetView, StatInlineDetail, Vehicle
// Detail header) already does for unknown vehicles. Backend contract
// (unknown is never silently promoted to good) is preserved at the
// data layer; UI just stops treating "no health signal" as a separate
// negative bucket alongside Critical/Warning.
type EffectiveStatus = 'Critical' | 'Warning' | 'Good Health' | 'Unknown';

function statusFromRentalHealth(state: RentalHealthState | undefined): EffectiveStatus {
  if (state === 'critical') return 'Critical';
  if (state === 'warning') return 'Warning';
  if (state === 'good') return 'Good Health';
  return 'Unknown';
}

function toneFromStatus(status: EffectiveStatus): Tone {
  if (status === 'Critical') return 'critical';
  if (status === 'Warning') return 'warning';
  // V4.7.27 — `Unknown` shares the success tone in the row pill so it
  // does not look "broken" while we still mark the data gap inline via
  // the `Limited data` indicator.
  return 'success';
}

const MODULE_LABELS: Record<string, string> = {
  battery: 'Battery',
  tires: 'Tires',
  brakes: 'Brakes',
  error_codes: 'Error codes',
  service_compliance: 'Service / TÜV',
  complaints: 'Complaints',
  vehicle_alerts: 'Vehicle alerts',
};

interface HealthReason {
  module: string;
  label: string;
  state: RentalHealthState;
  reason: string;
}

function collectReasons(health: VehicleHealthResponse | undefined): HealthReason[] {
  if (!health) return [];
  const out: HealthReason[] = [];
  for (const [name, mod] of Object.entries(health.modules)) {
    if (mod.state === 'critical' || mod.state === 'warning') {
      out.push({
        module: name,
        label: MODULE_LABELS[name] ?? name.replace(/_/g, ' '),
        state: mod.state,
        reason: mod.reason,
      });
    }
  }
  out.sort((a, b) => (a.state === 'critical' ? -1 : 1) - (b.state === 'critical' ? -1 : 1));
  return out;
}

interface VehicleConditionData {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcActive: any[];
  dtcStats: { total?: number; lastChecked?: string } | null;
}

function formatRemainingTime(months: number | null): string {
  if (months == null) return '—';
  if (months < 0) return 'Overdue';
  const m = Math.round(months);
  if (m >= 12) return `${Math.floor(m / 12)}y ${m % 12}mo`;
  return `${m} mo`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatEnumLabel(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  return value.replace(/_/g, ' ').toLowerCase();
}

function healthRank(status: EffectiveStatus): number {
  if (status === 'Critical') return 3;
  if (status === 'Warning') return 2;
  if (status === 'Good Health') return 1;
  return 0;
}

function toneClass(tone: Tone): string {
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  if (tone === 'brand') return 'sq-tone-brand';
  return 'sq-tone-neutral';
}

function toneFromPercent(value: number | null | undefined): Tone {
  if (value == null) return 'neutral';
  if (value >= 70) return 'success';
  if (value >= 40) return 'warning';
  return 'critical';
}

// V4.7.x — Tire tone is driven by the canonical TireHealthService status
// (GOOD | WATCH | WARNING | CRITICAL | UNKNOWN) so Fleet Condition shows the
// SAME truth as Vehicle Detail / Vehicle Health, instead of re-bucketing a %.
function toneFromTireStatus(status: string | null | undefined): Tone | null {
  switch (status) {
    case 'GOOD':
      return 'success';
    case 'WATCH':
    case 'WARNING':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    case 'UNKNOWN':
      return 'neutral';
    default:
      return null;
  }
}

function healthLabelEx(status: EffectiveStatus, isLoading = false): string {
  if (status === 'Critical') return 'Critical';
  if (status === 'Warning') return 'Warning';
  if (status === 'Unknown' && isLoading) return 'Checking…';
  return 'Healthy';
}

function effectiveStatusToHealthState(status: EffectiveStatus): string {
  if (status === 'Critical') return 'critical';
  if (status === 'Warning') return 'warning';
  return 'good';
}

function summaryToneToStatus(tone: Tone): StatusTone {
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'critical') return 'critical';
  if (tone === 'brand') return 'info';
  return 'neutral';
}

function barClass(value: number | null | undefined): string {
  const tone = toneFromPercent(value);
  if (tone === 'success') return 'bg-[color:var(--status-success)]';
  if (tone === 'warning') return 'bg-[color:var(--status-attention)]';
  if (tone === 'critical') return 'bg-[color:var(--status-critical)]';
  return 'bg-muted-foreground/30';
}

function textToneClass(tone: Tone): string {
  if (tone === 'success') return 'text-[color:var(--status-success)]';
  if (tone === 'warning') return 'text-[color:var(--status-attention)]';
  if (tone === 'critical') return 'text-[color:var(--status-critical)]';
  if (tone === 'brand') return 'text-[color:var(--brand)]';
  return 'text-muted-foreground';
}

export function FleetConditionView({ onDrillDown, embedded = false }: FleetConditionViewProps) {
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
  const { fleetVehicles, healthMap, healthLoading } = useFleetVehicles();

  const [filterCategory, setFilterCategory] = useState<HealthCategory>('all');
  const [sortMode, setSortMode] = useState<SortMode>('critical-first');
  const [searchQuery, setSearchQuery] = useState('');
  const [conditionData, setConditionData] = useState<Record<string, VehicleConditionData>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<ConditionGroupKey>>(new Set());
  const [isHealthFilterOpen, setIsHealthFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  const statusFor = useCallback(
    (vehicleId: string): EffectiveStatus => {
      const health = healthMap.get(vehicleId);
      if (!health) return 'Unknown';
      return statusFromRentalHealth(health.overall_state);
    },
    [healthMap],
  );

  const statusCounts = useMemo(() => {
    let good = 0, warning = 0, critical = 0, unknown = 0;
    for (const v of fleetVehicles) {
      const s = statusFor(v.id);
      if (s === 'Critical') critical++;
      else if (s === 'Warning') warning++;
      else if (s === 'Good Health') good++;
      else unknown++;
    }
    return { good, warning, critical, unknown };
  }, [fleetVehicles, statusFor]);

  const totalCount = fleetVehicles.length;
  const goodCount = statusCounts.good;
  const warningCount = statusCounts.warning;
  const criticalCount = statusCounts.critical;
  const unknownCount = statusCounts.unknown;
  const healthPending = healthLoading && unknownCount > 0;
  // V4.7.27 — Unknown rolls into Healthy visually, but we keep the raw
  // count for the optional "limited data" subline + per-row indicator.
  const healthyCount = goodCount + unknownCount;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = fleetVehicles.filter(v => {
      const status = statusFor(v.id);
      if (filterCategory !== 'all') {
        // V4.7.27 — Healthy filter includes Unknown vehicles (they look
        // healthy on every other surface; here we just transparently
        // mark the data gap on the row).
        if (filterCategory === 'Good Health') {
          if (status !== 'Good Health' && status !== 'Unknown') return false;
        } else if (status !== filterCategory) {
          return false;
        }
      }
      if (!q) return true;
      const haystack = [v.model, v.make, v.license, v.station, v.year?.toString()].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    const sorted = [...base];
    if (sortMode === 'critical-first') {
      sorted.sort(
        (a, b) =>
          healthRank(statusFor(b.id)) - healthRank(statusFor(a.id)) ||
          (a.license ?? '').localeCompare(b.license ?? ''),
      );
    } else if (sortMode === 'alpha') {
      sorted.sort((a, b) => (a.model ?? '').localeCompare(b.model ?? ''));
    } else {
      sorted.sort((a, b) => (a.license ?? '').localeCompare(b.license ?? ''));
    }
    return sorted;
  }, [fleetVehicles, filterCategory, sortMode, searchQuery, statusFor]);

  const groupedVehicles = useMemo(() => {
    const healthyVehicles = filtered.filter(v => {
      const s = statusFor(v.id);
      return s === 'Good Health' || s === 'Unknown';
    });
    const limitedInHealthy = healthyVehicles.filter(v => statusFor(v.id) === 'Unknown').length;
    const groups: Array<{
      key: ConditionGroupKey;
      title: string;
      subtitle: string;
      tone: Tone;
      vehicles: typeof filtered;
    }> = [
      { key: 'critical', title: 'Critical', subtitle: 'Immediate action', tone: 'critical',
        vehicles: filtered.filter(v => statusFor(v.id) === 'Critical') },
      { key: 'warning', title: 'Warning', subtitle: 'Monitor soon', tone: 'warning',
        vehicles: filtered.filter(v => statusFor(v.id) === 'Warning') },
      { key: 'healthy', title: 'Healthy',
        subtitle: limitedInHealthy > 0 ? `No current attention · ${limitedInHealthy} with limited data` : 'No current attention',
        tone: 'success',
        vehicles: healthyVehicles },
    ];
    return groups.filter(group => group.vehicles.length > 0);
  }, [filtered, statusFor]);

  // Groups stay collapsed on first render so the user lands on a calm,
  // overview-first surface (KPIs + group headers only). Opening a group is
  // an explicit user action — either by clicking the group header or by
  // selecting a vehicle, which auto-expands the group it lives in (see
  // toggleVehicle). Expand-all / Collapse-all buttons remain available for
  // bulk control.

  const loadVehicleCondition = useCallback(async (vehicleId: string) => {
    if (conditionData[vehicleId] || loadingIds.has(vehicleId)) return;
    setLoadingIds(prev => new Set(prev).add(vehicleId));
    try {
      const [tires, brakes, battery, service, dtcActive, dtcStats] = await Promise.all([
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.batteryHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.serviceInfoStatus(vehicleId).catch(() => null),
        api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
        api.vehicleIntelligence.dtcStats(vehicleId).catch(() => null),
      ]);
      setConditionData(prev => ({
        ...prev,
        [vehicleId]: { tires, brakes, battery, service, dtcActive: Array.isArray(dtcActive) ? dtcActive : [], dtcStats },
      }));
    } catch {
      /* keep current state */
    } finally {
      setLoadingIds(prev => { const next = new Set(prev); next.delete(vehicleId); return next; });
    }
  }, [conditionData, loadingIds]);

  useEffect(() => {
    if (expandedVehicleId) loadVehicleCondition(expandedVehicleId);
  }, [expandedVehicleId, loadVehicleCondition]);

  const toggleGroup = (group: ConditionGroupKey) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const applyHealthFilter = (category: HealthCategory) => {
    const nextCategory = filterCategory === category && category !== 'all' ? 'all' : category;
    setFilterCategory(nextCategory);
    if (nextCategory !== 'all') {
      const groupKey: ConditionGroupKey =
        nextCategory === 'Critical'
          ? 'critical'
          : nextCategory === 'Warning'
            ? 'warning'
            : 'healthy';
      setExpandedGroups(prev => new Set(prev).add(groupKey));
    }
  };

  const clearSelection = () => {
    setFilterCategory('all');
    setSearchQuery('');
    setIsHealthFilterOpen(false);
    setIsSortOpen(false);
  };

  const toggleVehicle = (vehicleId: string) => {
    setExpandedVehicleId(prev => (prev === vehicleId ? null : vehicleId));
  };

  const expandAllGroups = () => {
    setExpandedGroups(new Set(groupedVehicles.map(group => group.key)));
  };

  const collapseAllGroups = () => {
    setExpandedGroups(new Set());
    setExpandedVehicleId(null);
  };

  const renderConditionTiles = (vehicle: any, cd: VehicleConditionData | undefined, isLoading: boolean) => {
    const tirePctRaw = cd?.tires?.overallPercent ?? vehicle.tires;
    const tirePct =
      typeof tirePctRaw === 'number' && Number.isFinite(tirePctRaw) ? tirePctRaw : null;
    const tireRemKm = cd?.tires?.overallRemainingKm;
    const tireWarnCount =
      (cd?.tires?.dataQualityWarnings?.length ?? 0) +
      (cd?.tires?.pressureContext?.warningHints?.length ?? 0);

    const brakePct =
      cd?.brakes?.pads?.healthPercent != null || cd?.brakes?.discs?.healthPercent != null
        ? Math.min(cd?.brakes?.pads?.healthPercent ?? 101, cd?.brakes?.discs?.healthPercent ?? 101)
        : null;
    const brakeState =
      cd?.brakes?.stateClass === 'MEASURED'
        ? 'Measured'
        : cd?.brakes?.stateClass === 'ESTIMATED'
          ? 'Estimated'
          : cd?.brakes?.stateClass === 'WARNING_ONLY'
            ? 'Warning only'
            : 'No baseline';
    // Canonical condition is the single source of truth for the brake tile.
    const brakeCondition = cd?.brakes?.overallCondition ?? 'UNKNOWN';
    const brakeConditionLabel: Record<string, string> = {
      GOOD: 'Good', WATCH: 'Watch', WARNING: 'Warning', CRITICAL: 'Critical', UNKNOWN: '—',
    };
    const brakeTone: Tone =
      brakeCondition === 'GOOD'
        ? 'success'
        : brakeCondition === 'WATCH'
          ? 'warning'
          : brakeCondition === 'WARNING'
            ? 'warning'
            : brakeCondition === 'CRITICAL'
              ? 'critical'
              : 'neutral';
    const brakeFrontMin = cd?.brakes?.estimatedFrontRemainingKmMin ?? null;
    const brakeFrontMax = cd?.brakes?.estimatedFrontRemainingKmMax ?? null;
    const brakeRangeMeta =
      brakeFrontMin != null
        ? `~${Math.round((brakeFrontMin) / 1000)}k${brakeFrontMax != null && brakeFrontMax !== brakeFrontMin ? `–${Math.round(brakeFrontMax / 1000)}k` : ''} km front`
        : cd?.brakes?.remainingKm != null
          ? `~${Math.round(cd.brakes.remainingKm / 1000)}k km projected`
          : brakeState;

    const batteryPubState = cd?.battery?.lv?.publicationState ?? cd?.battery?.currentState?.publicationState;
    const batteryCalibrating = batteryPubState === 'INITIAL_CALIBRATION';
    const batteryStabilizing = batteryPubState === 'STABILIZING';
    const batterySoh = batteryCalibrating
      ? null
      : (cd?.battery?.lv?.healthPercent ?? cd?.battery?.currentState?.publishedSohPct ?? cd?.battery?.currentState?.sohPercent ?? null);
    const batteryEstimate = cd?.battery?.lv?.estimatedHealthPercent ?? cd?.battery?.currentState?.estimatedSohPct ?? null;
    const batteryVoltage = cd?.battery?.lv?.telemetry?.voltageV ?? cd?.battery?.currentState?.voltageV;
    const batteryPct = batterySoh ?? batteryEstimate;
    const batteryCondition = cd?.battery?.lv?.condition ?? cd?.battery?.condition;
    // LV "Estimated Battery Health" status — shown as a word, not an SOH %.
    const batteryEstStatus =
      cd?.battery?.lv?.estimatedHealth?.status ??
      (batteryCondition === 'good' ? 'GOOD' : batteryCondition === 'watch' ? 'WATCH' : batteryCondition === 'attention' ? 'WARNING' : 'UNKNOWN');
    const batteryStatusLabel: Record<string, string> = { GOOD: 'Good', WATCH: 'Watch', WARNING: 'Warning', CRITICAL: 'Critical', UNKNOWN: '—', UNSUPPORTED: 'Not rated' };
    const batteryResting = cd?.battery?.lv?.restingVoltage?.valueV ?? cd?.battery?.lv?.telemetry?.restingVoltage ?? null;

    const activeDtcCount = cd?.dtcActive?.length ?? 0;
    const errorCodesState = healthMap.get(vehicle.id)?.modules?.error_codes?.state;
    const dtcTone: Tone =
      errorCodesState === 'critical'
        ? 'critical'
        : errorCodesState === 'warning'
          ? 'warning'
          : activeDtcCount > 0
            ? 'warning'
            : 'success';
    const servicePct = cd?.service?.serviceRemainingPercent ?? null;
    const serviceKm = cd?.service?.serviceRemainingKm;
    const serviceMonths = cd?.service?.serviceRemainingMonths;
    const tuvMonths = cd?.service?.tuvRemainingMonths ?? null;
    const bokraftMonths = cd?.service?.bokraftRemainingMonths ?? null;

    const tireAlerts = cd?.tires?.alerts ?? [];
    const batteryWatchpoints = cd?.battery?.watchpoints ?? [];
    const warningAlerts =
      tireAlerts.filter(a => a.severity === 'warning').length +
      batteryWatchpoints.length;
    const criticalAlerts =
      tireAlerts.filter(a => a.severity === 'critical').length +
      (cd?.brakes?.hasAlert ? 1 : 0) +
      (errorCodesState === 'critical' ? 1 : 0);

    const tiles = [
      {
        key: 'tires',
        icon: CircleDot,
        label: 'Tires',
        value: tirePct != null ? `${Math.round(tirePct)}%` : '—',
        meta: tireRemKm != null ? `~${Math.round(tireRemKm / 1000)}k km left` : formatEnumLabel(cd?.tires?.actionState, 'No km estimate'),
        percent: tirePct,
        tone: (() => {
          // Prefer canonical tire status; fall back to % bucket for legacy payloads.
          const canon = toneFromTireStatus(cd?.tires?.overallStatus);
          const base = canon ?? toneFromPercent(tirePct);
          // A data-quality / pressure hint should never let a healthy tile read "all good".
          return tireWarnCount > 0 && base === 'success' ? ('warning' as Tone) : base;
        })(),
        category: 'tires' as ConditionCategory,
      },
      {
        key: 'brakes',
        icon: Disc,
        label: 'Brakes',
        value: brakeCondition !== 'UNKNOWN' ? brakeConditionLabel[brakeCondition] : (brakePct != null ? `${Math.round(brakePct)}%` : '—'),
        meta: brakeRangeMeta,
        percent: brakePct,
        tone: brakeCondition !== 'UNKNOWN' ? brakeTone : toneFromPercent(brakePct),
        category: 'brakes' as ConditionCategory,
      },
      {
        key: 'battery',
        icon: Battery,
        label: 'Battery Health',
        value: batteryCalibrating
          ? 'Calibrating'
          : batteryStatusLabel[batteryEstStatus] && batteryStatusLabel[batteryEstStatus] !== '—'
            ? batteryStatusLabel[batteryEstStatus]
            : batteryVoltage != null
              ? `${batteryVoltage.toFixed(1)}V`
              : '—',
        meta: batteryCalibrating
          ? 'Learning baseline'
          : batteryResting != null
            ? `Resting ${batteryResting.toFixed(2)}V`
            : batteryStabilizing
              ? 'Estimated'
              : batteryCondition ?? 'No signal',
        percent: batteryPct,
        tone: batteryCalibrating ? 'brand' as Tone : batteryCondition === 'attention' ? 'critical' as Tone : batteryCondition === 'watch' ? 'warning' as Tone : toneFromPercent(batteryPct),
        category: 'battery' as ConditionCategory,
      },
      {
        key: 'dtc',
        icon: AlertCircle,
        label: 'Error Codes',
        value: activeDtcCount > 0 ? `${activeDtcCount} active` : 'Clear',
        meta: cd?.dtcStats?.lastChecked ? `Checked ${formatDate(cd.dtcStats.lastChecked)}` : 'No active DTCs',
        percent: activeDtcCount > 0 ? Math.max(8, 100 - activeDtcCount * 20) : 100,
        tone: dtcTone,
        category: 'dtc' as ConditionCategory,
      },
      {
        key: 'service',
        icon: Wrench,
        label: 'Service',
        value: servicePct != null ? `${Math.round(servicePct)}%` : '—',
        meta: serviceKm != null || serviceMonths != null
          ? `${serviceKm != null ? `${serviceKm.toLocaleString('de-DE')} km` : ''}${serviceKm != null && serviceMonths != null ? ' / ' : ''}${serviceMonths != null ? formatRemainingTime(serviceMonths) : ''}`
          : cd?.service?.lastServiceDate ? `Last ${formatDate(cd.service.lastServiceDate)}` : 'No schedule',
        percent: servicePct,
        tone: toneFromPercent(servicePct),
        category: 'service' as ConditionCategory,
      },
      {
        key: 'tuev',
        icon: ShieldCheck,
        label: 'TÜV',
        value: tuvMonths != null ? formatRemainingTime(tuvMonths) : '—',
        meta: cd?.service?.tuvValidTill ? `Valid till ${formatDate(cd.service.tuvValidTill)}` : 'No due date',
        percent: tuvMonths != null ? Math.min(100, Math.max(0, (tuvMonths / 24) * 100)) : null,
        tone: tuvMonths != null && tuvMonths <= 2 ? 'critical' as Tone : tuvMonths != null && tuvMonths <= 6 ? 'warning' as Tone : tuvMonths != null ? 'success' as Tone : 'neutral' as Tone,
        category: 'tuev' as ConditionCategory,
      },
      {
        key: 'bokraft',
        icon: Calendar,
        label: 'BOKraft',
        value: bokraftMonths != null ? formatRemainingTime(bokraftMonths) : '—',
        meta: cd?.service?.bokraftValidTill ? `Valid till ${formatDate(cd.service.bokraftValidTill)}` : 'No due date',
        percent: bokraftMonths != null ? Math.min(100, Math.max(0, (bokraftMonths / 12) * 100)) : null,
        tone: bokraftMonths != null && bokraftMonths <= 1 ? 'critical' as Tone : bokraftMonths != null && bokraftMonths <= 3 ? 'warning' as Tone : bokraftMonths != null ? 'success' as Tone : 'neutral' as Tone,
        category: 'bokraft' as ConditionCategory,
      },
      {
        key: 'driver-feedback',
        icon: MessageSquare,
        label: 'Driver Feedback',
        value: '0 entries',
        meta: 'No feedback recorded',
        percent: null,
        tone: 'neutral' as Tone,
        category: 'driver-feedback' as ConditionCategory,
      },
      {
        key: 'alerts',
        icon: Bell,
        label: 'Alerts',
        value: criticalAlerts + warningAlerts > 0 ? `${criticalAlerts + warningAlerts} open` : 'No alerts',
        meta: criticalAlerts > 0 ? `${criticalAlerts} critical` : warningAlerts > 0 ? `${warningAlerts} warning` : 'All clear',
        percent: criticalAlerts + warningAlerts > 0 ? 35 : 100,
        tone: criticalAlerts > 0 ? 'critical' as Tone : warningAlerts > 0 ? 'warning' as Tone : 'success' as Tone,
        category: 'alerts' as ConditionCategory,
      },
    ];

    if (isLoading && !cd) {
      return (
        <div className="px-3 py-6">
          <SkeletonCard className="border-0 shadow-none bg-transparent p-2" />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 p-2.5 border-t border-border/60 bg-muted/15">
        {tiles.map(tile => (
          <ConditionTile
            key={tile.key}
            icon={tile.icon}
            label={tile.label}
            value={tile.value}
            meta={tile.meta}
            percent={tile.percent}
            tone={tile.tone}
            onClick={() => onDrillDown?.(vehicle.id, tile.category)}
          />
        ))}
      </div>
    );
  };

  // V4.7.27 — KPI cards mirror the canonical Healthy/Warning/Critical
  // shape every other Rental surface uses; Unknown is folded into Healthy
  // and surfaced only as a small subline (`X with limited data`) so the
  // page never invents a fourth bucket that disagrees with FleetView /
  // Dashboard / Vehicle-Detail.
  const healthyPct = Math.round((healthyCount / Math.max(totalCount, 1)) * 100);
  const summaryCards = [
    {
      label: 'Total',
      value: totalCount,
      meta: healthPending
        ? `Checking ${unknownCount} of ${totalCount}`
        : 'vehicles monitored',
      category: 'all' as HealthCategory,
      tone: 'brand' as Tone,
      icon: Car,
    },
    {
      label: 'Healthy',
      value: healthyCount,
      meta:
        unknownCount > 0
          ? `${healthyPct}% · ${unknownCount} with limited data`
          : `${healthyPct}% of fleet`,
      category: 'Good Health' as HealthCategory,
      tone: 'success' as Tone,
      icon: CheckCircle,
    },
    {
      label: 'Warning',
      value: warningCount,
      meta: warningCount > 0 ? `${warningCount} need review` : 'none open',
      category: 'Warning' as HealthCategory,
      tone: 'warning' as Tone,
      icon: AlertTriangle,
    },
    {
      label: 'Critical',
      value: criticalCount,
      meta: criticalCount > 0 ? `${criticalCount} act now` : 'all clear',
      category: 'Critical' as HealthCategory,
      tone: 'critical' as Tone,
      icon: ShieldAlert,
    },
  ];

  const healthFilterOptions: Array<{
    category: HealthCategory;
    label: string;
    count: number;
    tone: Tone;
    helper: string;
  }> = [
    {
      category: 'all',
      label: 'All',
      count: totalCount,
      tone: 'brand',
      helper: 'full fleet',
    },
    {
      category: 'Critical',
      label: 'Critical',
      count: criticalCount,
      tone: criticalCount > 0 ? 'critical' : 'neutral',
      helper: criticalCount > 0 ? 'act now' : 'none',
    },
    {
      category: 'Warning',
      label: 'Warning',
      count: warningCount,
      tone: warningCount > 0 ? 'warning' : 'neutral',
      helper: warningCount > 0 ? 'review' : 'none',
    },
    {
      category: 'Good Health',
      label: 'Healthy',
      count: healthyCount,
      tone: 'success',
      helper: unknownCount > 0 ? `${unknownCount} limited data` : 'clear',
    },
  ];

  const sortOptions: Array<{ value: SortMode; label: string; helper: string }> = [
    { value: 'critical-first', label: 'Priority', helper: 'critical first' },
    { value: 'alpha', label: 'Model', helper: 'A-Z' },
    { value: 'license', label: 'Plate', helper: 'license' },
  ];

  const hasActiveSelection = filterCategory !== 'all' || searchQuery.trim().length > 0;
  const activeFilterLabel =
    healthFilterOptions.find(option => option.category === filterCategory)?.label ?? 'All';
  const activeSortLabel = sortOptions.find(option => option.value === sortMode)?.label ?? 'Priority';
  const selectionLabel = hasActiveSelection ? 'selection' : 'fleet';
  const activeGroupCount = expandedGroups.size;

  return (
    <div className={`${embedded ? '' : 'max-w-[1600px] mx-auto'} space-y-5`}>
      {!embedded && (
      <PageHeader
        title="Health"
        status={
          healthPending ? (
            <StatusChip tone="neutral" icon={
              <span className="h-2 w-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
            }>
              Refreshing
            </StatusChip>
          ) : undefined
        }
      />
      )}
      {embedded && healthPending && (
        <div className="flex justify-end">
          <StatusChip tone="neutral" icon={
            <span className="h-2 w-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
          }>
            Refreshing
          </StatusChip>
        </div>
      )}

      {healthLoading && totalCount === 0 ? (
        <SkeletonMetricGrid count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {summaryCards.map(card => {
            const active = filterCategory === card.category;
            const ToneIcon = card.icon;
            return (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.meta}
                icon={<ToneIcon className="w-4 h-4" />}
                status={summaryToneToStatus(card.tone)}
                onClick={() => applyHealthFilter(card.category)}
                className={active ? 'ring-2 ring-[color:var(--brand)]' : undefined}
              />
            );
          })}
        </div>
      )}

      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        {/* V4.7.29 — Match Customers/Financial-Insights control rhythm:
            compact card title, search first, dropdown-style filters, and
            active-state chips on the right. This replaces the bespoke
            health-chip grid so the page reads like the rest of Rental. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Showing {filtered.length} of {totalCount} vehicles
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {filterCategory !== 'all' && (
              <button
                type="button"
                onClick={() => setFilterCategory('all')}
                className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand"
              >
                {activeFilterLabel} active ×
              </button>
            )}
            {searchQuery && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Search active
              </span>
            )}
            {hasActiveSelection && (
              <button
                type="button"
                onClick={clearSelection}
                className="sq-press flex items-center gap-1.5 rounded-lg border border-[color:color-mix(in_srgb,var(--status-critical)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--status-critical)_8%,transparent)] px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-critical)] transition-all hover:bg-[color:color-mix(in_srgb,var(--status-critical)_14%,transparent)]"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Icon name="search" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search model, plate or station..."
              className="w-full rounded-lg border border-border/70 bg-card py-2.5 pl-10 pr-4 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => { setIsHealthFilterOpen(!isHealthFilterOpen); setIsSortOpen(false); }}
              className={`sq-press flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                filterCategory !== 'all'
                  ? 'border-[color:color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                  : 'border-border/70 bg-card text-foreground hover:bg-muted'
              }`}
            >
              <span>{filterCategory === 'all' ? 'Health status' : activeFilterLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${isHealthFilterOpen ? 'rotate-180' : ''}`} />
            </button>
            {isHealthFilterOpen && (
              <div className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-2 min-w-[210px] overflow-hidden rounded-lg p-1">
                {healthFilterOptions.map(option => (
                  <button
                    key={option.category}
                    type="button"
                    onClick={() => {
                      applyHealthFilter(option.category);
                      setIsHealthFilterOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      option.category === filterCategory
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{option.label}</span>
                    <StatusChip tone={summaryToneToStatus(option.tone)} className="text-[10px] font-bold tabular-nums">
                      {option.count}
                    </StatusChip>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => { setIsSortOpen(!isSortOpen); setIsHealthFilterOpen(false); }}
              className="sq-press flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3.5 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-muted"
            >
              <span>Sort: {activeSortLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>
            {isSortOpen && (
              <div className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-lg p-1">
                {sortOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSortMode(option.value);
                      setIsSortOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      option.value === sortMode
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {option.label}
                    <span className="ml-1 text-[10px] text-muted-foreground">· {option.helper}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={expandAllGroups} className="sq-press flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border">
              <Icon name="chevron-down" className="h-3.5 w-3.5 text-muted-foreground" />
              Expand
            </button>
            <button onClick={collapseAllGroups} className="sq-press flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border">
              <Icon name="chevron-down" className="h-3.5 w-3.5 rotate-180 text-muted-foreground" />
              Collapse
            </button>
          </div>
        </div>

        <div className="mt-2 text-[10px] font-medium text-muted-foreground">
          {activeGroupCount > 0
            ? `${activeGroupCount} group${activeGroupCount === 1 ? '' : 's'} expanded · details load on demand`
            : 'All groups collapsed · details load on demand'}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="check-circle" className="h-5 w-5" />}
          title={`No vehicles match the current filter${searchQuery ? ' or search' : ''}.`}
          className="sq-card rounded-2xl shadow-[var(--shadow-1)]"
        />
      ) : (
        <div className="space-y-2.5">
          {groupedVehicles.map(group => {
            const isGroupOpen = expandedGroups.has(group.key);
            const groupPct = Math.round((group.vehicles.length / Math.max(filtered.length, 1)) * 100);
            return (
              <section key={group.key} className="sq-card rounded-2xl overflow-hidden shadow-[var(--shadow-1)]">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full px-3 py-3 flex items-center justify-between gap-3 text-left hover:bg-muted/35 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${toneClass(group.tone)}`}>
                      {group.key === 'critical' ? <ShieldAlert className="h-4 w-4" /> : group.key === 'warning' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-[13px] font-semibold text-foreground">{group.title}</h2>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{group.vehicles.length}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{group.subtitle} · {groupPct}% of {selectionLabel}</p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                </button>

                {isGroupOpen && (
                  <div className="border-t border-border/60 divide-y divide-border/50">
                    {group.vehicles.map(vehicle => {
                      const cd = conditionData[vehicle.id];
                      const isVehicleOpen = expandedVehicleId === vehicle.id;
                      const isLoading = loadingIds.has(vehicle.id);
                      const brand = getBrandFromModel({ make: vehicle.make, model: vehicle.model });

                      const health = healthMap.get(vehicle.id);
                      const status = statusFor(vehicle.id);
                      const statusTone: Tone = toneFromStatus(status);
                      const reasons = collectReasons(health);
                      const blocked = health?.rental_blocked ?? false;
                      const blockingReasons = health?.blocking_reasons ?? [];

                      const odomKm =
                        vehicle.odometerKm != null && vehicle.odometerKm > 0
                          ? Number(vehicle.odometerKm)
                          : typeof vehicle.odometer === 'number' && Number.isFinite(vehicle.odometer) && vehicle.odometer > 0
                            ? vehicle.odometer
                            : null;
                      const odometer = odomKm != null ? `${Math.round(odomKm).toLocaleString('de-DE')} km` : '—';

                      return (
                        <div key={vehicle.id} className={`bg-card ${isVehicleOpen ? 'p-2.5 sm:p-3' : ''}`}>
                          <div
                            className={
                              isVehicleOpen
                                ? `rounded-2xl border ${statusTone === 'critical' ? 'border-[color:var(--status-critical)]/40' : statusTone === 'warning' ? 'border-[color:var(--status-attention)]/40' : 'border-border/70'} bg-background shadow-[var(--shadow-2)] overflow-hidden`
                                : ''
                            }
                          >
                            <button
                              onClick={() => toggleVehicle(vehicle.id)}
                              className={`w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors ${isVehicleOpen ? 'bg-muted/30' : 'hover:bg-muted/35'}`}
                            >
                              <div className="h-9 w-9 rounded-xl bg-muted/70 flex items-center justify-center shrink-0 mt-0.5">
                                <BrandLogo brand={brand} size={18} isDarkMode={systemDark} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="truncate text-[12px] font-semibold text-foreground">
                                    {[vehicle.make, getShortModel(vehicle.model), vehicle.year].filter(Boolean).join(' ')}
                                  </span>
                                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">{vehicle.license}</span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                  <span className="truncate">{vehicle.station || 'No station'}</span>
                                  <span>{odometer}</span>
                                  {status === 'Unknown' && !healthPending && (
                                    <span
                                      className="sq-tone-neutral inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold"
                                      title="Backend has no full health signal yet — treated as healthy on every other surface"
                                    >
                                      <CircleDot className="h-2.5 w-2.5" />
                                      Limited data
                                    </span>
                                  )}
                                  {status === 'Unknown' && healthPending && (
                                    <span className="sq-tone-neutral inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold">
                                      <span className="h-2 w-2 rounded-full border-[1.5px] border-current border-t-transparent animate-spin" />
                                      Checking
                                    </span>
                                  )}
                                </div>
                                {/* V4.7.28 — Inline reasons removed from the
                                    collapsed row to keep the list scannable.
                                    The full breakdown is shown when the row
                                    is expanded (see "Why this status" panel
                                    below). The aggregate count gives the
                                    operator enough signal to decide whether
                                    a drill-down is worth it. */}
                                {!isVehicleOpen && (reasons.length > 0 || blockingReasons.length > 0) && (
                                  <div className="mt-1 text-[10px] font-medium text-muted-foreground">
                                    {blockingReasons.length + reasons.length} reason{blockingReasons.length + reasons.length === 1 ? '' : 's'} · expand to view
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                                {blocked && (
                                  <StatusChip tone="critical">Blocked</StatusChip>
                                )}
                                <HealthStatusChip
                                  state={effectiveStatusToHealthState(status)}
                                  label={healthLabelEx(status, healthPending)}
                                  dot={false}
                                />
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isVehicleOpen ? 'rotate-180' : ''}`} />
                              </div>
                            </button>

                            {isVehicleOpen && (reasons.length > 0 || blockingReasons.length > 0) && (
                              <div className="px-3 pt-2.5 pb-1 border-t border-border/60 bg-muted/15">
                                <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                                  Why this status
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                  {blockingReasons.map((reason, idx) => (
                                    <span
                                      key={`block-${idx}`}
                                      className="inline-flex items-center gap-1 rounded-md sq-tone-critical px-1.5 py-0.5 text-[10px] font-medium"
                                    >
                                      <ShieldAlert className="h-3 w-3" />
                                      <span className="truncate max-w-[40ch] sm:max-w-none">{reason}</span>
                                    </span>
                                  ))}
                                  {reasons.map(r => (
                                    <span
                                      key={r.module}
                                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                                        r.state === 'critical' ? 'sq-tone-critical' : 'sq-tone-warning'
                                      }`}
                                    >
                                      <span className="font-semibold">{r.label}:</span>
                                      <span className="truncate max-w-[44ch] sm:max-w-none">{r.reason}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {isVehicleOpen && renderConditionTiles(vehicle, cd, isLoading)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConditionTile({ icon: IconCmp, label, value, meta, percent, tone, onClick }: {
  icon: LucideIcon;
  label: string;
  value: string;
  meta: string;
  percent: number | null;
  tone: Tone;
  onClick?: () => void;
}) {
  const width = percent == null ? 10 : Math.min(Math.max(percent, 6), 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="sq-card-elevated rounded-xl px-3 py-2.5 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${toneClass(tone)}`}>
            <IconCmp className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{meta}</div>
          </div>
        </div>
        <div className={`shrink-0 text-[13px] font-semibold ${textToneClass(tone)}`}>{value}</div>
      </div>
      {percent != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${barClass(percent)}`} style={{ width: `${width}%` }} />
        </div>
      )}
    </button>
  );
}
