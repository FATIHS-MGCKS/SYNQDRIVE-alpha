import {
  RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
  validatePhaseScannerCalibrationBundle,
  type RawFuelRisePhaseScannerCalibrationBundle,
} from './raw-fuel-rise-phase-scanner.policy';
import type {
  PhaseScannerHoldReason,
  RawFuelRisePhaseScannerInput,
  RawFuelRisePhaseScannerRiseAnchors,
  RawFuelRisePhaseScannerSample,
  RawFuelRisePhaseScannerStructuralSymbols,
} from './raw-fuel-rise-phase-scanner.types';

export const RECOGNIZED_PHASE_SCANNER_POLICY_VERSIONS: ReadonlySet<string> = new Set([
  RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
]);

export const RECOGNIZED_REPLAY_CALIBRATION_BUNDLE_VERSIONS: ReadonlySet<string> = new Set([
  'replay-hypothesis-v1',
]);

export type PhaseScannerInputValidation =
  | { ok: true; samples: RawFuelRisePhaseScannerSample[] }
  | { ok: false; holdReason: PhaseScannerHoldReason };

function isValidDate(d: Date): boolean {
  return d instanceof Date && Number.isFinite(d.getTime());
}

export function validateRiseAnchors(anchors: RawFuelRisePhaseScannerRiseAnchors): boolean {
  if (!isValidDate(anchors.riseOnsetAt) || !isValidDate(anchors.riseEndAt)) {
    return false;
  }
  return anchors.riseEndAt.getTime() >= anchors.riseOnsetAt.getTime();
}

export function validateStructuralSymbols(symbols: RawFuelRisePhaseScannerStructuralSymbols): boolean {
  const fields = [
    symbols.materialRiseLiters,
    symbols.postPlateauMinSamples,
    symbols.postPlateauToleranceLiters,
    symbols.postPlateauMinPersistenceMs,
    symbols.settledWindowMaxInternalGapMs,
    symbols.negativeWobbleLiters,
    symbols.maxPostSearchAfterRiseEndMs,
  ];
  return fields.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0);
}

export function canonicalSortAndDedupeSamples(
  samples: RawFuelRisePhaseScannerSample[],
): PhaseScannerInputValidation {
  for (const s of samples) {
    if (!isValidDate(s.timestamp)) {
      return { ok: false, holdReason: 'MALFORMED_INPUT' };
    }
    if (typeof s.absoluteLiters !== 'number' || !Number.isFinite(s.absoluteLiters)) {
      return { ok: false, holdReason: 'MALFORMED_INPUT' };
    }
  }

  const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime();
    if (dt < 0) {
      return { ok: false, holdReason: 'MALFORMED_INPUT' };
    }
    if (dt === 0 && sorted[i].absoluteLiters !== sorted[i - 1].absoluteLiters) {
      return { ok: false, holdReason: 'MALFORMED_INPUT' };
    }
  }

  const deduped: RawFuelRisePhaseScannerSample[] = [];
  for (const s of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.timestamp.getTime() === s.timestamp.getTime()) {
      deduped[deduped.length - 1] = s;
      continue;
    }
    deduped.push(s);
  }
  return { ok: true, samples: deduped };
}

export function validatePhaseScannerInput(
  input: RawFuelRisePhaseScannerInput,
): PhaseScannerInputValidation {
  const policyVersion = input.policyVersion || RFRF_RISE_PHASE_SCANNER_POLICY_VERSION;
  if (!RECOGNIZED_PHASE_SCANNER_POLICY_VERSIONS.has(policyVersion)) {
    return { ok: false, holdReason: 'UNSUPPORTED_POLICY_VERSION' };
  }

  if (!validateStructuralSymbols(input.structuralSymbols)) {
    return { ok: false, holdReason: 'MALFORMED_INPUT' };
  }

  if (
    typeof input.preBaseline.medianLiters !== 'number' ||
    !Number.isFinite(input.preBaseline.medianLiters)
  ) {
    return { ok: false, holdReason: 'INVALID_BASELINE' };
  }

  if (!validateRiseAnchors(input.riseAnchors)) {
    return { ok: false, holdReason: 'INVALID_RISE_ANCHORS' };
  }

  const bundle = input.calibrationBundle;
  if (bundle != null) {
    const bundleCheck = validatePhaseScannerCalibrationBundle(bundle);
    if (!bundleCheck.ok) {
      return { ok: false, holdReason: 'INVALID_CALIBRATION_BUNDLE' };
    }
    if (!RECOGNIZED_REPLAY_CALIBRATION_BUNDLE_VERSIONS.has(bundle.bundleVersion)) {
      return { ok: false, holdReason: 'INVALID_CALIBRATION_BUNDLE' };
    }
  }

  return canonicalSortAndDedupeSamples(input.samples);
}

export function isReplayHypothesisCalibrationBundle(
  bundle: RawFuelRisePhaseScannerCalibrationBundle | null,
): boolean {
  return bundle?.classification === 'REPLAY_HYPOTHESIS';
}
