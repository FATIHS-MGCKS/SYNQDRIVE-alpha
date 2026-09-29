import type { DiV0R1ObdAcquisitionResult } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.types';

/** Count authorized R1 signals with VALUE_PRESENT across all buckets (frozen S4 PRESENT vs PRESENT_SPARSE). */
export function countDiV0R1UsableValues(result: DiV0R1ObdAcquisitionResult): number {
  let count = 0;
  for (const bucket of result.buckets) {
    for (const signal of bucket.signals) {
      if (signal.availability === 'VALUE_PRESENT') count += 1;
    }
  }
  return count;
}

export function resolveDiV0S4cR1ChannelOutcome(result: DiV0R1ObdAcquisitionResult): 'PRESENT' | 'PRESENT_SPARSE' {
  return countDiV0R1UsableValues(result) === 0 ? 'PRESENT_SPARSE' : 'PRESENT';
}
