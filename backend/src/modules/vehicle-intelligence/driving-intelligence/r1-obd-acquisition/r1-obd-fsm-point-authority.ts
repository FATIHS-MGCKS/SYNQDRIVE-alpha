import type { TemporalConfidence } from '../core/types';

export type R1ObdFsmPointAuthorityResolution = {
  fsmPointAuthority: boolean;
  /** Provider measurement instant when point-level time authority exists; never the 1 Hz bucket label. */
  measurementTimeUtc: string | null;
  temporalConfidence: TemporalConfidence;
};

/**
 * Motion FSM may treat sparse speed as DIRECT only with point-level time authority.
 * R1 V0_3 pinned snapshots are INTERVAL_ONLY — aggregation bucket labels are not measurement instants.
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
    };
  }
  const instant = obs.providerMeasurementInstantUtc ?? null;
  if (instant == null || instant.length === 0 || instant === obs.bucketLabel) {
    return {
      fsmPointAuthority: false,
      measurementTimeUtc: null,
      temporalConfidence: obs.temporalConfidence,
    };
  }
  return {
    fsmPointAuthority: true,
    measurementTimeUtc: instant,
    temporalConfidence: obs.temporalConfidence,
  };
}
