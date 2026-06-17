import type {
  BatteryHealthSummary,
  BrakeHealthSummary,
  RentalHealthModule,
  RentalHealthState,
  ServiceInfoStatus,
  TireHealthSummaryResponse,
  VehicleHealthResponse,
  VehicleHealthTabSummaryDto,
} from '../../../lib/api';
import type { StatusTone } from '../../../components/patterns';
import { collectRentalHealthReasons } from '../../rental-health-ui';
import {
  rentalHealthStateLabel,
  rentalHealthStateToTone,
  toneToChipClass,
  toneToSurfaceClass,
} from '../../lib/rental-health-status';
import {
  buildBokraftComplianceDisplay,
  buildNextServiceDisplay,
  buildTuvComplianceDisplay,
} from '../../lib/service-info-display';
import {
  dataQualityChipTone,
  dataQualityShortLabel,
  sortSummaryFindings,
} from '../../lib/health-tab-summary-ui';

export type VehicleHealthBoxOverallState =
  | 'loading'
  | 'unavailable'
  | 'insufficient'
  | 'good'
  | 'warning'
  | 'critical';

export type DtcLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export interface ModuleRowStyle {
  label: string;
  labelColor: string;
  bar: string;
  barPct: number;
  accentRing: string;
}

export interface FaultsStatDisplay {
  displayValue: string;
  toneClass: string;
  sublabel?: string;
}

export interface VehicleHealthBoxViewModel {
  overallState: VehicleHealthBoxOverallState;
  overallStatusLabel: string;
  overallTitle?: string;
  overallDot: string;
  overallAccentRing: string;
  statCriticalCount: number;
  statWarningCount: number;
  faultsStat: FaultsStatDisplay;
  trackedCount: number;
  untrackedCount: number;
  findings: Array<{ title: string; severity: 'critical' | 'warning' | 'info' | 'unknown' }>;
  serviceTileTone: 'critical' | 'warning' | 'good' | 'neutral' | 'info';
  healthItems: Array<{
    key: 'brakes' | 'tires' | 'battery';
    label: string;
    value: number;
    detail: string;
    tracked: boolean;
    rowStyle: ModuleRowStyle;
    showBadge: boolean;
    isCalibrating: boolean;
    isStabilizing: boolean;
    isUntracked: boolean;
    showPercent: boolean;
  }>;
  nsDisplay: ReturnType<typeof buildNextServiceDisplay>;
  tuvCompliance: ReturnType<typeof buildTuvComplianceDisplay>;
  bokCompliance: ReturnType<typeof buildBokraftComplianceDisplay>;
  dataBasis: {
    levelLabel: string;
    levelTone: StatusTone;
    qualityLabel: string;
    reasons: string[];
    degraded: Array<{ source: string; message: string }>;
  } | null;
}

function overallVisual(state: VehicleHealthBoxOverallState): {
  dot: string;
  accentRing: string;
} {
  switch (state) {
    case 'loading':
    case 'unavailable':
    case 'insufficient':
      return {
        dot: 'bg-[color:var(--status-nodata)]',
        accentRing: 'sq-tone-nodata ring-[color:var(--status-nodata-soft)]',
      };
    case 'good':
      return {
        dot: 'bg-[color:var(--status-positive)]',
        accentRing: 'sq-tone-success ring-[color:var(--status-positive-soft)]',
      };
    case 'warning':
      return {
        dot: 'bg-[color:var(--status-watch)]',
        accentRing: 'sq-tone-watch ring-[color:var(--status-watch-soft)]',
      };
    case 'critical':
    default:
      return {
        dot: 'bg-[color:var(--status-critical)]',
        accentRing: 'sq-tone-critical ring-[color:var(--status-critical-soft)]',
      };
  }
}

