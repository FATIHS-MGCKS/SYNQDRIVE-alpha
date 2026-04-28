import type {
  TireHealthSummaryResponse,
  BatteryHealthSummary,
  ServiceInfoStatus,
  OilChangeStatus,
  BrakeHealthSummary,
} from '../../lib/api';
import { type PlanningItem, runForecastEngine } from './vehicle-forecast-engine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InsightsInput {
  tires: TireHealthSummaryResponse | null;
  brakes: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcCount: number;
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

const TIRE_ACTION_PCT = 20;
const TIRE_LIMITED_PCT = 35;
const TIRE_MONITOR_PCT = 60;

const BRAKE_ACTION_PCT = 20;
const BRAKE_LIMITED_PCT = 35;
const BRAKE_MONITOR_PCT = 60;

const SERVICE_ACTION_KM = 500;
const SERVICE_LIMITED_KM = 2_000;
const SERVICE_MONITOR_KM = 4_500;

function brakeHealthPercent(brakes: BrakeHealthSummary | null): number | null {
  if (!brakes) return null;
  const pad = brakes.pads?.healthPercent ?? null;
  const disc = brakes.discs?.healthPercent ?? null;
  if (pad == null && disc == null) return null;
  return Math.min(pad ?? 101, disc ?? 101);
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
  const { tires, brakes, battery, service, dtcCount } = input;
  const batCondition = batteryCondition(battery);

  if (dtcCount > 0) return 'Action Needed';
  if (tires?.actionState === 'REPLACE') return 'Action Needed';

  const tiresPct = tires?.overallPercent ?? null;
  const brakesPct = brakeHealthPercent(brakes);
  const svcKm = service?.serviceRemainingKm ?? null;
  const tuvMonths = service?.tuvRemainingMonths ?? null;
  const bokMonths = service?.bokraftRemainingMonths ?? null;

  if (
    (tiresPct != null && tiresPct < TIRE_ACTION_PCT) ||
    (brakesPct != null && brakesPct < BRAKE_ACTION_PCT) ||
    (svcKm != null && svcKm <= SERVICE_ACTION_KM)
  ) return 'Action Needed';

  if (
    (tiresPct != null && tiresPct < TIRE_LIMITED_PCT) ||
    tires?.actionState === 'PLAN_SERVICE' ||
    (brakesPct != null && brakesPct < BRAKE_LIMITED_PCT) ||
    (svcKm != null && svcKm < SERVICE_LIMITED_KM) ||
    (tuvMonths != null && tuvMonths < 1) ||
    (bokMonths != null && bokMonths < 1)
  ) return 'Limited';

  if (
    (tiresPct != null && tiresPct < TIRE_MONITOR_PCT) ||
    tires?.actionState === 'CHECK_SOON' ||
    (brakesPct != null && brakesPct < BRAKE_MONITOR_PCT) ||
    (svcKm != null && svcKm < SERVICE_MONITOR_KM) ||
    (service?.serviceRemainingMonths != null && service.serviceRemainingMonths < 2) ||
    (tuvMonths != null && tuvMonths < 3) ||
    (bokMonths != null && bokMonths < 3) ||
    batCondition === 'attention'
  ) return 'Monitor';

  return 'Ready';
}

// ── Cost Outlook ──────────────────────────────────────────────────────────────

export function deriveCostOutlook(input: InsightsInput): CostOutlookLevel {
  const { tires, brakes, battery, service } = input;
  const batCondition = batteryCondition(battery);

  const tiresPct = tires?.overallPercent ?? null;
  const brakesPct = brakeHealthPercent(brakes);
  const svcKm = service?.serviceRemainingKm ?? null;

  if (
    tires?.actionState === 'REPLACE' ||
    (tiresPct != null && tiresPct < 25) ||
    (brakesPct != null && brakesPct < 25) ||
    (svcKm != null && svcKm < SERVICE_LIMITED_KM) ||
    batCondition === 'attention'
  ) return 'Elevated';

  if (
    tires?.actionState === 'PLAN_SERVICE' ||
    (tiresPct != null && tiresPct < 55) ||
    (brakesPct != null && brakesPct < 55) ||
    (svcKm != null && svcKm < SERVICE_MONITOR_KM) ||
    batCondition === 'watch'
  ) return 'Moderate Increase';

  return 'Stable';
}

// ── Downtime Risk ─────────────────────────────────────────────────────────────

