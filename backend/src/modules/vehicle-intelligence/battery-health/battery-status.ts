/**
 * Battery status classification — the single rule set shared by every
 * consumer (CanonicalBatteryHealthService, BatteryCriticalDetector, …).
 *
 * These are pure functions with no I/O so there is exactly ONE definition
 * of the LV / HV thresholds, the resting-voltage bands and the aggregation
 * order.  Nothing else in the codebase is allowed to invent its own battery
 * thresholds — it must call into here.
 *
 * Conceptual split (V4.8 Battery overhaul):
 *   LV (12 V auxiliary)
 *     · estimatedHealth  → behaviour-derived score (rest voltage / crank
 *       drop / recovery / stability) from the Battery V2 publication
 *       pipeline. Displayed as a 3-bar indicator, NOT a workshop SOH %.
 *     · restingVoltage   → battery-spec aware voltage band (lead-acid / AGM /
 *       EFB / lithium). Reflects the current charge / rest state.
 *     · aggregate         → worst of the two available signals.
 *   HV (traction battery)
 *     · sohPct           → real state-of-health %. Only ever from provider,
 *       capacity/energy measurement or a workshop/document report. There is
 *       no age/km fallback model anymore.
 */

export type BatteryHealthStatus = 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type RestingVoltageStatus = BatteryHealthStatus | 'UNSUPPORTED';
export type LvAggregateStatus = BatteryHealthStatus | 'UNSUPPORTED';

export type NormalizedBatteryType = 'LEAD_ACID' | 'AGM' | 'EFB' | 'LITHIUM' | 'UNKNOWN';

/** Legacy three-state condition kept for backward-compatible consumers. */
export type BatteryLegacyCondition = 'good' | 'watch' | 'attention' | 'unknown';

export type RestingThresholdSource = 'BATTERY_SPEC' | 'DEFAULT' | 'UNSUPPORTED';

export interface RestingVoltageClassification {
  status: RestingVoltageStatus;
  thresholdSource: RestingThresholdSource;
  batteryType: NormalizedBatteryType;
}

/** Minimal shape for ranking `VehicleBatterySpec` rows. */
export interface VehicleBatterySpecCandidate {
  batteryType: string | null;
  batteryVolt: number | null;
  sourceConfidence?: number | null;
  createdAt?: Date | string | null;
}

export interface ClassifyRestingVoltageOptions {
  /** True when a usable `VehicleBatterySpec` supplied the battery type. */
  specProvided?: boolean;
}

interface RestingVoltageThresholds {
  /** >= good → GOOD */
  good: number;
  /** >= watch → WATCH */
  watch: number;
  /** >= warning → WARNING, otherwise CRITICAL */
  warning: number;
}

// Lead-acid / EFB / generic 12 V flooded cells.
const DEFAULT_RESTING_THRESHOLDS: RestingVoltageThresholds = {
  good: 12.5,
  watch: 12.2,
  warning: 12.0,
};

// AGM cells rest slightly higher than flooded lead-acid.
const AGM_RESTING_THRESHOLDS: RestingVoltageThresholds = {
  good: 12.6,
  watch: 12.3,
  warning: 12.1,
};

/**
 * Normalise the free-text `VehicleBatterySpec.batteryType` (operators type
 * "AGM", "EFB", "Lead-Acid", "Lithium", …) into a known chemistry bucket.
 */
export function normalizeBatteryType(raw: string | null | undefined): NormalizedBatteryType {
  if (!raw) return 'UNKNOWN';
  const v = raw.trim().toUpperCase();
  if (v === '') return 'UNKNOWN';
  if (/(LITHIUM|LIFEPO|LFP|LI-ION|LIION|LI ION)/.test(v)) return 'LITHIUM';
  if (/AGM/.test(v)) return 'AGM';
  if (/EFB/.test(v)) return 'EFB';
  if (/(LEAD|BLEI|FLOODED|SLI|GEL|VRLA)/.test(v)) return 'LEAD_ACID';
  return 'UNKNOWN';
}

/**
 * LV "Estimated Battery Health" status from the V2 published / stabilized
 * behaviour score. This is NOT a workshop SOH — it is a behaviour estimate.
 *   80–100 → GOOD · 60–79 → WATCH · 40–59 → WARNING · 0–39 → CRITICAL
 */