export function mapOverallHealthBoxState(params: {
  rentalHealth: VehicleHealthResponse | null;
  rentalHealthLoading: boolean;
  healthError: string | null;
}): { state: VehicleHealthBoxOverallState; label: string; title?: string } {
  const { rentalHealth, rentalHealthLoading, healthError } = params;

  if (rentalHealthLoading && !rentalHealth) {
    return { state: 'loading', label: 'Loading…' };
  }
  if (healthError && !rentalHealth) {
    return { state: 'unavailable', label: 'Limited Data' };
  }
  if (!rentalHealth) {
    return { state: 'insufficient', label: 'Insufficient Data' };
  }

  const rentalReasons = collectRentalHealthReasons(rentalHealth);
  const titleParts: string[] = [];
  if (rentalHealth.rental_blocked && rentalHealth.blocking_reasons.length > 0) {
    titleParts.push(`Blocked: ${rentalHealth.blocking_reasons.join(' · ')}`);
  }
  for (const r of rentalReasons) {
    titleParts.push(`${r.label}: ${r.reason}`);
  }
  const title = titleParts.join(' · ') || undefined;

  switch (rentalHealth.overall_state) {
    case 'critical':
      return { state: 'critical', label: 'Critical', title };
    case 'warning':
      return { state: 'warning', label: 'Warning', title };
    case 'good':
      return { state: 'good', label: 'Good Health', title };
    case 'unknown':
    case 'n_a':
    default:
      return { state: 'insufficient', label: 'Limited Data', title };
  }
}

/** Service tile severity: RentalHealth service_compliance wins; detail text stays HM/OEM. */
export function resolveServiceComplianceTone(
  displayTone: 'critical' | 'warning' | 'good' | 'neutral' | 'info',
  serviceModule: RentalHealthModule | undefined,
): 'critical' | 'warning' | 'good' | 'neutral' | 'info' {
  if (!serviceModule) return displayTone;
  switch (serviceModule.state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'good':
      return 'good';
    case 'unknown':
    case 'n_a':
      return displayTone === 'good' ? 'neutral' : displayTone;
    default:
      return displayTone;
  }
}

export function mapFaultsStat(
  rentalHealth: VehicleHealthResponse | null | undefined,
  dtcLoadState: DtcLoadState,
  dtcCount: number | null,
): FaultsStatDisplay {
  const mod = rentalHealth?.modules.error_codes;
  const neutralTone = 'border-border bg-muted/40 text-muted-foreground';
  const criticalTone = 'border-transparent sq-tone-critical';
  const watchTone = 'border-transparent sq-tone-watch';
  const noDataTone = 'border-transparent sq-tone-nodata';

  if (dtcLoadState === 'loading') {
    return { displayValue: '…', toneClass: neutralTone };
  }

  const reasonLower = (mod?.reason ?? '').toLowerCase();
  if (dtcLoadState === 'error' || reasonLower.includes('endpoint') || reasonLower.includes('unavailable')) {
    return { displayValue: '—', toneClass: noDataTone, sublabel: 'DTC unavailable' };
  }
  if (mod?.data_stale) {
    return { displayValue: '—', toneClass: watchTone, sublabel: 'DTC stale' };
  }
  if (mod?.state === 'unknown' && !mod.last_updated_at) {
    return { displayValue: '—', toneClass: noDataTone, sublabel: 'No DTC data' };
  }
  if (mod?.state === 'n_a') {
    return { displayValue: '—', toneClass: noDataTone, sublabel: 'No DTC data' };
  }

  const count = dtcCount ?? 0;
  if (count === 0) {
    return { displayValue: '0', toneClass: neutralTone };
  }
  return {
    displayValue: String(count),
    toneClass: mod?.state === 'critical' ? criticalTone : watchTone,
  };
}

