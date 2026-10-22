import { parseBucketLabelMs } from '../core/kinematics/motion-core-grid';
import type { TemporalConfidence } from '../core/types';

export type R1ObdFsmPointAuthorityResolution = {
  fsmPointAuthority: boolean;
  /** Provider measurement instant when point-level time authority exists; never the 1 Hz bucket label. */
  measurementTimeUtc: string | null;
  temporalConfidence: TemporalConfidence;
  /** Why point authority was denied when applicable. */
  denialReason: string | null;
};

function parseProviderMeasurementMs(instant: string): number | null {
  const ms = Date.parse(instant);
  return Number.isFinite(ms) ? ms : null;
}

/** Measurement instant must fall inside the bucket's [start, start+1s) window (not string equality to label). */
export function providerMeasurementAlignsWithBucketSecond(
  bucketLabelUtc: string,
  measurementInstantUtc: string,
): boolean {
  const bucketMs = parseBucketLabelMs(bucketLabelUtc);
  const instantMs = parseProviderMeasurementMs(measurementInstantUtc);
  if (instantMs == null) {
    return false;
  }
  return instantMs >= bucketMs && instantMs < bucketMs + 1000;
}

/**
 * Motion FSM may treat sparse speed as DIRECT only with point-level time authority.
 *
 * **R1 V0_3 pinned snapshots:** `temporalConfidence === 'INTERVAL_ONLY'` — bucket labels are
 * aggregation grid alignment only; no provider measurement instant is carried in the pin.
 */
export function resolveR1ObdFsmPointAuthority(
  obs: {
    temporalConfidence: TemporalConfidence;
    bucketLabel: string;
    providerMeasurementInstantUtc?: string | null;
  },
): R1ObdFsmPointAuthorityResolution {
  if (obs.temporalConfidence !== 'EXACT_PROVEN') {
    return {
      fsmPointAuthority: false,
      measurementTimeUtc: null,
      temporalConfidence: obs.temporalConfidence,
      denialReason:
        obs.temporalConfidence === 'INTERVAL_ONLY'
          ? 'R1_INTERVAL_ONLY_BUCKET_NOT_MEASUREMENT_INSTANT'
          : 'TEMPORAL_CONFIDENCE_NOT_EXACT_PROVEN',
    };
  }
  const instant = obs.providerMeasurementInstantUtc ?? null;
  if (instant == null || instant.length === 0) {
    return {
      fsmPointAuthority: false,
      measurementTimeUtc: null,
      temporalConfidence: obs.temporalConfidence,
      denialReason: 'MISSING_PROVIDER_MEASUREMENT_INSTANT',
    };
  }
  if (instant === obs.bucketLabel) {
    return {
      fsmPointAuthority: false,
      measurementTimeUtc: null,
      temporalConfidence: obs.temporalConfidence,
      denialReason: 'BUCKET_LABEL_USED_AS_MEASUREMENT_INSTANT',
    };
  }
  if (!providerMeasurementAlignsWithBucketSecond(obs.bucketLabel, instant)) {
    return {
      fsmPointAuthority: false,
      measurementTimeUtc: null,
      temporalConfidence: obs.temporalConfidence,
      denialReason: 'MEASUREMENT_INSTANT_OUTSIDE_BUCKET_SECOND',
    };
  }
  return {
    fsmPointAuthority: true,
    measurementTimeUtc: instant,
    temporalConfidence: obs.temporalConfidence,
    denialReason: null,
  };
}
