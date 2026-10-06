import { P25_APD_PROFILE_CLASSIFIER_V1 } from './p25-apd-policy-versions';
import {
  classifyP25ApdCadenceProfile,
  type P25ApdCadenceProfileClass,
} from './p25-apd-profile-classifier';
import type { P25ApdProfileInvalidationReason } from './p25-apd-profile-invalidation.types';

export type P25ApdProfileConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

export interface P25ApdProfileEvaluation {
  profileVersion: string;
  profileClass: P25ApdCadenceProfileClass;
  sampleCount: number;
  medianCadenceMs: number;
  cadenceP90Ms: number | null;
  phaseErrorP90Ms: number | null;
  confidence: P25ApdProfileConfidence;
  lastEvaluatedAtMs: number;
  invalidated: boolean;
  invalidationReason: P25ApdProfileInvalidationReason | null;
}

function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export interface EvaluateP25ApdProfileInput {
  nowMs: number;
  /** Strict-rest LV provider timestamps (ms), ascending. */
  lvProviderTimestampsMs: number[];
  providerGapOpen: boolean;
  tripActive: boolean;
  r9WakeRecent: boolean;
  deviceReconnectRecent: boolean;
  providerReconnectRecent: boolean;
  earlyAdvanceDetected: boolean;
  lateAdvanceDetected: boolean;
  phaseDriftDetected: boolean;
  capabilityChanged: boolean;
}

export function evaluateP25ApdProfile(
  input: EvaluateP25ApdProfileInput,
): P25ApdProfileEvaluation {
  const gapsSec: number[] = [];
  for (let i = 1; i < input.lvProviderTimestampsMs.length; i++) {
    const g = (input.lvProviderTimestampsMs[i]! - input.lvProviderTimestampsMs[i - 1]!) / 1000;
    if (g > 60) gapsSec.push(g);
  }

  const sampleCount = gapsSec.length;
  const sortedGaps = [...gapsSec].sort((a, b) => a - b);
  const medianSec = quantile(sortedGaps, 0.5) ?? 0;
  const medianCadenceMs = medianSec * 1000;
  const cadenceP90Ms = quantile(sortedGaps, 0.9) != null ? quantile(sortedGaps, 0.9)! * 1000 : null;

  let profileClass: P25ApdCadenceProfileClass;
  if (input.providerGapOpen && sampleCount < 5) {
    profileClass = 'PROVIDER_OBSERVABILITY_GAP';
  } else {
    profileClass = classifyP25ApdCadenceProfile(gapsSec, medianSec);
  }

  let invalidationReason: P25ApdProfileInvalidationReason | null = null;
  if (input.tripActive) invalidationReason = 'TRIP_ACTIVE';
  else if (input.r9WakeRecent) invalidationReason = 'R9_WAKE';
  else if (input.deviceReconnectRecent) invalidationReason = 'DEVICE_RECONNECT';
  else if (input.providerReconnectRecent) invalidationReason = 'PROVIDER_RECONNECT';
  else if (input.providerGapOpen) invalidationReason = 'PROVIDER_OBSERVABILITY_GAP';
  else if (input.earlyAdvanceDetected) invalidationReason = 'EARLY_SOURCE_ADVANCE';
  else if (input.lateAdvanceDetected) invalidationReason = 'LATE_SOURCE_ADVANCE';
  else if (input.phaseDriftDetected) invalidationReason = 'PHASE_DRIFT';
  else if (input.capabilityChanged) invalidationReason = 'CAPABILITY_CHANGE';
  else if (sampleCount < 5) invalidationReason = 'INSUFFICIENT_RECENT_EVIDENCE';

  const confidence: P25ApdProfileConfidence =
    sampleCount >= 12 && profileClass === 'STABLE_PERIODIC'
      ? 'HIGH'
      : sampleCount >= 5
        ? 'MEDIUM'
        : 'INSUFFICIENT';

  return {
    profileVersion: P25_APD_PROFILE_CLASSIFIER_V1,
    profileClass,
    sampleCount,
    medianCadenceMs,
    cadenceP90Ms,
    phaseErrorP90Ms: cadenceP90Ms,
    confidence,
    lastEvaluatedAtMs: input.nowMs,
    invalidated: invalidationReason != null,
    invalidationReason,
  };
}