function rentalModuleToRowStyle(state: RentalHealthState | undefined): ModuleRowStyle {
  const tone = rentalHealthStateToTone(state);
  const label = rentalHealthStateLabel(state);
  const accentRing = `${toneToSurfaceClass(tone)} ring-1 ring-border`;

  switch (tone) {
    case 'success':
      return {
        label,
        labelColor: 'text-[color:var(--status-positive)]',
        bar: 'bg-[color:var(--status-positive)]',
        barPct: 85,
        accentRing,
      };
    case 'warning':
    case 'watch':
      return {
        label,
        labelColor: 'text-[color:var(--status-watch)]',
        bar: 'bg-[color:var(--status-watch)]',
        barPct: 45,
        accentRing,
      };
    case 'critical':
      return {
        label,
        labelColor: 'text-[color:var(--status-critical)]',
        bar: 'bg-[color:var(--status-critical)]',
        barPct: 15,
        accentRing,
      };
    default:
      return {
        label: state === 'unknown' ? 'Limited data' : 'No Data',
        labelColor: 'text-muted-foreground',
        bar: 'bg-muted',
        barPct: 0,
        accentRing: 'sq-tone-neutral ring-1 ring-border',
      };
  }
}

function getWearStatus(v: number, tracked: boolean): ModuleRowStyle {
  if (!tracked) return rentalModuleToRowStyle('unknown');
  if (v >= 80) {
    return {
      label: 'Excellent',
      labelColor: 'text-[color:var(--status-positive)]',
      bar: 'bg-[color:var(--status-positive)]',
      barPct: v,
      accentRing: 'sq-tone-success ring-1 ring-border',
    };
  }
  if (v >= 60) {
    return {
      label: 'Monitor',
      labelColor: 'text-[color:var(--status-watch)]',
      bar: 'bg-[color:var(--status-watch)]',
      barPct: v,
      accentRing: 'sq-tone-watch ring-1 ring-border',
    };
  }
  if (v >= 30) {
    return {
      label: 'Due soon',
      labelColor: 'text-[color:var(--status-warning)]',
      bar: 'bg-[color:var(--status-warning)]',
      barPct: v,
      accentRing: 'sq-tone-warning ring-1 ring-border',
    };
  }
  return {
    label: 'Critical',
    labelColor: 'text-[color:var(--status-critical)]',
    bar: 'bg-[color:var(--status-critical)]',
    barPct: v,
    accentRing: 'sq-tone-critical ring-1 ring-border',
  };
}

function getBatteryLocalStyle(
  v: number,
  tracked: boolean,
  condition: string | null | undefined,
  voltageV: number | null | undefined,
): ModuleRowStyle {
  if (!tracked) return rentalModuleToRowStyle('unknown');
  if (condition === 'good') return rentalModuleToRowStyle('good');
  if (condition === 'watch') return rentalModuleToRowStyle('warning');
  if (condition === 'attention') return rentalModuleToRowStyle('critical');
  if (voltageV != null) {
    if (voltageV < 12.0) return rentalModuleToRowStyle('critical');
    if (voltageV < 12.4) return rentalModuleToRowStyle('warning');
    return rentalModuleToRowStyle('good');
  }
  if (v < 50) return rentalModuleToRowStyle('critical');
  if (v < 75) return rentalModuleToRowStyle('warning');
  return rentalModuleToRowStyle('good');
}

function getBrakeLocalStyle(cond: string | undefined, tracked: boolean): ModuleRowStyle {
  if (!tracked) return rentalModuleToRowStyle('unknown');
  switch (cond) {
    case 'GOOD':
      return rentalModuleToRowStyle('good');
    case 'WATCH':
    case 'WARNING':
      return rentalModuleToRowStyle('warning');
    case 'CRITICAL':
      return rentalModuleToRowStyle('critical');
    default:
      return rentalModuleToRowStyle('unknown');
  }
}

function resolveModuleRowStyle(
  rentalMod: RentalHealthModule | undefined,
  localStyle: ModuleRowStyle,
): ModuleRowStyle {
  if (rentalMod) return rentalModuleToRowStyle(rentalMod.state);
  return localStyle;
}

function moduleShowBadge(
  rentalMod: RentalHealthModule | undefined,
  localShow: boolean,
): boolean {
  if (rentalMod) {
    return rentalMod.state === 'critical' || rentalMod.state === 'warning';
  }
  return localShow;
}

