import type {
  TireHealthSummaryResponse,
  BatteryHealthSummary,
  ServiceInfoStatus,
  OilChangeStatus,
  BrakeHealthSummary,
  RentalHealthState,
} from '../../lib/api';
import { hmTrackedServiceDays, hmTrackedServiceKm, isHmServiceTracked } from '../lib/service-info-display';
import { type PlanningItem, runForecastEngine } from './vehicle-forecast-engine';
import { tireHasTrackableData, tireUiStatus } from '../lib/tire-health-detail-ui';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InsightsInput {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcCount: number;
  /** Rental-Health `modules.error_codes.state` — canonical DTC escalation */
  errorCodesState?: RentalHealthState | null;
  /** Optional: passed through to the forecast engine for oil service planning */
  oil?: OilChangeStatus | null;
}

export type ReadinessLevel = 'Ready' | 'Monitor' | 'Limited' | 'Action Needed';
export type CostOutlookLevel = 'Stable' | 'Moderate Increase' | 'Elevated';
export type DowntimeRiskLevel = 'Low' | 'Medium' | 'High';

export type { PlanningItem };

export interface InsightsDerived {
  verdict: string;
  readiness: ReadinessLevel;
  costOutlook: CostOutlookLevel;
  downtimeRisk: DowntimeRiskLevel;
  forecast: PlanningItem[];
  nextAction: string;
  confidence: string;
  hasAnyData: boolean;
  trackedSystems: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_ACTION_KM = 500;
const SERVICE_LIMITED_KM = 2_000;
const SERVICE_MONITOR_KM = 4_500;

/** Align DTC escalation with Rental-Health-V1 (`evaluateErrorCodes`). */
function dtcEscalation(input: InsightsInput): 'critical' | 'warning' | 'none' {
  const state = input.errorCodesState;
  if (state === 'critical') return 'critical';
  if (state === 'warning') return 'warning';
  if (input.dtcCount > 0 && (state == null || state === 'unknown')) return 'warning';
  return 'none';
}

type TireEscalation = 'critical' | 'warning' | 'watch' | 'good' | null;

/** Canonical tire escalation from backend uiStatus / actionState only. */
export function tireEscalationLevel(tires: TireHealthSummaryResponse | null): TireEscalation {
  if (!tires || !tireHasTrackableData(tires)) return null;
  const ui = tireUiStatus(tires);
  if (tires.actionState === 'REPLACE' || ui === 'CRITICAL') return 'critical';
  if (
    ui === 'REVIEW_REQUIRED' ||
    ui === 'MEASUREMENT_REQUIRED' ||
    tires.actionState === 'PLAN_SERVICE' ||
    ui === 'WARNING'
  ) {
    return 'warning';
  }
  if (ui === 'LIMITED_DATA' || tires.actionState === 'CHECK_SOON' || ui === 'WATCH') return 'watch';
  if (ui === 'GOOD') return 'good';
  return null;
}

type BrakeCanonicalLevel = 'critical' | 'warning' | 'watch' | 'good' | null;

/** Canonical brake escalation from `overallCondition` only. */
export function brakeCanonicalLevel(brakes: BrakeHealthSummary | null): BrakeCanonicalLevel {
  const cond = brakes?.overallCondition;
  if (cond === 'CRITICAL') return 'critical';
  if (cond === 'WARNING') return 'warning';
  if (cond === 'WATCH') return 'watch';
  if (cond === 'GOOD') return 'good';
  return null;
}

function batteryCondition(
  battery: BatteryHealthSummary | null,
): 'good' | 'watch' | 'attention' | 'calibrating' | 'unknown' | null {
  if (!battery) return null;
  return battery.lv?.condition ?? battery.condition ?? null;
}

function batteryStatus(battery: BatteryHealthSummary | null): string | null {
  if (!battery) return null;
  return battery.lv?.status ?? null;
}

// ── Readiness ─────────────────────────────────────────────────────────────────

export function deriveReadiness(input: InsightsInput): ReadinessLevel {
  const { tires, brakes, battery, service } = input;
  const batCondition = batteryCondition(battery);
  const dtc = dtcEscalation(input);

  if (dtc === 'critical') return 'Action Needed';
  if (tires?.actionState === 'REPLACE') return 'Action Needed';

  const tireLevel = tireEscalationLevel(tires);
  const brakeLevel = brakeCanonicalLevel(brakes);
  const svcKm = hmTrackedServiceKm(service);
  const svcDays = hmTrackedServiceDays(service);
  const tuvMonths = service?.tuvRemainingMonths ?? null;
  const bokMonths = service?.bokraftRemainingMonths ?? null;

  if (
    tireLevel === 'critical' ||
    brakeLevel === 'critical' ||
    (svcKm != null && svcKm <= SERVICE_ACTION_KM)
  ) return 'Action Needed';

  if (
    tireLevel === 'warning' ||
    tires?.actionState === 'PLAN_SERVICE' ||
    brakeLevel === 'warning' ||
    (svcKm != null && svcKm < SERVICE_LIMITED_KM) ||
    (tuvMonths != null && tuvMonths < 1) ||
    (bokMonths != null && bokMonths < 1)
  ) return 'Limited';

  if (
    tireLevel === 'watch' ||
    tires?.actionState === 'CHECK_SOON' ||
    brakeLevel === 'watch' ||
    (svcKm != null && svcKm < SERVICE_MONITOR_KM) ||
    (svcDays != null && svcDays < 60) ||
    (tuvMonths != null && tuvMonths < 3) ||
    (bokMonths != null && bokMonths < 3) ||
    batCondition === 'attention' ||
    dtc === 'warning'
  ) return 'Monitor';

  return 'Ready';
}

// ── Cost Outlook ──────────────────────────────────────────────────────────────

export function deriveCostOutlook(input: InsightsInput): CostOutlookLevel {
  const { tires, brakes, battery, service } = input;
  const batCondition = batteryCondition(battery);

  const tireLevel = tireEscalationLevel(tires);
  const brakeLevel = brakeCanonicalLevel(brakes);
  const svcKm = hmTrackedServiceKm(service);
  const svcDays = hmTrackedServiceDays(service);

  if (
    tires?.actionState === 'REPLACE' ||
    tireLevel === 'critical' ||
    brakeLevel === 'critical' ||
    (svcKm != null && svcKm < SERVICE_LIMITED_KM) ||
    batCondition === 'attention'
  ) return 'Elevated';

  if (
    tires?.actionState === 'PLAN_SERVICE' ||
    tireLevel === 'warning' ||
    tireLevel === 'watch' ||
    brakeLevel === 'warning' ||
    brakeLevel === 'watch' ||
    (svcKm != null && svcKm < SERVICE_MONITOR_KM) ||
    batCondition === 'watch'
  ) return 'Moderate Increase';

  return 'Stable';
}

// ── Downtime Risk ─────────────────────────────────────────────────────────────

export function deriveDowntimeRisk(input: InsightsInput): DowntimeRiskLevel {
  const { tires, brakes, battery, service } = input;
  const batCondition = batteryCondition(battery);
  const dtc = dtcEscalation(input);

  const tireLevel = tireEscalationLevel(tires);
  const brakeLevel = brakeCanonicalLevel(brakes);
  const svcKm = hmTrackedServiceKm(service);
  const svcDays = hmTrackedServiceDays(service);

  if (
    dtc === 'critical' ||
    tires?.actionState === 'REPLACE' ||
    tireLevel === 'critical' ||
    brakeLevel === 'critical'
  ) return 'High';

  if (
    tireLevel === 'warning' ||
    brakeLevel === 'warning' ||
    (svcKm != null && svcKm < SERVICE_LIMITED_KM) ||
    batCondition === 'attention' ||
    dtc === 'warning'
  ) return 'Medium';

  return 'Low';
}

// ── Verdict (single punchy sentence, ≤15 words) ───────────────────────────────

export function deriveVerdict(
  readiness: ReadinessLevel,
  costOutlook: CostOutlookLevel,
  _downtimeRisk: DowntimeRiskLevel,
  input: InsightsInput,
): string {
  const { tires, brakes, service } = input;
  const svcKm = hmTrackedServiceKm(service);
  const brakeLevel = brakeCanonicalLevel(brakes);
  const dtc = dtcEscalation(input);

  if (dtc === 'critical') {
    const n = input.dtcCount;
    return `${n} active fault code${n > 1 ? 's' : ''} — inspection required before next rental.`;
  }
  if (dtc === 'warning') {
    const n = input.dtcCount;
    return `${n} active fault code${n > 1 ? 's' : ''} — review before next rental assignment.`;
  }

  if (readiness === 'Action Needed') {
    if (tireEscalationLevel(tires) === 'critical') return 'Tire wear below safe threshold — not fit for rental.';
    if (brakeLevel === 'critical') return 'Brake wear critical — remove from rotation until inspected.';
    if (svcKm != null && svcKm <= SERVICE_ACTION_KM) return 'Service overdue — take off rotation until completed.';
    return 'Blocking condition detected — not recommended for active rental.';
  }

  if (readiness === 'Limited') {
    if (tireEscalationLevel(tires) === 'warning') return 'Usable — tire wear requires scheduling before the next booking.';
    if (brakeLevel === 'warning') return 'Usable — brake wear requires prompt planning.';
    if (svcKm != null && svcKm < SERVICE_LIMITED_KM) return 'Usable — service due soon. Plan before the next booking window.';
    if (service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 1) return 'TÜV deadline reached — book inspection immediately.';
    return 'Usable — maintenance required before the next booking window.';
  }

  if (readiness === 'Monitor') {
    const focus =
      svcKm != null && svcKm < SERVICE_MONITOR_KM ? 'Service due soon'
      : tireEscalationLevel(tires) === 'watch' ? 'Tire wear approaching limit'
      : brakeLevel === 'watch' ? 'Brake wear elevated'
      : service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 3 ? 'TÜV window approaching'
      : 'Maintenance interval approaching';
    return `Rental-ready. ${focus} — plan within the forecast window.`;
  }

  // Ready
  if (costOutlook === 'Stable') return 'Rental-ready. No intervention required in the planning window.';
  return 'Rental-ready — near-term maintenance planning recommended.';
}

// ── Next Action (≤10 words, active voice) ────────────────────────────────────

export function deriveNextAction(
  readiness: ReadinessLevel,
  _downtimeRisk: DowntimeRiskLevel,
  input: InsightsInput,
): string {
  const { tires, brakes, service } = input;
  const svcKm = hmTrackedServiceKm(service);
  const brakeLevel = brakeCanonicalLevel(brakes);
  const dtc = dtcEscalation(input);

  if (dtc === 'critical') return 'Clear fault codes before the next rental assignment.';
  if (dtc === 'warning') return 'Review active fault codes before the next assignment.';

  if (readiness === 'Action Needed') return 'Pull from rotation — resolve blocking condition first.';

  if (readiness === 'Limited') {
    if (service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 1) return 'Book TÜV immediately — regulatory deadline reached.';
    if (brakeLevel === 'warning') return 'Book brake inspection before the next busy window.';
    if (tireEscalationLevel(tires) === 'warning') return 'Assess tires — wear approaching operational limit.';
    return 'Schedule maintenance within the current booking window.';
  }

  if (readiness === 'Monitor') {
    if (service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 3) return 'Plan TÜV appointment within 2–3 months.';
    if (svcKm != null && svcKm < SERVICE_MONITOR_KM) return 'Plan service before the next dense booking period.';
    if (brakeLevel === 'watch') return 'Include brake check in the next downtime window.';
    return 'Plan service appointment within the upcoming booking window.';
  }

  return 'Continue on standard schedule — no urgent action required.';
}

// ── Confidence Note (concise, max 12 words) ───────────────────────────────────

export function deriveConfidence(input: InsightsInput): string {
  const { tires, brakes, battery, service } = input;
  const batStatus = batteryStatus(battery);

  const tracked: string[] = [];
  if (tireHasTrackableData(tires)) tracked.push('tires');
  if (brakes?.stateClass === 'MEASURED' || brakes?.stateClass === 'ESTIMATED') tracked.push('brakes');
  if (battery && batStatus !== 'calibrating' && batStatus !== 'estimate_unavailable') tracked.push('battery');
  // "Service is tracked" is broader than "DB baseline exists": for HM
  // fleet-clearance vehicles the OEM pushes remaining days/km directly,
  // which is a fully legitimate tracking source even without a DB event.
  const serviceTracked = isHmServiceTracked(service);
  if (serviceTracked) tracked.push('service');

  const missing: string[] = [];
  if (!tireHasTrackableData(tires) && tires?.actionState == null) missing.push('tire');
  if (!brakes || brakes.stateClass === 'NO_BASELINE' || brakes.stateClass === 'WARNING_ONLY') missing.push('brake');
  if (batStatus === 'calibrating' || batStatus === 'estimate_unavailable') missing.push('battery');
  if (!serviceTracked) missing.push('service');

  if (tracked.length === 0) return 'No tracking data connected.';

  if (missing.length >= 2) {
    const limitedBy = missing.slice(0, 2).join(' & ');
    return `${limitedBy} tracking inactive. Based on ${tracked.join(', ')}.`;
  }
  if (missing.length === 1) {
    return `${missing[0]} tracking inactive. Based on ${tracked.join(', ')}.`;
  }
  // Full coverage
  if (tracked.length >= 3) {
    return `Based on ${tracked.slice(0, -1).join(', ')} and ${tracked[tracked.length - 1]}.`;
  }
  return `Based on ${tracked.join(' and ')}.`;
}

// ── Tracked Systems ───────────────────────────────────────────────────────────

export function deriveTrackedSystems(input: InsightsInput): string[] {
  const { tires, brakes, battery, service } = input;
  const out: string[] = [];
  if (tireHasTrackableData(tires) || tires?.actionState != null) out.push('Tires');
  if (brakes && brakes.stateClass !== 'NO_BASELINE') out.push('Brakes');
  if (battery) out.push('Battery');
  if (service?.nextService?.trackingStatus === 'TRACKED') out.push('Service');
  return out;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function deriveInsights(input: InsightsInput): InsightsDerived {
  const hasAnyData = !!(input.tires || input.brakes || input.battery || input.service || input.dtcCount > 0);

  const readiness = deriveReadiness(input);
  const costOutlook = deriveCostOutlook(input);
  const downtimeRisk = deriveDowntimeRisk(input);
  const verdict = deriveVerdict(readiness, costOutlook, downtimeRisk, input);
  const nextAction = deriveNextAction(readiness, downtimeRisk, input);
  const confidence = deriveConfidence(input);
  const trackedSystems = deriveTrackedSystems(input);

  // Forecast powered by the dedicated engine (supports oil + V2 brake data)
  const forecast = runForecastEngine({
    service: input.service,
    tires: input.tires,
    brakeHealth: input.brakes,
    battery: input.battery,
    oil: input.oil ?? null,
  });

  return { verdict, readiness, costOutlook, downtimeRisk, forecast, nextAction, confidence, hasAnyData, trackedSystems };
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function readinessColors(level: ReadinessLevel): { dot: string; text: string } {
  switch (level) {
    case 'Ready':         return { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
    case 'Monitor':       return { dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
    case 'Limited':       return { dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' };
    case 'Action Needed': return { dot: 'bg-red-500',   text: 'text-red-600 dark:text-red-400' };
  }
}

export function costOutlookColors(level: CostOutlookLevel): { dot: string; text: string } {
  switch (level) {
    case 'Stable':            return { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
    case 'Moderate Increase': return { dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
    case 'Elevated':          return { dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' };
  }
}

export function downtimeRiskColors(level: DowntimeRiskLevel): { dot: string; text: string } {
  switch (level) {
    case 'Low':    return { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
    case 'Medium': return { dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' };
    case 'High':   return { dot: 'bg-red-500',   text: 'text-red-600 dark:text-red-400' };
  }
}

