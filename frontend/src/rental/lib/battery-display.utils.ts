import type {
  BatteryHealthStatus,
  BatteryHealthSummary,
  BatteryRestingVoltageStatus,
} from '../../lib/api';

const MIN_REASONABLE_LV_VOLTAGE = 6;
const MAX_REASONABLE_LV_VOLTAGE = 18;
const LOW_CRANKING_VOLTAGE_THRESHOLD = 9.6;

type BatteryVoltageKind = 'resting' | 'current' | 'unavailable';

export interface BatteryVoltageDisplay {
  kind: BatteryVoltageKind;
  valueV: number | null;
  source: 'lv-resting' | 'lv-telemetry-resting' | 'current-state-resting' | 'lv-telemetry-current' | 'current-state-current' | 'live-map-current' | null;
  status?: BatteryRestingVoltageStatus | null;
}

export function normalizeLvBatteryVoltage(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null;
  if (numeric == null || !Number.isFinite(numeric)) return null;
  if (numeric <= 0) return null;
  if (numeric < MIN_REASONABLE_LV_VOLTAGE || numeric > MAX_REASONABLE_LV_VOLTAGE) return null;
  return numeric;
}

export function formatBatteryVoltage(value: number, fractionDigits = 2): string {
  return `${value.toFixed(fractionDigits)} V`;
}

export function resolveOverviewBatteryVoltage(
  battery: BatteryHealthSummary | null | undefined,
  liveMapVoltage: number | null | undefined,
): BatteryVoltageDisplay {
  const canonicalResting = normalizeLvBatteryVoltage(battery?.lv?.restingVoltage?.valueV);
  if (canonicalResting != null) {
    return {
      kind: 'resting',
      valueV: canonicalResting,
      source: 'lv-resting',
      status: battery?.lv?.restingVoltage?.status ?? null,
    };
  }

  const telemetryResting = normalizeLvBatteryVoltage(battery?.lv?.telemetry?.restingVoltage);
  if (telemetryResting != null) {
    return {
      kind: 'resting',
      valueV: telemetryResting,
      source: 'lv-telemetry-resting',
      status: battery?.lv?.restingVoltage?.status ?? null,
    };
  }

  const currentStateResting = normalizeLvBatteryVoltage(battery?.currentState?.restingVoltage);
  if (currentStateResting != null) {
    return {
      kind: 'resting',
      valueV: currentStateResting,
      source: 'current-state-resting',
      status: battery?.lv?.restingVoltage?.status ?? null,
    };
  }

  const telemetryCurrent = normalizeLvBatteryVoltage(battery?.lv?.telemetry?.voltageV);
  if (telemetryCurrent != null) {
    return { kind: 'current', valueV: telemetryCurrent, source: 'lv-telemetry-current' };
  }

  const currentStateCurrent = normalizeLvBatteryVoltage(battery?.currentState?.voltageV);
  if (currentStateCurrent != null) {
    return { kind: 'current', valueV: currentStateCurrent, source: 'current-state-current' };
  }

  const liveCurrent = normalizeLvBatteryVoltage(liveMapVoltage);
  if (liveCurrent != null) {
    return { kind: 'current', valueV: liveCurrent, source: 'live-map-current' };
  }

  return { kind: 'unavailable', valueV: null, source: null };
}

function normalizedStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

export function isLowRestingVoltageStatus(status: BatteryRestingVoltageStatus | string | null | undefined): boolean {
  return ['warning', 'critical', 'low', 'attention'].includes(normalizedStatus(status));
}

export function isCriticalRestingVoltageStatus(status: BatteryRestingVoltageStatus | string | null | undefined): boolean {
  return ['critical', 'low', 'attention'].includes(normalizedStatus(status));
}

export function isLowCrankingVoltage(value: unknown): boolean {
  const voltage = normalizeLvBatteryVoltage(value);
  return voltage != null && voltage <= LOW_CRANKING_VOLTAGE_THRESHOLD;
}

const START_PROBLEM_PATTERN =
  /(startschwier|startproblem|starthilfe|starten|cranking|crank|jump\s?-?start|low[\s-]?voltage|niedrige\s+spannung|unterspannung)/i;

export function hasBatteryStartRecommendationEvidence(
  battery: BatteryHealthSummary | null | undefined,
): boolean {
  return [...(battery?.watchpoints ?? []), ...(battery?.recommendations ?? [])].some((entry) =>
    START_PROBLEM_PATTERN.test(entry),
  );
}

export function hasBatteryCrankingEvidence(battery: BatteryHealthSummary | null | undefined): boolean {
  return (
    isLowCrankingVoltage(battery?.lv?.telemetry?.crankingVoltage) ||
    isLowCrankingVoltage(battery?.currentState?.crankingVoltage)
  );
}

export function hasBatteryStartProblemEvidence(
  battery: BatteryHealthSummary | null | undefined,
): boolean {
  return (
    isLowRestingVoltageStatus(battery?.lv?.restingVoltage?.status) ||
    hasBatteryCrankingEvidence(battery) ||
    hasBatteryStartRecommendationEvidence(battery)
  );
}

export function estimatedBatteryHealthStatus(
  battery: BatteryHealthSummary | null | undefined,
): BatteryHealthStatus | null {
  return battery?.lv?.estimatedHealth?.status ?? null;
}

export function isEstimatedBatteryHealthWatch(
  battery: BatteryHealthSummary | null | undefined,
): boolean {
  return normalizedStatus(estimatedBatteryHealthStatus(battery)) === 'watch';
}

export function isEstimatedBatteryHealthSevere(
  battery: BatteryHealthSummary | null | undefined,
): boolean {
  return ['warning', 'critical'].includes(normalizedStatus(estimatedBatteryHealthStatus(battery)));
}

export function restingVoltageStatusLabel(status: BatteryRestingVoltageStatus | string | null | undefined): string {
  switch (normalizedStatus(status)) {
    case 'good':
      return 'Ruhespannung gut';
    case 'watch':
      return 'Ruhespannung beobachten';
    case 'warning':
      return 'Ruhespannung niedrig';
    case 'critical':
    case 'low':
    case 'attention':
      return 'Ruhespannung kritisch';
    case 'unsupported':
      return 'Ruhespannung nicht bewertet';
    default:
      return 'Ruhespannung';
  }
}

export function estimatedBatteryHealthLabel(
  battery: BatteryHealthSummary | null | undefined,
): string | null {
  switch (normalizedStatus(estimatedBatteryHealthStatus(battery))) {
    case 'watch':
      return 'Geschätzte Batteriegesundheit beobachten';
    case 'warning':
      return 'Geschätzte Batteriegesundheit niedrig';
    case 'critical':
      return 'Geschätzte Batteriegesundheit kritisch';
    default:
      return null;
  }
}