export function buildVehicleHealthBoxViewModel(params: {
  rentalHealth: VehicleHealthResponse | null;
  rentalHealthLoading: boolean;
  healthError: string | null;
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcLoadState: DtcLoadState;
  dtcCount: number | null;
  healthTabSummary: VehicleHealthTabSummaryDto | null;
  vehicleTiresFallback: number;
  lvBatteryVoltage: number | null;
}): VehicleHealthBoxViewModel {
  const {
    rentalHealth,
    rentalHealthLoading,
    healthError,
    tires,
    brakes,
    battery,
    service,
    dtcLoadState,
    dtcCount,
    healthTabSummary,
    vehicleTiresFallback,
    lvBatteryVoltage,
  } = params;

  const overall = mapOverallHealthBoxState({ rentalHealth, rentalHealthLoading, healthError });
  const { dot, accentRing } = overallVisual(overall.state);

  const rentalReasons = collectRentalHealthReasons(rentalHealth);
  const rentalCriticalCount = rentalReasons.filter((r) => r.state === 'critical').length;
  const rentalWarningCount = rentalReasons.filter((r) => r.state === 'warning').length;

  const tiresVal = tires?.overallPercent ?? vehicleTiresFallback ?? 0;
  const batteryPubState = battery?.lv?.publicationState ?? battery?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const soh =
    battery?.lv?.healthPercent ??
    (batteryPubState === 'INITIAL_CALIBRATION'
      ? null
      : (battery?.currentState?.publishedSohPct ?? battery?.currentState?.sohPercent ?? null));
  const estimatedSoh = battery?.lv?.estimatedHealthPercent ?? battery?.currentState?.estimatedSohPct ?? null;
  const voltage = battery?.lv?.telemetry?.voltageV ?? battery?.currentState?.voltageV ?? lvBatteryVoltage;
  const batteryScore = soh ?? estimatedSoh ?? null;
  const batteryVal = batteryScore ?? 0;
  const batteryCondition = battery?.lv?.condition ?? battery?.condition ?? null;

  const brakesTracked = brakes?.overallCondition != null && brakes.overallCondition !== 'UNKNOWN';
  const tiresTracked = tires?.overallPercent != null || vehicleTiresFallback > 0;
  const batteryTracked = batteryScore != null;
  const trackedFlags = [brakesTracked, tiresTracked, batteryTracked];
  const untrackedCount = 3 - trackedFlags.filter(Boolean).length;
  const trackedCount = trackedFlags.filter(Boolean).length;

  const tireCanon = tires?.overallStatus ?? null;
  const brakeCond = brakes?.overallCondition;

  const localCriticalCount = [
    brakeCond === 'CRITICAL',
    tiresTracked && (tireCanon ? tireCanon === 'CRITICAL' : tiresVal < 30),
    batteryTracked && batteryCondition === 'attention',
  ].filter(Boolean).length;
  const localDueSoonCount = [
    brakeCond === 'WARNING' || brakeCond === 'WATCH',
    tiresTracked && (tireCanon ? (tireCanon === 'WARNING' || tireCanon === 'WATCH') : (tiresVal >= 30 && tiresVal < 60)),
    batteryTracked && batteryCondition === 'watch',
  ].filter(Boolean).length;

  const statCriticalCount = rentalHealth ? rentalCriticalCount : localCriticalCount;
  const statWarningCount = rentalHealth ? rentalWarningCount : localDueSoonCount;

  const brakesDetail = (() => {
    const remKm = brakes?.estimatedReplacementDueInKm ?? brakes?.legacy?.remainingKm ?? null;
    if (remKm != null) return `~${Math.round(remKm / 1000)}k km remaining`;
    const frontMin = brakes?.estimatedFrontRemainingKmMin;
    if (frontMin != null) return `Front ~${Math.round(frontMin / 1000)}k km`;
    if (brakes?.stateClass === 'WARNING_ONLY') return 'Warning-only telemetry';
    if (brakes?.stateClass === 'NO_BASELINE') return 'No baseline';
    if (brakeCond === 'GOOD') return 'Healthy';
    if (brakeCond === 'WATCH' || brakeCond === 'WARNING') return 'Check soon';
    return brakesTracked ? 'Service needed' : 'No tracking';
  })();

  const tiresDetail = (() => {
    const remKm = tires?.overallRemainingKm;
    if (remKm != null) return `~${Math.round(remKm / 1000)}k km`;
    if (tires?.actionState === 'REPLACE') return 'Replace now';
    if (tires?.actionState === 'PLAN_SERVICE') return 'Plan service';
    if (tires?.actionState === 'CHECK_SOON') return 'Check soon';
    return tiresTracked ? 'Model estimate unavailable' : 'No tracking';
  })();

  const batteryDetail = (() => {
    if (batteryPubState === 'INITIAL_CALIBRATION') return 'Calibrating (estimate unavailable)';
    if (batteryPubState === 'STABILIZING') return voltage != null ? `~${voltage.toFixed(1)}V · Stabilizing` : 'Stabilizing';
    const vStr = voltage != null ? `${voltage.toFixed(1)}V` : null;
    if (batteryCondition === 'attention') {
      return vStr
        ? `${vStr} · Kritisch — Starthilfe/Austausch empfohlen`
        : 'Kritisch — Starthilfe/Austausch empfohlen';
    }
    if (batteryCondition === 'watch') {
      return vStr
        ? `${vStr} · Startschwierigkeiten möglich`
        : 'Startschwierigkeiten möglich';
    }
    if (soh != null) return vStr ?? 'SOH tracked';
    if (vStr) return vStr;
    return 'Estimate unavailable';
  })();

  const healthItems: VehicleHealthBoxViewModel['healthItems'] = [
    {
      key: 'brakes',
      label: 'Brakes',
      value: 0,
      detail: brakesDetail,
      tracked: brakesTracked,
      rowStyle: resolveModuleRowStyle(
        rentalHealth?.modules.brakes,
        getBrakeLocalStyle(brakeCond, brakesTracked),
      ),
      showBadge: moduleShowBadge(
        rentalHealth?.modules.brakes,
        brakeCond === 'WARNING' || brakeCond === 'CRITICAL' || brakeCond === 'WATCH',
      ),
      isCalibrating: false,
      isStabilizing: false,
      isUntracked: !brakesTracked,
      showPercent: false,
    },
    {
      key: 'tires',
      label: 'Tires',
      value: tiresVal,
      detail: tiresDetail,
      tracked: tiresTracked,
      rowStyle: resolveModuleRowStyle(
        rentalHealth?.modules.tires,
        getWearStatus(tiresVal, tiresTracked),
      ),
      showBadge: moduleShowBadge(
        rentalHealth?.modules.tires,
        tiresTracked && (tireCanon ? tireCanon !== 'GOOD' : tiresVal < 60),
      ),
      isCalibrating: false,
      isStabilizing: false,
      isUntracked: !tiresTracked,
      showPercent: true,
    },
    {
      key: 'battery',
      label: 'Battery',
      value: batteryVal,
      detail: batteryDetail,
      tracked: batteryTracked,
      rowStyle: resolveModuleRowStyle(
        rentalHealth?.modules.battery,
        getBatteryLocalStyle(batteryVal, batteryTracked, batteryCondition, voltage),
      ),
      showBadge: moduleShowBadge(
        rentalHealth?.modules.battery,
        batteryCondition === 'attention' || batteryCondition === 'watch',
      ),
      isCalibrating: batteryPubState === 'INITIAL_CALIBRATION',
      isStabilizing: batteryPubState === 'STABILIZING',
      isUntracked: !batteryTracked && batteryPubState !== 'INITIAL_CALIBRATION' && batteryPubState !== 'STABILIZING',
      showPercent: false,
    },
  ];

  const dataBasis = healthTabSummary?.dataQuality
    ? {
        levelLabel: dataQualityShortLabel(healthTabSummary.dataQuality.level),
        levelTone: dataQualityChipTone(healthTabSummary.dataQuality.level),
        qualityLabel: healthTabSummary.dataQuality.label,
        reasons: healthTabSummary.dataQuality.reasons.slice(0, 4),
        degraded: (healthTabSummary.degradedDependencies ?? []).slice(0, 4).map((d) => ({
          source: d.source,
          message: d.message,
        })),
      }
    : null;

  const findings = (() => {
    if (healthTabSummary?.findings?.length) {
      return sortSummaryFindings(healthTabSummary.findings)
        .slice(0, 3)
        .map((f) => ({
          title: f.title,
          severity: (f.severity as 'critical' | 'warning' | 'info' | 'unknown') ?? 'unknown',
        }));
    }
    return rentalReasons
      .filter((r) => r.state === 'critical' || r.state === 'warning')
      .slice(0, 3)
      .map((r) => ({
        title: `${r.label}: ${r.reason}`,
        severity: r.state === 'critical' ? ('critical' as const) : ('warning' as const),
      }));
  })();

  const nsDisplay = buildNextServiceDisplay(service ?? null);

  return {
    overallState: overall.state,
    overallStatusLabel: overall.label,
    overallTitle: overall.title,
    overallDot: dot,
    overallAccentRing: accentRing,
    statCriticalCount,
    statWarningCount,
    faultsStat: mapFaultsStat(rentalHealth, dtcLoadState, dtcCount),
    trackedCount,
    untrackedCount,
    findings,
    serviceTileTone: resolveServiceComplianceTone(
      nsDisplay.tone,
      rentalHealth?.modules.service_compliance,
    ),
    healthItems,
    nsDisplay,
    tuvCompliance: buildTuvComplianceDisplay(service ?? null),
    bokCompliance: buildBokraftComplianceDisplay(service ?? null),
    dataBasis,
  };
}

