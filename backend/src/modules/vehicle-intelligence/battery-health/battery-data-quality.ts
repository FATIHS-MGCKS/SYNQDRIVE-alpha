import type { LegacyCrankPresentation } from './battery-crank-policy';
import { START_DIP_PROXY_MEASUREMENT_KIND } from './battery-crank-policy';
import type { LegacyHvCapacityPresentation } from './hv-capacity-policy';
import type { LegacyPublicationSafetyResult } from './battery-legacy-publication-safety';

export interface BatteryFreshnessInput {
  observedAt: string | null;
  ageMs: number | null;
  isFresh: boolean;
}

export type HvSohSourceInput = 'PROVIDER' | 'CAPACITY_ESTIMATE' | 'DOCUMENT' | 'MANUAL';

export const BATTERY_DATA_QUALITY_STATUSES = [
  'VERIFIED',
  'ESTIMATED',
  'PROXY',
  'EXPERIMENTAL',
  'STALE',
  'MISSED',
  'UNAVAILABLE',
  'UNSUPPORTED',
  'LEGACY_UNVERIFIED',
] as const;

export type BatteryDataQualityStatus = (typeof BATTERY_DATA_QUALITY_STATUSES)[number];

export const BATTERY_DATA_QUALITY_LABEL_KEY_PREFIX = 'health.battery.dataQuality';

export interface BatteryDataQualityPresentation {
  status: BatteryDataQualityStatus;
  labelKey: string;
  decisionCapable: boolean;
  observedAt: string | null;
}

const DECISION_CAPABLE_STATUSES = new Set<BatteryDataQualityStatus>([
  'VERIFIED',
  'ESTIMATED',
]);

const TRUST_RANK: Record<BatteryDataQualityStatus, number> = {
  VERIFIED: 0,
  ESTIMATED: 1,
  PROXY: 2,
  EXPERIMENTAL: 3,
  STALE: 4,
  MISSED: 5,
  UNAVAILABLE: 6,
  UNSUPPORTED: 7,
  LEGACY_UNVERIFIED: 8,
};

export function batteryDataQualityLabelKey(status: BatteryDataQualityStatus): string {
  return `${BATTERY_DATA_QUALITY_LABEL_KEY_PREFIX}.${status}`;
}

export function normalizeBatteryDataQualityStatus(
  input: unknown,
): BatteryDataQualityStatus | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toUpperCase();
  if ((BATTERY_DATA_QUALITY_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as BatteryDataQualityStatus;
  }
  return null;
}

export function isBatteryDataQualityDecisionCapable(
  status: BatteryDataQualityStatus,
): boolean {
  return DECISION_CAPABLE_STATUSES.has(status);
}

export function presentBatteryDataQuality(
  status: BatteryDataQualityStatus,
  observedAt?: string | Date | null,
): BatteryDataQualityPresentation {
  const observed =
    observedAt instanceof Date
      ? observedAt.toISOString()
      : observedAt ?? null;
  return {
    status,
    labelKey: batteryDataQualityLabelKey(status),
    decisionCapable: isBatteryDataQualityDecisionCapable(status),
    observedAt: observed,
  };
}

export function aggregateBatteryDataQuality(
  statuses: Array<BatteryDataQualityStatus | null | undefined>,
): BatteryDataQualityStatus {
  const present = statuses.filter(
    (s): s is BatteryDataQualityStatus => s != null,
  );
  if (present.length === 0) return 'UNAVAILABLE';
  return present.reduce((worst, current) =>
    TRUST_RANK[current] > TRUST_RANK[worst] ? current : worst,
  );
}

function hasFreshnessValue(
  freshness: Pick<BatteryFreshnessInput, 'observedAt' | 'isFresh'>,
  hasValue: boolean,
): boolean {
  return hasValue && freshness.observedAt != null;
}

function staleFromObservedValue(
  freshness: Pick<BatteryFreshnessInput, 'isFresh'>,
  hasValue: boolean,
): boolean {
  return hasValue && !freshness.isFresh;
}

export function resolveLvEstimatedHealthDataQuality(input: {
  runtimeStatus: string;
  hasScore: boolean;
  freshness: BatteryFreshnessInput;
  legacyPublicationSafety: LegacyPublicationSafetyResult;
  isCalibrating: boolean;
  isStabilizing: boolean;
}): BatteryDataQualityStatus {
  if (!input.legacyPublicationSafety.decisionCapable) {
    return 'LEGACY_UNVERIFIED';
  }
  if (input.runtimeStatus === 'unsupported') return 'UNSUPPORTED';
  if (!input.hasScore) {
    if (
      input.isCalibrating ||
      input.runtimeStatus === 'calibrating' ||
      input.runtimeStatus === 'stabilizing'
    ) {
      return input.isStabilizing ? 'MISSED' : 'EXPERIMENTAL';
    }
    if (input.runtimeStatus === 'no_recent_data') return 'MISSED';
    return 'UNAVAILABLE';
  }
  if (staleFromObservedValue(input.freshness, hasFreshnessValue(input.freshness, true))) {
    return 'STALE';
  }
  if (input.isCalibrating || input.isStabilizing) return 'EXPERIMENTAL';
  return 'ESTIMATED';
}

