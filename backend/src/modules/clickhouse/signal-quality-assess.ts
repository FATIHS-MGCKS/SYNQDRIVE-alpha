import type {
  HfWindowCoverage,
  HfWindowSummary,
  TripDetectorFeasibilityHint,
  TripSignalCoverageEntry,
  TripSignalQualityLevel,
  TripSignalQualityResult,
} from './clickhouse-hf.types';
import {
  assessDetectorFeasibility,
  type SignalAvailability,
} from '@modules/vehicle-intelligence/trips/hf-abuse';
import type { VehicleCapabilityProfile } from '@modules/vehicle-intelligence/vehicle-capabilities';

const COVERAGE_RANK: Record<HfWindowCoverage, number> = {
  good: 3,
  medium: 2,
  weak: 1,
  unavailable: 0,
  unknown: 0,
};

const QUALITY_RANK: Record<TripSignalQualityLevel, number> = {
  good: 3,
  medium: 2,
  weak: 1,
  unavailable: 0,
};

export interface AssessTripSignalQualityInput {
  windows: HfWindowSummary[];
  hfPointCount: number;
  capabilityProfile: VehicleCapabilityProfile;
  signalAvailability: SignalAvailability;
  degraded?: boolean;
  degradedReason?: string | null;
}

/**
 * Pure read-only trip signal quality assessment from HF windows + point counts.
 * Never writes scores — diagnostics/evidence only.
 */
export function assessTripSignalQuality(
  input: AssessTripSignalQualityInput,
): TripSignalQualityResult {
  const reasons: string[] = [];
  const { windows, hfPointCount, capabilityProfile, signalAvailability } = input;

  if (input.degraded) {
    reasons.push(
      input.degradedReason
        ? `ClickHouse degraded: ${input.degradedReason}`
        : 'ClickHouse unavailable — signal quality is best-effort.',
    );
  }

  if (hfPointCount === 0 && windows.length === 0) {
    reasons.push('No HF points or windows mirrored for this trip.');
    return {
      available: false,
      degraded: input.degraded ?? false,
      degradedReason: input.degradedReason ?? null,
      overallQuality: 'unavailable',
      hfAvailability: 'missing',
      signalCoverage: [],
      missingKeySignals: deriveMissingKeySignals(signalAvailability, capabilityProfile),
      detectorFeasibilityHints: buildDetectorHints(
        capabilityProfile,
        signalAvailability,
        true,
      ),
      windowCount: 0,
      hfPointCount: 0,
      reasons,
      internalDebug: true,
      readOnly: true,
    };
  }

  const signalCoverage = aggregateCoverage(windows);
  const speedWindows = windows.filter((w) => w.signalGroup === 'speed');
  const speedCoverage = speedWindows.map((w) => w.coverage ?? 'unavailable');
  const overallQuality = deriveOverallQuality(speedCoverage, hfPointCount, reasons);

  const hfAvailability = deriveHfAvailability(hfPointCount, overallQuality, reasons);

  const missingKeySignals = deriveMissingKeySignals(
    signalAvailability,
    capabilityProfile,
  );
  if (missingKeySignals.length > 0) {
    reasons.push(`Missing key HF signals: ${missingKeySignals.join(', ')}.`);
  }

  const snapshotOnly = capabilityProfile.snapshotOnly === true;
  const detectorFeasibilityHints = buildDetectorHints(
    capabilityProfile,
    signalAvailability,
    snapshotOnly,
  );

  const gapWindows = speedWindows.filter((w) => (w.missingGapCount ?? 0) > 0);
  if (gapWindows.length > 0) {
    reasons.push(
      `${gapWindows.length} speed window(s) contain gaps >3s between samples.`,
    );
  }

  if (overallQuality === 'good') {
    reasons.push('Speed stream coverage is dense across mirrored HF windows.');
  } else if (overallQuality === 'medium') {
    reasons.push('Speed stream is present but partially sparse in some windows.');
  } else if (overallQuality === 'weak') {
    reasons.push('HF windows exist but speed coverage is thin for reliable analysis.');
  }

  return {
    available: hfPointCount > 0 || windows.length > 0,
    degraded: input.degraded ?? false,
    degradedReason: input.degradedReason ?? null,
    overallQuality,
    hfAvailability,
    signalCoverage,
    missingKeySignals,
    detectorFeasibilityHints,
    windowCount: windows.length,
    hfPointCount,
    reasons,
    internalDebug: true,
    readOnly: true,
  };
}

