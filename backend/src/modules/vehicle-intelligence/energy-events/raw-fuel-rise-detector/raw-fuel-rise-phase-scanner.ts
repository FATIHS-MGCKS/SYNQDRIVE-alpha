import { validatePlateauWindow } from './raw-fuel-rise-state-machine';
import { median } from './raw-fuel-rise-normalizer';
import {
  isF3TerminalSafetyDominant,
  RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
  validatePhaseScannerCalibrationBundle,
} from './raw-fuel-rise-phase-scanner.policy';
import type {
  PhaseScannerHoldReason,
  RawFuelRiseObservedPhase,
  RawFuelRisePhaseScannerInput,
  RawFuelRisePhaseScannerResult,
  RawFuelRisePhaseScannerSample,
  RawFuelRisePhaseTransition,
} from './raw-fuel-rise-phase-scanner.types';

function sortAndDedupeSamples(
  samples: RawFuelRisePhaseScannerSample[],
): RawFuelRisePhaseScannerSample[] | { error: 'OUT_OF_ORDER_OR_DUPLICATE' } {
  const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (let i = 1; i < sorted.length; i++) {
    const dt = sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime();
    if (dt < 0) return { error: 'OUT_OF_ORDER_OR_DUPLICATE' };
    if (dt === 0 && sorted[i].absoluteLiters !== sorted[i - 1].absoluteLiters) {
      return { error: 'OUT_OF_ORDER_OR_DUPLICATE' };
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
  return deduped;
}

function maxGapMs(series: RawFuelRisePhaseScannerSample[]): number {
  let max = 0;
  for (let i = 1; i < series.length; i++) {
    const gap = series[i].timestamp.getTime() - series[i - 1].timestamp.getTime();
    if (gap > max) max = gap;
  }
  return max;
}

function pushTransition(
  transitions: RawFuelRisePhaseTransition[],
  phase: RawFuelRiseObservedPhase,
  at: Date,
  liters: number,
): void {
  const last = transitions[transitions.length - 1];
  if (last?.phase === phase) return;
  transitions.push({ phase, at, liters });
}

function countSeparatedMaterialRises(
  series: RawFuelRisePhaseScannerSample[],
  preMedian: number,
  material: number,
): number {
  let episodes = 0;
  let inRise = false;
  let localPeak = preMedian;
  for (const p of series) {
    if (p.absoluteLiters >= preMedian + material) {
      inRise = true;
      localPeak = Math.max(localPeak, p.absoluteLiters);
    } else if (inRise && p.absoluteLiters < preMedian + material * 0.5) {
      if (localPeak >= preMedian + material) episodes += 1;
      inRise = false;
      localPeak = preMedian;
    }
  }
  if (inRise && localPeak >= preMedian + material) episodes += 1;
  return episodes;
}

function detectSensorResetOrBaselineReturn(
  series: RawFuelRisePhaseScannerSample[],
  peakIdx: number,
  preMedian: number,
  material: number,
  negativeWobble: number,
): PhaseScannerHoldReason | null {
  const peak = series[peakIdx]?.absoluteLiters ?? NaN;
  if (!Number.isFinite(peak)) return 'PHASE_INCOMPLETE';
  for (let i = peakIdx + 1; i < series.length; i++) {
    const v = series[i].absoluteLiters;
    if (v <= preMedian - negativeWobble) {
      return 'TRUE_BASELINE_RETURN';
    }
    if (peak - v > material * 2 && v < preMedian + material * 0.25) {
      return 'SENSOR_RESET';
    }
  }
  return null;
}

/**
 * Pure R3A phase-aware settled-post scanner (offline / shadow only).
 * Deterministic, side-effect free, no provider interpolation.
 */
export function scanRawFuelRisePhases(
  input: RawFuelRisePhaseScannerInput,
): RawFuelRisePhaseScannerResult {
  const policyVersion = input.policyVersion || RFRF_RISE_PHASE_SCANNER_POLICY_VERSION;
  const symbols = input.structuralSymbols;
  const transitions: RawFuelRisePhaseTransition[] = [];
  const baseProvenance = { ...input.evidenceProvenance };

  const empty = (hold: PhaseScannerHoldReason): RawFuelRisePhaseScannerResult => ({
    policyVersion,
    phaseTransitions: transitions,
    terminalPhase: null,
    maturityStatus: hold === 'INVALID_CALIBRATION_BUNDLE' ? 'REFUSED' : 'HOLD',
    holdReason: hold,
    instantaneousPeakLiters: null,
    peakAt: null,
    proposedSettledMedianLiters: null,
    settledWindowStart: null,
    settledWindowEnd: null,
    peakToSettledDropLiters: null,
    peakToSettledDropRatio: null,
    peakToSettledElapsedMs: null,
    maxPeakToSettledContinuityGapMs: null,
    physicalIdentityAnchors: input.physicalIdentityAnchors,
    proposal: { proposedPostLiters: null, proposedDeltaLiters: null },
    hypotheticalReinterpretation: false,
    calibrationProvenance: {},
    evidenceProvenance: baseProvenance,
    separatedEpisodeCount: 0,
  });

  const sorted = sortAndDedupeSamples(input.samples);
  if ('error' in sorted) {
    return empty('UNSTABLE_RISE');
  }

  if (!input.preBaseline.fresh) {
    return empty('STALE_PRE_BASELINE');
  }

  const preMedian = input.preBaseline.medianLiters;
  const onsetMs = input.riseAnchors.riseOnsetAt.getTime();
  const endMs = input.riseAnchors.riseEndAt.getTime();
  const inRiseWindow = sorted.filter(
    (p) => p.timestamp.getTime() >= onsetMs && p.timestamp.getTime() <= endMs + symbols.maxPostSearchAfterRiseEndMs,
  );
  if (inRiseWindow.length === 0) {
    return empty('MISSING_POST_SAMPLES');
  }

  const separatedEpisodeCount = countSeparatedMaterialRises(
    sorted,
    preMedian,
    symbols.materialRiseLiters,
  );
  if (separatedEpisodeCount > 1) {
    const r = empty('SECOND_REFUEL_SEPARATED');
    r.separatedEpisodeCount = separatedEpisodeCount;
    return r;
  }

  if (
    input.f3Context &&
    isF3TerminalSafetyDominant({
      lifecycleState: input.f3Context.lifecycleState as 'REJECTED',
      rejectionReason: input.f3Context.rejectionReason as import('@prisma/client').RawRefuelCandidateRejectionReason | null,
    })
  ) {
    const r = empty('TERMINAL_F3_DOMINANCE');
    r.maturityStatus = 'REFUSED';
    r.hypotheticalReinterpretation = true;
    r.holdReason = 'PHASE_AWARE_REINTERPRETATION_ONLY';
    return r;
  }

  let peakIdx = 0;
  let peakVal = -Infinity;
  for (let i = 0; i < inRiseWindow.length; i++) {
    if (inRiseWindow[i].absoluteLiters > peakVal) {
      peakVal = inRiseWindow[i].absoluteLiters;
      peakIdx = i;
    }
  }
  const peakAt = inRiseWindow[peakIdx].timestamp;
  pushTransition(transitions, 'RISING', input.riseAnchors.riseOnsetAt, inRiseWindow[0].absoluteLiters);
  pushTransition(transitions, 'PEAK_REACHED', peakAt, peakVal);

  const riseSpan = peakVal - preMedian;
  if (riseSpan < symbols.materialRiseLiters) {
    return empty('NO_MATERIAL_RISE');
  }

  const safety = detectSensorResetOrBaselineReturn(
    inRiseWindow,
    peakIdx,
    preMedian,
    symbols.materialRiseLiters,
    symbols.negativeWobbleLiters,
  );
  if (safety) {
    const r = empty(safety);
    r.instantaneousPeakLiters = peakVal;
    r.peakAt = peakAt;
    r.separatedEpisodeCount = 1;
    return r;
  }

  const calibrationCheck = validatePhaseScannerCalibrationBundle(input.calibrationBundle);
  const calibrationProvenance: Record<string, unknown> = input.calibrationBundle
    ? { ...input.calibrationBundle }
    : {};

  const riseEndMs = endMs;
  const hasLaterSettlingBelowPeak = inRiseWindow
    .slice(peakIdx + 1)
    .some((p) => p.absoluteLiters < peakVal - 0.01);
  const searchStarts = hasLaterSettlingBelowPeak
    ? inRiseWindow
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => idx > peakIdx && p.absoluteLiters < peakVal - 0.01)
        .map(({ idx }) => idx)
    : [peakIdx];
  let settledResult: {
    median: number;
    start: Date;
    end: Date;
    window: RawFuelRisePhaseScannerSample[];
    continuityGapMs: number;
  } | null = null;

  for (const searchStart of searchStarts) {
    for (let i = searchStart; i < inRiseWindow.length; i++) {
      const t0 = inRiseWindow[i].timestamp.getTime();
      if (t0 - riseEndMs > symbols.maxPostSearchAfterRiseEndMs) break;
      if (inRiseWindow[i].absoluteLiters < preMedian + symbols.materialRiseLiters) continue;

      const window: RawFuelRisePhaseScannerSample[] = [inRiseWindow[i]];
      for (let j = i + 1; j < inRiseWindow.length; j++) {
        if (inRiseWindow[j].timestamp.getTime() - riseEndMs > symbols.maxPostSearchAfterRiseEndMs) break;

        const gapMs =
          inRiseWindow[j].timestamp.getTime() - inRiseWindow[j - 1].timestamp.getTime();
        if (gapMs > symbols.settledWindowMaxInternalGapMs) break;

        const candidateValues = [...window.map((p) => p.absoluteLiters), inRiseWindow[j].absoluteLiters];
        const { valid, median: center } = validatePlateauWindow(
          candidateValues,
          symbols.postPlateauToleranceLiters,
        );
        if (!valid) break;
        if (center < preMedian + symbols.materialRiseLiters) break;

        window.push(inRiseWindow[j]);

        if (window.length >= symbols.postPlateauMinSamples) {
          const persistenceMs =
            window[window.length - 1].timestamp.getTime() - window[0].timestamp.getTime();
          if (persistenceMs < symbols.postPlateauMinPersistenceMs) continue;

          const peakToSettledPath = inRiseWindow.slice(peakIdx, j + 1);
          const continuityGapMs = maxGapMs(peakToSettledPath);

          settledResult = {
            median: center,
            start: window[0].timestamp,
            end: window[window.length - 1].timestamp,
            window: [...window],
            continuityGapMs,
          };
          break;
        }
      }
      if (settledResult) break;
    }
    if (settledResult) break;
  }

  if (!settledResult) {
    const postPeak = inRiseWindow.slice(peakIdx + 1);
    if (postPeak.length === 0) {
      return empty('MISSING_POST_SAMPLES');
    }
    const oscillating =
      postPeak.length >= 3 &&
      postPeak.some((p) => p.absoluteLiters < peakVal - symbols.negativeWobbleLiters) &&
      postPeak.some((p) => p.absoluteLiters > peakVal - symbols.negativeWobbleLiters * 0.25);
    if (oscillating && peakVal - median(postPeak.map((p) => p.absoluteLiters)) > symbols.negativeWobbleLiters) {
      const r = empty('UNSTABLE_RISE');
      r.instantaneousPeakLiters = peakVal;
      r.peakAt = peakAt;
      return r;
    }
    if (postPeak.length < symbols.postPlateauMinSamples) {
      return empty('INSUFFICIENT_POST_PERSISTENCE');
    }
    return empty('PHASE_INCOMPLETE');
  }

  const drop = peakVal - settledResult.median;
  const dropRatio = riseSpan > 0 ? drop / riseSpan : null;
  const elapsedMs = settledResult.start.getTime() - peakAt.getTime();

  if (drop > 0 && drop <= symbols.negativeWobbleLiters * 2) {
    pushTransition(transitions, 'SETTLING', settledResult.start, settledResult.median);
  }
  pushTransition(transitions, 'SETTLED', settledResult.end, settledResult.median);

  if (!calibrationCheck.ok) {
    const r = empty('INVALID_CALIBRATION_BUNDLE');
    r.instantaneousPeakLiters = peakVal;
    r.peakAt = peakAt;
    r.proposedSettledMedianLiters = settledResult.median;
    r.settledWindowStart = settledResult.start;
    r.settledWindowEnd = settledResult.end;
    r.peakToSettledDropLiters = drop;
    r.peakToSettledDropRatio = dropRatio;
    r.peakToSettledElapsedMs = elapsedMs;
    r.maxPeakToSettledContinuityGapMs = settledResult.continuityGapMs;
    r.terminalPhase = 'SETTLED';
    r.maturityStatus = 'PROVISIONAL';
    r.calibrationProvenance = calibrationProvenance;
    r.separatedEpisodeCount = 1;
    return r;
  }

  const bundle = input.calibrationBundle!;
  if (settledResult.continuityGapMs > bundle.maxPeakToSettledContinuityGapMs) {
    const r = empty('PEAK_SETTLED_CONTINUITY_GAP');
    r.instantaneousPeakLiters = peakVal;
    r.peakAt = peakAt;
    r.maxPeakToSettledContinuityGapMs = settledResult.continuityGapMs;
    r.separatedEpisodeCount = 1;
    return r;
  }

  if (drop > bundle.maxPeakToSettledDropLiters) {
    const r = empty('CALIBRATION_BOUND_EXCEEDED');
    r.instantaneousPeakLiters = peakVal;
    r.peakAt = peakAt;
    r.proposedSettledMedianLiters = settledResult.median;
    r.peakToSettledDropLiters = drop;
    r.hypotheticalReinterpretation = drop > 1;
    r.maturityStatus = 'PROVISIONAL';
    r.separatedEpisodeCount = 1;
    return r;
  }
  if (dropRatio != null && dropRatio > bundle.maxPeakToSettledDropRatioOfRise) {
    const r = empty('CALIBRATION_BOUND_EXCEEDED');
    r.instantaneousPeakLiters = peakVal;
    r.peakAt = peakAt;
    r.proposedSettledMedianLiters = settledResult.median;
    r.peakToSettledDropLiters = drop;
    r.peakToSettledDropRatio = dropRatio;
    r.hypotheticalReinterpretation = drop > 1;
    r.maturityStatus = 'PROVISIONAL';
    r.separatedEpisodeCount = 1;
    return r;
  }

  const proposedDelta = settledResult.median - preMedian;
  return {
    policyVersion,
    phaseTransitions: transitions,
    terminalPhase: 'SETTLED',
    maturityStatus: 'MATURE_SHADOW_READY',
    holdReason: null,
    instantaneousPeakLiters: peakVal,
    peakAt,
    proposedSettledMedianLiters: settledResult.median,
    settledWindowStart: settledResult.start,
    settledWindowEnd: settledResult.end,
    peakToSettledDropLiters: drop,
    peakToSettledDropRatio: dropRatio,
    peakToSettledElapsedMs: elapsedMs,
    maxPeakToSettledContinuityGapMs: settledResult.continuityGapMs,
    physicalIdentityAnchors: input.physicalIdentityAnchors,
    proposal: {
      proposedPostLiters: settledResult.median,
      proposedDeltaLiters: proposedDelta,
    },
    hypotheticalReinterpretation: false,
    calibrationProvenance,
    evidenceProvenance: baseProvenance,
    separatedEpisodeCount: 1,
  };
}