export function deriveDowntimeRisk(input: InsightsInput): DowntimeRiskLevel {
  const { tires, brakes, battery, service, dtcCount } = input;
  const batCondition = batteryCondition(battery);

  const tiresPct = tires?.overallPercent ?? null;
  const brakesPct = brakeHealthPercent(brakes);
  const svcKm = service?.serviceRemainingKm ?? null;

  if (
    dtcCount > 0 ||
    tires?.actionState === 'REPLACE' ||
    (tiresPct != null && tiresPct < TIRE_ACTION_PCT) ||
    (brakesPct != null && brakesPct < BRAKE_ACTION_PCT)
  ) return 'High';

  if (
    (tiresPct != null && tiresPct < TIRE_LIMITED_PCT) ||
    (brakesPct != null && brakesPct < BRAKE_LIMITED_PCT) ||
    (svcKm != null && svcKm < SERVICE_LIMITED_KM) ||
    batCondition === 'attention'
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
  const { tires, brakes, service, dtcCount } = input;
  const brakePct = brakeHealthPercent(brakes);

  if (dtcCount > 0) {
    return `${dtcCount} active fault code${dtcCount > 1 ? 's' : ''} — inspection required before next rental.`;
  }

  if (readiness === 'Action Needed') {
    if (tires && tires.overallPercent < TIRE_ACTION_PCT) return 'Tire wear below safe threshold — not fit for rental.';
    if (brakePct != null && brakePct < BRAKE_ACTION_PCT) return 'Brake wear critical — remove from rotation until inspected.';
    if (service?.serviceRemainingKm != null && service.serviceRemainingKm <= SERVICE_ACTION_KM) return 'Service overdue — take off rotation until completed.';
    return 'Blocking condition detected — not recommended for active rental.';
  }

  if (readiness === 'Limited') {
    if (tires && tires.overallPercent < TIRE_LIMITED_PCT) return 'Usable — tire wear requires scheduling before the next booking.';
    if (brakePct != null && brakePct < BRAKE_LIMITED_PCT) return 'Usable — brake wear requires prompt planning.';
    if (service?.serviceRemainingKm != null && service.serviceRemainingKm < SERVICE_LIMITED_KM) return 'Usable — service due soon. Plan before the next booking window.';
    if (service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 1) return 'TÜV deadline reached — book inspection immediately.';
    return 'Usable — maintenance required before the next booking window.';
  }

  if (readiness === 'Monitor') {
    const focus =
      service?.serviceRemainingKm != null && service.serviceRemainingKm < SERVICE_MONITOR_KM ? 'Service due soon'
      : tires && tires.overallPercent < TIRE_MONITOR_PCT ? 'Tire wear approaching limit'
      : brakePct != null && brakePct < BRAKE_MONITOR_PCT ? 'Brake wear elevated'
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
  const { tires, brakes, service, dtcCount } = input;
  const brakePct = brakeHealthPercent(brakes);

  if (dtcCount > 0) return 'Clear fault codes before the next rental assignment.';

  if (readiness === 'Action Needed') return 'Pull from rotation — resolve blocking condition first.';

  if (readiness === 'Limited') {
    if (service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 1) return 'Book TÜV immediately — regulatory deadline reached.';
    if (brakePct != null && brakePct < BRAKE_LIMITED_PCT) return 'Book brake inspection before the next busy window.';
    if (tires?.overallPercent != null && tires.overallPercent < TIRE_LIMITED_PCT) return 'Assess tires — wear approaching operational limit.';
    return 'Schedule maintenance within the current booking window.';
  }

  if (readiness === 'Monitor') {
    if (service?.tuvRemainingMonths != null && service.tuvRemainingMonths < 3) return 'Plan TÜV appointment within 2–3 months.';
    if (service?.serviceRemainingKm != null && service.serviceRemainingKm < SERVICE_MONITOR_KM) return 'Plan service before the next dense booking period.';
    if (brakePct != null && brakePct < BRAKE_MONITOR_PCT) return 'Include brake check in the next downtime window.';
    return 'Plan service appointment within the upcoming booking window.';
  }

  return 'Continue on standard schedule — no urgent action required.';
}

// ── Confidence Note (concise, max 12 words) ───────────────────────────────────

export function deriveConfidence(input: InsightsInput): string {
  const { tires, brakes, battery, service } = input;
  const batStatus = batteryStatus(battery);

  const tracked: string[] = [];
  if (tires?.overallPercent != null) tracked.push('tires');
  if (brakes?.stateClass === 'MEASURED' || brakes?.stateClass === 'ESTIMATED') tracked.push('brakes');
  if (battery && batStatus !== 'calibrating' && batStatus !== 'estimate_unavailable') tracked.push('battery');
  // "Service is tracked" is broader than "DB baseline exists": for HM
  // fleet-clearance vehicles the OEM pushes remaining days/km directly,
  // which is a fully legitimate tracking source even without a DB event.
  const serviceTracked =
    service?.hasServiceBaseline ||
    service?.hmServiceSource === true ||
    service?.serviceRemainingDays != null ||
    service?.serviceRemainingMonths != null ||
    service?.serviceRemainingKm != null ||
    service?.serviceOverdue === true;
  if (serviceTracked) tracked.push('service');

  const missing: string[] = [];
  if (!tires || (tires.overallPercent == null && tires.actionState == null)) missing.push('tire');
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
  if (tires && (tires.overallPercent != null || tires.actionState != null)) out.push('Tires');
  if (brakes && brakes.stateClass !== 'NO_BASELINE') out.push('Brakes');
  if (battery) out.push('Battery');
  if (service) out.push('Service');
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

