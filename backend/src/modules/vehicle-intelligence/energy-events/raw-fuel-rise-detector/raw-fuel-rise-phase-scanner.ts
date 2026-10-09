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
import { validatePhaseScannerInput } from './raw-fuel-rise-phase-scanner.validation';

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

/**
 * Distinct material rises that return near pre-baseline between episodes (legacy path).
 */
function countBaselineSeparatedRises(
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

function findAnchoredPeak(
  series: RawFuelRisePhaseScannerSample[],
  onsetMs: number,
  endMs: number,
): { peakIdx: number; peakVal: number } | null {
  let peakIdx = -1;
  let peakVal = -Infinity;
  for (let i = 0; i < series.length; i++) {
    const t = series[i].timestamp.getTime();
    if (t < onsetMs || t > endMs) continue;
    if (series[i].absoluteLiters > peakVal) {
      peakVal = series[i].absoluteLiters;
      peakIdx = i;
    }
  }
  if (peakIdx < 0 || !Number.isFinite(peakVal)) return null;
  return { peakIdx, peakVal };
}

/**
 * Second refuel inside the bounded post-search window while remaining above pre-baseline
 * (e.g. 6→20→19 then 27→26 without returning to baseline).
 */
function findSecondMaterialRiseStartIndex(
  series: RawFuelRisePhaseScannerSample[],
  peakIdx: number,
  anchoredPeak: number,
  preMedian: number,
  material: number,
): number | null {
  let settledFloor = anchoredPeak;
  for (let i = peakIdx + 1; i < series.length; i++) {
    const v = series[i].absoluteLiters;
    if (v < anchoredPeak - material * 0.15) {
      settledFloor = Math.min(settledFloor, v);
    }
    if (v <= preMedian + material * 0.5) {
      settledFloor = preMedian;
    }
    if (v >= anchoredPeak + material) {
      return i;
    }
    if (v >= settledFloor + material && v > anchoredPeak + 1) {
      return i;
    }
  }
  return null;
}

function countPhaseAwareEpisodes(
  series: RawFuelRisePhaseScannerSample[],
  onsetMs: number,
  riseEndMs: number,
  searchEndMs: number,
  preMedian: number,
  material: number,
): number {
  const windowSeries = series.filter(
    (p) => p.timestamp.getTime() >= onsetMs && p.timestamp.getTime() <= searchEndMs,
  );
  if (windowSeries.length === 0) return 0;

  const anchored = findAnchoredPeak(windowSeries, onsetMs, riseEndMs);
  if (!anchored) return 0;

  const baselineSeparated = countBaselineSeparatedRises(windowSeries, preMedian, material);
  const secondIdx = findSecondMaterialRiseStartIndex(
    windowSeries,
    anchored.peakIdx,
    anchored.peakVal,
    preMedian,
    material,
  );
  if (secondIdx != null) {
    return Math.max(2, baselineSeparated);
  }
  const globalPeak = windowSeries.reduce((m, p) => Math.max(m, p.absoluteLiters), -Infinity);
  if (globalPeak > anchored.peakVal + 0.01) {
    return Math.max(2, baselineSeparated);
  }
  return Math.max(1, baselineSeparated);
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
    maturityStatus:
      hold === 'INVALID_CALIBRATION_BUNDLE' ||
      hold === 'TERMINAL_F3_DOMINANCE' ||
      hold === 'PHASE_AWARE_REINTERPRETATION_ONLY'
        ? 'REFUSED'
        : 'HOLD',
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

  const validated = validatePhaseScannerInput(input);
  if (!validated.ok) {
    return empty(validated.holdReason);
  }
  const sorted = validated.samples;

  if (!input.preBaseline.fresh) {
    return empty('STALE_PRE_BASELINE');
  }

  const preMedian = input.preBaseline.medianLiters;
  const onsetMs = input.riseAnchors.riseOnsetAt.getTime();
  const endMs = input.riseAnchors.riseEndAt.getTime();
  const searchEndMs = endMs + symbols.maxPostSearchAfterRiseEndMs;

  const inRiseWindow = sorted.filter((p) => {
    const t = p.timestamp.getTime();
    return t >= onsetMs && t <= searchEndMs;
  });
  if (inRiseWindow.length === 0) {
    return empty('MISSING_POST_SAMPLES');
  }

  const anchoredForEpisode = findAnchoredPeak(inRiseWindow, onsetMs, endMs);

  const separatedEpisodeCount = countPhaseAwareEpisodes(
    sorted,
    onsetMs,
    endMs,
    searchEndMs,
    preMedian,
    symbols.materialRiseLiters,
  );
  if (separatedEpisodeCount > 1) {
    const r = empty('SECOND_REFUEL_SEPARATED');
    r.separatedEpisodeCount = separatedEpisodeCount;
    if (anchoredForEpisode) {
      r.instantaneousPeakLiters = anchoredForEpisode.peakVal;
      r.peakAt = inRiseWindow[anchoredForEpisode.peakIdx].timestamp;
    }
    return r;
  }

  if (input.f3Context && isF3TerminalSafetyDominant({
    lifecycleState: input.f3Context.lifecycleState as import('@prisma/client').RawRefuelCandidateLifecycleState,
    rejectionReason: input.f3Context.rejectionReason as import('@prisma/client').RawRefuelCandidateRejectionReason | null,
  })) {
    const r = empty('TERMINAL_F3_DOMINANCE');
    r.maturityStatus = 'REFUSED';
    r.hypotheticalReinterpretation = true;
    r.holdReason = 'PHASE_AWARE_REINTERPRETATION_ONLY';
    return r;
  }

  if (!anchoredForEpisode) {
    return empty('EPISODE_AMBIGUOUS');
  }
  const peakIdx = anchoredForEpisode.peakIdx;
  const peakVal = anchoredForEpisode.peakVal;
  const peakAt = inRiseWindow[peakIdx].timestamp;

  const secondRiseIdx = findSecondMaterialRiseStartIndex(
    inRiseWindow,
    peakIdx,
    peakVal,
    preMedian,
    symbols.materialRiseLiters,
  );
  if (secondRiseIdx != null) {
    const r = empty('SECOND_REFUEL_SEPARATED');
    r.separatedEpisodeCount = 2;
    r.instantaneousPeakLiters = peakVal;
    r.peakAt = peakAt;
    return r;
  }

  const episodeSeries =
    secondRiseIdx != null ? inRiseWindow.slice(0, secondRiseIdx) : inRiseWindow;

  pushTransition(transitions, 'RISING', input.riseAnchors.riseOnsetAt, episodeSeries[0].absoluteLiters);
  pushTransition(transitions, 'PEAK_REACHED', peakAt, peakVal);

  const riseSpan = peakVal - preMedian;
  if (riseSpan < symbols.materialRiseLiters) {
    return empty('NO_MATERIAL_RISE');
  }

  const safety = detectSensorResetOrBaselineReturn(
    episodeSeries,
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
  const hasLaterSettlingBelowPeak = episodeSeries
    .slice(peakIdx + 1)
    .some((p) => p.absoluteLiters < peakVal - 0.01);
  const searchStarts = hasLaterSettlingBelowPeak
    ? episodeSeries
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
    for (let i = searchStart; i < episodeSeries.length; i++) {
      const t0 = episodeSeries[i].timestamp.getTime();
      if (t0 - riseEndMs > symbols.maxPostSearchAfterRiseEndMs) break;
      if (episodeSeries[i].absoluteLiters < preMedian + symbols.materialRiseLiters) continue;

      const window: RawFuelRisePhaseScannerSample[] = [episodeSeries[i]];
      for (let j = i + 1; j < episodeSeries.length; j++) {
        if (episodeSeries[j].timestamp.getTime() - riseEndMs > symbols.maxPostSearchAfterRiseEndMs) {
          break;
        }

        const gapMs =
          episodeSeries[j].timestamp.getTime() - episodeSeries[j - 1].timestamp.getTime();
        if (gapMs > symbols.settledWindowMaxInternalGapMs) break;

        const candidateValues = [...window.map((p) => p.absoluteLiters), episodeSeries[j].absoluteLiters];
        const { valid, median: center } = validatePlateauWindow(
          candidateValues,
          symbols.postPlateauToleranceLiters,
        );
        if (!valid) break;
        if (center < preMedian + symbols.materialRiseLiters) break;

        window.push(episodeSeries[j]);

        if (window.length >= symbols.postPlateauMinSamples) {
          const persistenceMs =
            window[window.length - 1].timestamp.getTime() - window[0].timestamp.getTime();
          if (persistenceMs < symbols.postPlateauMinPersistenceMs) continue;

          const peakToSettledPath = episodeSeries.slice(peakIdx, j + 1);
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
    const postPeak = episodeSeries.slice(peakIdx + 1);
    if (postPeak.length === 0) {
      return empty('MISSING_POST_SAMPLES');
    }
    const oscillating =
      postPeak.length >= 3 &&
      postPeak.some((p) => p.absoluteLiters < peakVal - symbols.negativeWobbleLiters) &&
      postPeak.some((p) => p.absoluteLiters > peakVal - symbols.negativeWobbleLiters * 0.25);
    if (
      oscillating &&
      peakVal - median(postPeak.map((p) => p.absoluteLiters)) > symbols.negativeWobbleLiters
    ) {
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