export function classifyLvEstimatedHealth(scorePct: number | null | undefined): BatteryHealthStatus {
  if (scorePct == null || !Number.isFinite(scorePct)) return 'UNKNOWN';
  if (scorePct >= 80) return 'GOOD';
  if (scorePct >= 60) return 'WATCH';
  if (scorePct >= 40) return 'WARNING';
  return 'CRITICAL';
}

/** Map a battery-health status to the 3-bar indicator (0 = unknown). */
export function statusToBars(status: BatteryHealthStatus | LvAggregateStatus): 0 | 1 | 2 | 3 {
  switch (status) {
    case 'GOOD':
      return 3;
    case 'WATCH':
      return 2;
    case 'WARNING':
      return 1;
    case 'CRITICAL':
      return 1;
    default:
      return 0;
  }
}

/**
 * Resting-voltage status. Only a genuine resting / open-circuit voltage must
 * be passed in — never a charging voltage measured while driving.
 *
 * Lithium packs are not evaluated with lead-acid resting-voltage bands; when
 * no explicit lithium thresholds exist the status is UNSUPPORTED so no false
 * lead-acid alert is produced.
 */
function specCreatedAtMs(spec: VehicleBatterySpecCandidate): number {
  if (!spec.createdAt) return 0;
  const d =
    spec.createdAt instanceof Date ? spec.createdAt : new Date(spec.createdAt);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function isCompleteBatterySpec(spec: VehicleBatterySpecCandidate): boolean {
  const type = normalizeBatteryType(spec.batteryType);
  const hasVolt = spec.batteryVolt != null && Number.isFinite(spec.batteryVolt);
  return type !== 'UNKNOWN' && hasVolt;
}

function isPlausibleLvVolt(volt: number | null | undefined): boolean {
  if (volt == null || !Number.isFinite(volt)) return false;
  return Math.abs(volt - 12) <= 2;
}

function hasKnownBatteryType(spec: VehicleBatterySpecCandidate): boolean {
  return normalizeBatteryType(spec.batteryType) !== 'UNKNOWN';
}

/**
 * Pick the best available `VehicleBatterySpec` for a vehicle.
 * Ranking: completeness (type+volt) → sourceConfidence → plausible 12 V volt →
 * known type → newest on tie. Returns null when nothing usable exists.
 */
export function selectBestBatterySpec<T extends VehicleBatterySpecCandidate>(
  specs: T[] | null | undefined,
): T | null {
  if (!specs?.length) return null;

  const ranked = [...specs].sort((a, b) => {
    const aComplete = isCompleteBatterySpec(a) ? 1 : 0;
    const bComplete = isCompleteBatterySpec(b) ? 1 : 0;
    if (bComplete !== aComplete) return bComplete - aComplete;

    const aConf = a.sourceConfidence ?? 0;
    const bConf = b.sourceConfidence ?? 0;
    if (bConf !== aConf) return bConf - aConf;

    const aPlausible = isPlausibleLvVolt(a.batteryVolt) ? 1 : 0;
    const bPlausible = isPlausibleLvVolt(b.batteryVolt) ? 1 : 0;
    if (bPlausible !== aPlausible) return bPlausible - aPlausible;

    const aType = hasKnownBatteryType(a) ? 1 : 0;
    const bType = hasKnownBatteryType(b) ? 1 : 0;
    if (bType !== aType) return bType - aType;

    return specCreatedAtMs(b) - specCreatedAtMs(a);
  });

  const best = ranked[0];
  if (!best) return null;

  if (
    !hasKnownBatteryType(best) &&
    !isPlausibleLvVolt(best.batteryVolt) &&
    !isCompleteBatterySpec(best)
  ) {
    return null;
  }

  return best;
}

/** True when resting-voltage bands should be attributed to a vehicle battery spec. */
export function specUsedForRestingThresholds(
  spec: VehicleBatterySpecCandidate | null | undefined,
): boolean {
  if (!spec) return false;
  return normalizeBatteryType(spec.batteryType) !== 'UNKNOWN';
}

export function classifyRestingVoltage(
  voltageV: number | null | undefined,
  batteryTypeRaw: string | null | undefined,
  options?: ClassifyRestingVoltageOptions,
): RestingVoltageClassification {
  const batteryType = normalizeBatteryType(batteryTypeRaw);
  const specProvided = options?.specProvided ?? false;

  if (batteryType === 'LITHIUM') {
    return { status: 'UNSUPPORTED', thresholdSource: 'UNSUPPORTED', batteryType };
  }

  const thresholdSource: RestingThresholdSource =
    specProvided && batteryType !== 'UNKNOWN' ? 'BATTERY_SPEC' : 'DEFAULT';

  if (voltageV == null || !Number.isFinite(voltageV)) {
    return { status: 'UNKNOWN', thresholdSource, batteryType };
  }

  const t = batteryType === 'AGM' ? AGM_RESTING_THRESHOLDS : DEFAULT_RESTING_THRESHOLDS;
  let status: RestingVoltageStatus;
  if (voltageV >= t.good) status = 'GOOD';
  else if (voltageV >= t.watch) status = 'WATCH';
  else if (voltageV >= t.warning) status = 'WARNING';
  else status = 'CRITICAL';

  return { status, thresholdSource, batteryType };
}

/**
 * HV traction-battery SOH status. Different (more lenient) bands than LV —
 * the two must never share thresholds.
 *   >= 80 → GOOD · 70–79 → WATCH · 60–69 → WARNING · < 60 → CRITICAL
 */
export function classifyHvSoh(sohPct: number | null | undefined): BatteryHealthStatus {
  if (sohPct == null || !Number.isFinite(sohPct)) return 'UNKNOWN';
  if (sohPct >= 80) return 'GOOD';
  if (sohPct >= 70) return 'WATCH';
  if (sohPct >= 60) return 'WARNING';
  return 'CRITICAL';
}

const STATUS_RANK: Record<BatteryHealthStatus, number> = {
  GOOD: 1,
  WATCH: 2,
  WARNING: 3,
  CRITICAL: 4,
  UNKNOWN: 0,
};

/**
 * Aggregate the available LV signals into one status.
 *   · CRITICAL always wins
 *   · WARNING beats WATCH, WATCH beats GOOD
 *   · UNKNOWN / UNSUPPORTED signals are ignored
 *   · result is UNKNOWN only when no usable signal exists at all
 */
export function aggregateLvStatus(
  ...statuses: Array<RestingVoltageStatus | BatteryHealthStatus | null | undefined>
): LvAggregateStatus {
  let worst: BatteryHealthStatus | null = null;
  for (const s of statuses) {
    if (s == null) continue;
    if (s === 'UNKNOWN' || s === 'UNSUPPORTED') continue;
    if (worst == null || STATUS_RANK[s] > STATUS_RANK[worst]) {
      worst = s;
    }
  }
  return worst ?? 'UNKNOWN';
}

/** Map the GOOD/WATCH/WARNING/CRITICAL scale to the legacy condition triplet. */
export function statusToLegacyCondition(
  status: RestingVoltageStatus | BatteryHealthStatus | LvAggregateStatus,
): BatteryLegacyCondition {
  switch (status) {
    case 'GOOD':
      return 'good';
    case 'WATCH':
      return 'watch';
    case 'WARNING':
    case 'CRITICAL':
      return 'attention';
    default:
      return 'unknown';
  }
}

/** True when the status warrants a vehicle alert (WATCH never alerts). */
export function isAlertableStatus(status: RestingVoltageStatus | BatteryHealthStatus): boolean {
  return status === 'WARNING' || status === 'CRITICAL';
}

/**
 * Crank-drop quality. A healthy 12 V battery recovers the starter load with a
 * small voltage dip; a large drop signals a weak/aged battery.
 *   < 1.5 V → GOOD · 1.5–1.99 → WATCH · 2.0–2.49 → WARNING · >= 2.5 → CRITICAL
 */
export function classifyCrankDrop(crankDropV: number | null | undefined): BatteryHealthStatus {
  if (crankDropV == null || !Number.isFinite(crankDropV) || crankDropV < 0) return 'UNKNOWN';
  if (crankDropV < 1.5) return 'GOOD';
  if (crankDropV < 2.0) return 'WATCH';
  if (crankDropV < 2.5) return 'WARNING';
  return 'CRITICAL';
}