export function statTileTone(
  label: 'Critical' | 'Due soon',
  count: number,
): string {
  if (label === 'Critical') {
    return count > 0 ? 'border-transparent sq-tone-critical' : 'border-transparent sq-tone-success';
  }
  return count > 0
    ? 'border-transparent sq-tone-watch'
    : 'border-border bg-muted/40 text-muted-foreground';
}

export function complianceToneClass(
  tone: 'critical' | 'warning' | 'good' | 'neutral' | 'info',
): 'critical' | 'imminent' | 'normal' | 'muted' {
  if (tone === 'critical') return 'critical';
  if (tone === 'warning') return 'imminent';
  if (tone === 'good') return 'normal';
  return 'muted';
}

export function complianceSurfaceClasses(tone: 'critical' | 'imminent' | 'normal' | 'muted'): {
  ring: string;
  icon: string;
  title: string;
  value: string;
} {
  if (tone === 'critical') {
    return {
      ring: 'border-transparent bg-[color:var(--status-critical-soft)]',
      icon: 'text-[color:var(--status-critical)]',
      title: 'text-[color:var(--status-critical)]',
      value: 'text-[color:var(--status-critical)]',
    };
  }
  if (tone === 'imminent') {
    return {
      ring: 'border-transparent bg-[color:var(--status-watch-soft)]',
      icon: 'text-[color:var(--status-watch)]',
      title: 'text-[color:var(--status-watch)]',
      value: 'text-[color:var(--status-watch)]',
    };
  }
  if (tone === 'muted') {
    return {
      ring: 'border-border bg-muted/40',
      icon: 'text-muted-foreground',
      title: 'text-muted-foreground',
      value: 'text-muted-foreground',
    };
  }
  return {
    ring: 'border-border bg-card',
    icon: 'text-[color:var(--brand)]',
    title: 'text-foreground',
    value: 'text-foreground/90',
  };
}

export function chipClassForTone(tone: StatusTone): string {
  return toneToChipClass(tone);
}