function aggregateCoverage(windows: HfWindowSummary[]): TripSignalCoverageEntry[] {
  const byGroup = new Map<string, { pointCount: number; windowCount: number }>();
  for (const w of windows) {
    const key = w.signalGroup;
    const cur = byGroup.get(key) ?? { pointCount: 0, windowCount: 0 };
    cur.pointCount += w.pointCount;
    cur.windowCount += 1;
    byGroup.set(key, cur);
  }
  return [...byGroup.entries()]
    .map(([signalGroup, v]) => ({
      signalGroup,
      pointCount: v.pointCount,
      windowCount: v.windowCount,
    }))
    .sort((a, b) => a.signalGroup.localeCompare(b.signalGroup));
}

function deriveOverallQuality(
  speedCoverages: HfWindowCoverage[],
  hfPointCount: number,
  reasons: string[],
): TripSignalQualityLevel {
  if (hfPointCount === 0 && speedCoverages.length === 0) return 'unavailable';
  if (speedCoverages.length === 0) {
    reasons.push('No speed-group HF windows — cannot assess cadence quality.');
    return hfPointCount > 0 ? 'weak' : 'unavailable';
  }

  const minRank = Math.min(
    ...speedCoverages.map((c) => COVERAGE_RANK[c] ?? 0),
  );
  const avgRank =
    speedCoverages.reduce((sum, c) => sum + (COVERAGE_RANK[c] ?? 0), 0) /
    speedCoverages.length;

  if (minRank >= COVERAGE_RANK.good && avgRank >= 2.5) return 'good';
  if (avgRank >= COVERAGE_RANK.medium) return 'medium';
  if (avgRank >= COVERAGE_RANK.weak) return 'weak';
  return 'unavailable';
}

function deriveHfAvailability(
  hfPointCount: number,
  overallQuality: TripSignalQualityLevel,
  reasons: string[],
): TripSignalQualityResult['hfAvailability'] {
  if (hfPointCount === 0) return 'missing';
  if (QUALITY_RANK[overallQuality] >= QUALITY_RANK.good) return 'hf_available';
  if (QUALITY_RANK[overallQuality] >= QUALITY_RANK.weak) {
    reasons.push('HF points present but classified as sparse for this trip.');
    return 'sparse';
  }
  return 'unknown';
}

function deriveMissingKeySignals(
  signal: SignalAvailability,
  profile: VehicleCapabilityProfile,
): string[] {
  const missing: string[] = [];
  if (!signal.rpmAvailable && profile.engineSignalsAvailable) {
    missing.push('rpm');
  }
  if (!signal.throttleAvailable && profile.engineSignalsAvailable) {
    missing.push('throttle');
  }
  if (!signal.coolantAvailable && profile.engineSignalsAvailable) {
    missing.push('coolant');
  }
  if (!signal.loadAvailable && profile.engineSignalsAvailable) {
    missing.push('engineLoad');
  }
  return missing;
}

function buildDetectorHints(
  profile: VehicleCapabilityProfile,
  signal: SignalAvailability,
  snapshotOnly: boolean,
): TripDetectorFeasibilityHint[] {
  const feasibility = assessDetectorFeasibility({
    engineSignalsAvailable: profile.engineSignalsAvailable,
    snapshotOnly,
    signal,
  });

  return Object.entries(feasibility).map(([detector, f]) => ({
    detector,
    status: f.status,
    requiredSignals: f.requiredSignals,
    speedOnly: f.speedOnly,
  }));
}

/** Derive SignalAvailability from mirrored HF window stats (read-only). */
export function signalAvailabilityFromWindows(
  windows: HfWindowSummary[],
): SignalAvailability {
  let rpmAvailable = false;
  let throttleAvailable = false;
  let coolantAvailable = false;
  let loadAvailable = false;
  let tractionBatteryPowerAvailable = false;

  for (const w of windows) {
    const scalars = w.statsJson?.scalars;
    if (!scalars) continue;
    if ((scalars.rpm?.count ?? 0) > 0) rpmAvailable = true;
    if ((scalars.throttle?.count ?? 0) > 0) throttleAvailable = true;
    if ((scalars.engineLoad?.count ?? 0) > 0) loadAvailable = true;
    if ((scalars.tractionPowerKw?.count ?? 0) > 0) {
      tractionBatteryPowerAvailable = true;
    }
    if ((w.statsJson?.signalCounts?.powertrainCombustionEngineECT ?? 0) > 0) {
      coolantAvailable = true;
    }
  }

  return {
    rpmAvailable,
    throttleAvailable,
    coolantAvailable,
    loadAvailable,
    tractionBatteryPowerAvailable,
  };
}
