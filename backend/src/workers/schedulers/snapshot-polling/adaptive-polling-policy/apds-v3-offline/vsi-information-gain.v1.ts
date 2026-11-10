import type { ConsumerDemandEntry } from './consumer-demand-registry.v1';
import { listSnapshotBackedConsumers } from './consumer-demand-registry.v1';

export const APDS_V3_INFORMATION_GAIN_MODEL_VERSION =
  'APDS_V3_INFORMATION_GAIN_HEURISTIC_V1' as const;

export type VsiInformationGainInput = {
  decisionAtMs: number;
  lastLvProviderSourceMs: number | null;
  lastTopLevelProviderSourceMs: number | null;
  lastPhysicalPollMs: number | null;
  medianIntervalMs: number;
  profileStability: 'STABLE_PERIODIC' | 'UNSTABLE' | 'UNKNOWN';
  observationQuality: 'HIGH' | 'LOW' | 'UNKNOWN';
  p2cTopLevelAdvanceKnown: boolean;
};

export type VsiInformationGainEstimate = {
  modelVersion: typeof APDS_V3_INFORMATION_GAIN_MODEL_VERSION;
  /** 0..1 heuristic — never authoritative ground truth */
  expectedGain: number;
  heuristic: true;
  contradictoryEvidence: boolean;
  stalenessMs: number | null;
};

function lvStalenessMs(input: VsiInformationGainInput): number | null {
  if (input.lastLvProviderSourceMs == null) return null;
  return Math.max(0, input.decisionAtMs - input.lastLvProviderSourceMs);
}

/**
 * Evidence available only at or before decisionAtMs — no future leakage.
 */
export function estimateVsiInformationGain(
  input: VsiInformationGainInput,
): VsiInformationGainEstimate {
  const staleness = lvStalenessMs(input);
  const futureLeak =
    (input.lastLvProviderSourceMs != null &&
      input.lastLvProviderSourceMs > input.decisionAtMs) ||
    (input.lastTopLevelProviderSourceMs != null &&
      input.lastTopLevelProviderSourceMs > input.decisionAtMs);

  const contradictory =
    futureLeak ||
    (input.lastLvProviderSourceMs != null &&
      input.lastTopLevelProviderSourceMs != null &&
      input.lastTopLevelProviderSourceMs < input.lastLvProviderSourceMs);

  if (contradictory || input.observationQuality === 'UNKNOWN') {
    return {
      modelVersion: APDS_V3_INFORMATION_GAIN_MODEL_VERSION,
      expectedGain: 0,
      heuristic: true,
      contradictoryEvidence: true,
      stalenessMs: staleness,
    };
  }

  const med = input.medianIntervalMs > 0 ? input.medianIntervalMs : 600_000;
  const stalenessFactor =
    staleness == null ? 0.4 : Math.min(1, staleness / med);

  let gain = stalenessFactor;
  if (input.profileStability === 'STABLE_PERIODIC') {
    gain *= 0.85;
  }
  if (input.p2cTopLevelAdvanceKnown) {
    gain = Math.max(gain, 0.25);
  }
  if (input.observationQuality === 'LOW') {
    gain *= 0.5;
  }

  gain = Math.max(0, Math.min(1, gain));
  return {
    modelVersion: APDS_V3_INFORMATION_GAIN_MODEL_VERSION,
    expectedGain: gain,
    heuristic: true,
    contradictoryEvidence: false,
    stalenessMs: staleness,
  };
}

export function hardestUnmetSnapshotConsumer(
  consumers: ConsumerDemandEntry[],
  input: VsiInformationGainInput,
): ConsumerDemandEntry | null {
  const snapshot = consumers.length > 0 ? consumers : listSnapshotBackedConsumers();
  for (const c of snapshot) {
    if (!c.hardSafety) continue;
    if (c.freshness.kind === 'UNKNOWN') continue;
    const age = lvStalenessMs(input);
    if (age == null || age > c.freshness.maxAgeMs) return c;
  }
  return null;
}
