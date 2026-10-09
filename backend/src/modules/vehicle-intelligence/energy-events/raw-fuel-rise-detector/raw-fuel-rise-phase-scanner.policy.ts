import type {
  RawRefuelCandidateLifecycleState,
  RawRefuelCandidateRejectionReason,
} from '@prisma/client';

/** R3A offline phase scanner policy — not Production runtime authority. */
export const RFRF_RISE_PHASE_SCANNER_POLICY_VERSION = 'rfrf-rise-phase-scanner-v1';

export type PhaseScannerCalibrationClassification =
  | 'REPLAY_HYPOTHESIS'
  | 'PRODUCTION_AUTHORIZED';

export interface RawFuelRisePhaseScannerCalibrationBundle {
  bundleVersion: string;
  classification: PhaseScannerCalibrationClassification;
  maxPeakToSettledDropLiters: number;
  maxPeakToSettledDropRatioOfRise: number;
  /** Separate from rise-path / settled-window internal `maxSampleGapMs`. */
  maxPeakToSettledContinuityGapMs: number;
}

export type PhaseScannerCalibrationValidation =
  | { ok: true }
  | { ok: false; reason: 'MISSING_BUNDLE' | 'MALFORMED_BUNDLE' | 'UNSUPPORTED_CLASSIFICATION' };

const TERMINAL_F3_SAFETY_REJECTIONS: ReadonlySet<RawRefuelCandidateRejectionReason> = new Set([
  'SENSOR_RESET_SUSPECTED',
  'RISE_NOT_STABLE',
  'SAMPLE_GAP_TOO_LARGE',
  'RISE_TOO_SMALL',
]);

export function validatePhaseScannerCalibrationBundle(
  bundle: RawFuelRisePhaseScannerCalibrationBundle | null | undefined,
): PhaseScannerCalibrationValidation {
  if (bundle == null) {
    return { ok: false, reason: 'MISSING_BUNDLE' };
  }
  if (typeof bundle.bundleVersion !== 'string' || bundle.bundleVersion.trim().length === 0) {
    return { ok: false, reason: 'MALFORMED_BUNDLE' };
  }
  const nums = [
    bundle.maxPeakToSettledDropLiters,
    bundle.maxPeakToSettledDropRatioOfRise,
    bundle.maxPeakToSettledContinuityGapMs,
  ];
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) {
    return { ok: false, reason: 'MALFORMED_BUNDLE' };
  }
  if (bundle.classification !== 'REPLAY_HYPOTHESIS' && bundle.classification !== 'PRODUCTION_AUTHORIZED') {
    return { ok: false, reason: 'UNSUPPORTED_CLASSIFICATION' };
  }
  return { ok: true };
}

export function isF3TerminalSafetyDominant(input: {
  lifecycleState: RawRefuelCandidateLifecycleState;
  rejectionReason: RawRefuelCandidateRejectionReason | null;
}): boolean {
  if (input.lifecycleState !== 'REJECTED') return false;
  if (input.rejectionReason == null) return true;
  return TERMINAL_F3_SAFETY_REJECTIONS.has(input.rejectionReason);
}
