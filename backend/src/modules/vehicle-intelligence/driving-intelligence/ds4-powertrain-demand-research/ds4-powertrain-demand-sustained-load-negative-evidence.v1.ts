import type { Ds4SustainedLoadTripEvidenceClassificationV1 } from './ds4-powertrain-demand-research.contract.v1';
import type { Ds4CanonicalMultichannelBucketV1 } from './ds4-powertrain-demand-multichannel-canonicalize.v1';
import { DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY } from './ds4-powertrain-demand-sustained-load-reference.v1';

/** Longest contiguous run of load-labelled buckets (label adjacency, not physical duration). */
export function computeLongestLoadPresentRunLabelCount(
  buckets: readonly Ds4CanonicalMultichannelBucketV1[],
): number {
  const sorted = [...buckets].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  let longest = 0;
  let current = 0;
  for (const bucket of sorted) {
    if (bucket.loadPct != null) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Negative NOT_OBSERVED requires a contiguous load-channel window at least the research admission floor.
 * Sparse or fragmented load labels cannot support an absence conclusion and map to INSUFFICIENT_OBSERVATIONS.
 * Empirical coverage ratio thresholds remain unresolved research debt (see DBI_P2C4_W1).
 */
export function classifySustainedLoadNegativeEvidence(input: {
  readonly entryLabelCount: number;
  readonly loadPresentBucketCount: number;
  readonly longestLoadPresentRunLabelCount: number;
}): Ds4SustainedLoadTripEvidenceClassificationV1 {
  if (input.loadPresentBucketCount === 0) {
    return 'NOT_OBSERVED';
  }
  if (input.longestLoadPresentRunLabelCount < DS4_SUSTAINED_LOAD_GAP_AWARE_POLICY.minObservations) {
    return 'INSUFFICIENT_OBSERVATIONS';
  }
  if (input.entryLabelCount === 0) {
    return 'NOT_OBSERVED';
  }
  return 'INSUFFICIENT_OBSERVATIONS';
}
