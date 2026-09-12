import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate/raw-refuel-candidate.types';
import type { RawRefuelCandidateRejectionReason } from '@prisma/client';
import type { RawFuelRiseDetectionContext } from './raw-fuel-signal-sample.types';

export type RawFuelRiseDetectorFailureReason =
  | 'conflicting_duplicate_timestamp'
  | 'invalid_sample'
  | 'no_trusted_channel'
  | 'insufficient_channel_samples';

export interface RawFuelRiseHeldOrRejected {
  reason: RawRefuelCandidateRejectionReason | RawFuelRiseDetectorFailureReason;
  lifecycleState: 'INSUFFICIENT' | 'REJECTED' | 'SETTLING';
  detail?: string;
  channel?: 'ABSOLUTE_LITERS' | 'RELATIVE_PERCENT';
}

export interface RawFuelRiseDetectionDiagnostics {
  primaryChannel: 'ABSOLUTE_LITERS' | 'RELATIVE_PERCENT' | null;
  normalizedSampleCount: number;
  channelSampleCount: number;
  scanWindowStart: string;
  scanWindowEnd: string;
  /** Future metric contract — not wired in F3 runtime. */
  metricsContract: {
    rawRefuelScanRunsTotal: 1;
    rawRefuelRiseDetectedTotal: number;
    rawRefuelCandidateRejectedTotalByReason: Record<string, number>;
    /** Not evaluable in F3 — requires native DIMO segment context (F4+). */
    rawRiseWithoutNativeSegmentTotal: number | null;
  };
}

export interface RawFuelRiseDetectionResult {
  candidates: RawRefuelCandidateObservation[];
  rejectedOrHeld: RawFuelRiseHeldOrRejected[];
  diagnostics: RawFuelRiseDetectionDiagnostics;
  context: RawFuelRiseDetectionContext;
}