export function resolveRestingVoltageDataQuality(input: {
  valueV: number | null;
  restingStatus: string;
  freshness: BatteryFreshnessInput;
  runtimeStatus: string;
  isCalibrating: boolean;
}): BatteryDataQualityStatus {
  if (input.restingStatus === 'UNSUPPORTED') return 'UNSUPPORTED';
  if (input.valueV == null) {
    if (input.isCalibrating || input.runtimeStatus === 'calibrating') {
      return 'EXPERIMENTAL';
    }
    if (
      input.runtimeStatus === 'no_recent_data' ||
      input.runtimeStatus === 'stabilizing'
    ) {
      return 'MISSED';
    }
    return 'UNAVAILABLE';
  }
  if (staleFromObservedValue(input.freshness, true)) return 'STALE';
  return 'VERIFIED';
}

export function resolveHvSohDataQuality(input: {
  isEv: boolean;
  sohSource: HvSohSourceInput | null;
  hasSoh: boolean;
  freshness: BatteryFreshnessInput;
  runtimeStatus: string;
  legacyCapacity?: Pick<LegacyHvCapacityPresentation, 'displayMode'> | null;
}): BatteryDataQualityStatus {
  if (!input.isEv) return 'UNSUPPORTED';
  if (!input.hasSoh) {
    if (
      input.legacyCapacity?.displayMode === 'LEGACY_UNVERIFIED' &&
      input.runtimeStatus !== 'estimate_unavailable'
    ) {
      return 'LEGACY_UNVERIFIED';
    }
    if (input.runtimeStatus === 'no_recent_data') return 'MISSED';
    return 'UNAVAILABLE';
  }
  if (staleFromObservedValue(input.freshness, hasFreshnessValue(input.freshness, true))) {
    return 'STALE';
  }
  if (
    input.sohSource === 'PROVIDER' ||
    input.sohSource === 'DOCUMENT' ||
    input.sohSource === 'MANUAL'
  ) {
    return 'VERIFIED';
  }
  if (input.sohSource === 'CAPACITY_ESTIMATE') return 'ESTIMATED';
  return 'UNAVAILABLE';
}

export function resolveCrankDataQuality(
  crank: LegacyCrankPresentation | null | undefined,
): BatteryDataQualityStatus {
  if (!crank) return 'UNAVAILABLE';
  if (crank.measurementKind === START_DIP_PROXY_MEASUREMENT_KIND) {
    return crank.diagnosticCrankDrop != null ? 'PROXY' : 'UNAVAILABLE';
  }
  if (crank.displayMode === 'LEGACY_UNVERIFIED') {
    return crank.diagnosticCrankDrop != null ? 'LEGACY_UNVERIFIED' : 'UNAVAILABLE';
  }
  if (crank.decisionCapable) return 'ESTIMATED';
  return 'UNAVAILABLE';
}

export function resolveHvLegacyCapacityDataQuality(
  legacyCapacity: LegacyHvCapacityPresentation | null | undefined,
): BatteryDataQualityStatus {
  if (!legacyCapacity) return 'UNAVAILABLE';
  if (legacyCapacity.displayMode === 'LEGACY_UNVERIFIED') {
    const hasDiagnostic =
      legacyCapacity.diagnosticEstimatedCapacityKwh != null ||
      legacyCapacity.diagnosticSohPercent != null;
    return hasDiagnostic ? 'LEGACY_UNVERIFIED' : 'UNAVAILABLE';
  }
  if (legacyCapacity.decisionCapable) return 'ESTIMATED';
  return 'UNAVAILABLE';
}

export interface BatteryDataQualitySlices {
  lvEstimatedHealth: BatteryDataQualityStatus;
  lvRestingVoltage: BatteryDataQualityStatus;
  lvCrank: BatteryDataQualityStatus;
  hvSoh: BatteryDataQualityStatus;
  hvLegacyCapacity: BatteryDataQualityStatus;
}

export function buildBatteryDataQualitySlices(input: {
  lvEstimatedHealth: BatteryDataQualityStatus;
  lvRestingVoltage: BatteryDataQualityStatus;
  lvCrank: BatteryDataQualityStatus;
  hvSoh: BatteryDataQualityStatus;
  hvLegacyCapacity: BatteryDataQualityStatus;
  isEv: boolean;
}): BatteryDataQualitySlices & { aggregate: BatteryDataQualityStatus } {
  const slices: BatteryDataQualitySlices = {
    lvEstimatedHealth: input.lvEstimatedHealth,
    lvRestingVoltage: input.lvRestingVoltage,
    lvCrank: input.lvCrank,
    hvSoh: input.hvSoh,
    hvLegacyCapacity: input.hvLegacyCapacity,
  };
  const aggregateStatuses = [
    input.lvEstimatedHealth,
    input.lvRestingVoltage,
    input.isEv ? input.hvSoh : null,
  ];
  return {
    ...slices,
    aggregate: aggregateBatteryDataQuality(aggregateStatuses),
  };
}
