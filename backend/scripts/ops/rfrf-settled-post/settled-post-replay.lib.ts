import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import {
  normalizeRawFuelSamples,
  type NormalizedRawFuelSample,
} from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer';
import { detectChannelRises } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import {
  ADVERSARIAL_REPLAY_CASES,
  ALL_REPLAY_CASES,
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
  EXCLUDED_SUSPECT_CONTROLS,
  type ExpectedSemanticClass,
  type ExpectedSettledOutcome,
  type ReplayCaseDefinition,
  type ReplayEvidenceTier,
} from './settled-post-replay.fixtures';
import {
  buildSettledPostSymbolsFromDetectorConfig,
  classifySettledPostMaturity,
  isCurrentF3TerminalSafetyRejection,
  REPLAY_DROP_CAP_CLASSIFICATION,
  REPLAY_DROP_RATIO_CLASSIFICATION,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  resolveSettledPostRefuelPlateau,
  type SettledPostPlateauConfigSymbols,
} from './settled-post-refuel-plateau.policy';

export interface CaseReplayResult {
  caseId: string;
  kind: ReplayCaseDefinition['kind'];
  vehicle: string;
  eventTimestamp: string;
  evidenceQuality: ReplayEvidenceTier;
  expectedSemanticClass?: ExpectedSemanticClass;
  expectedSettledOutcome?: ExpectedSettledOutcome;
  CURRENT_MODEL_RESULT: string;
  CURRENT_RISE_TERMINAL_REJECTION: 'YES' | 'NO' | 'N/A';
  CURRENT_REJECTION_REASON: string | null;
  SETTLED_EVALUATION_ALLOWED: 'YES' | 'NO' | 'N/A';
  SETTLED_MODEL_RESULT: string;
  preMedian: number | null;
  peak: number | null;
  settledPost: number | null;
  delta: number | null;
  peakToSettledDrop: number | null;
  relativeCorroboration: string;
  groundTruthLiters: number | null;
  falsePositiveRegression: boolean;
  notes?: string;
}

function pickPrimaryRise(samples: NormalizedRawFuelSample[]) {
  const rises = detectChannelRises(samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
  if (rises.length === 0) return null;
  return rises.reduce((best, r) => {
    const peak = Math.max(...r.risePoints.map((p) => p.value));
    const bestPeak = Math.max(...best.risePoints.map((p) => p.value));
    return peak > bestPeak ? r : best;
  });
}

function toSeries(samples: { timestamp: Date; absoluteLiters?: number | null }[]) {
  return samples
    .filter((s) => typeof s.absoluteLiters === 'number')
    .map((s) => ({ timestamp: s.timestamp, value: s.absoluteLiters as number }));
}

export function isFalsePositiveRegression(
  result: CaseReplayResult,
  def: ReplayCaseDefinition,
): boolean {
  if (def.expectedSemanticClass === 'POSITIVE_CONTROL') return false;
  if (def.expectedSemanticClass !== 'SAFETY_NEGATIVE') return false;
  if (result.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST') return true;
  if (
    result.CURRENT_RISE_TERMINAL_REJECTION === 'YES' &&
    result.SETTLED_MODEL_RESULT !== 'REJECTED'
  ) {
    return true;
  }
  return false;
}

export function replayCase(
  def: ReplayCaseDefinition,
  symbolOverrides?: Partial<
    Pick<
      SettledPostPlateauConfigSymbols,
      'maxPeakToSettledDropLiters' | 'maxPeakToSettledDropRatioOfRise'
    >
  >,
): CaseReplayResult {
  const base = {
    caseId: def.id,
    kind: def.kind,
    vehicle: def.vehicle,
    eventTimestamp: def.eventTimestamp,
    evidenceQuality: def.replayEvidenceTier,
    expectedSemanticClass: def.expectedSemanticClass,
    expectedSettledOutcome: def.expectedSettledOutcome,
    relativeCorroboration: def.relativeCorroboration,
    groundTruthLiters: def.groundTruthLiters ?? null,
    notes: def.notes,
    CURRENT_RISE_TERMINAL_REJECTION: 'N/A' as const,
    CURRENT_REJECTION_REASON: null as string | null,
    SETTLED_EVALUATION_ALLOWED: 'N/A' as const,
    falsePositiveRegression: false,
  };

  if (def.samples.length === 0) {
    return {
      ...base,
      CURRENT_MODEL_RESULT: 'INSUFFICIENT_SOURCE_EVIDENCE',
      SETTLED_MODEL_RESULT: 'SKIPPED',
      preMedian: null,
      peak: null,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
    };
  }

  const norm = normalizeRawFuelSamples(
    def.samples,
    new Date(def.window.from),
    new Date(def.window.to),
    RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
  );
  if (!norm.ok) {
    return {
      ...base,
      CURRENT_MODEL_RESULT: `NORMALIZE_FAIL:${norm.reason}`,
      SETTLED_MODEL_RESULT: 'SKIPPED',
      preMedian: null,
      peak: null,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
      notes: norm.detail ?? def.notes,
    };
  }

  const rise = pickPrimaryRise(norm.samples);
  if (!rise) {
    const row: CaseReplayResult = {
      ...base,
      CURRENT_MODEL_RESULT: 'NO_RISE',
      CURRENT_RISE_TERMINAL_REJECTION: 'NO',
      SETTLED_EVALUATION_ALLOWED: 'NO',
      SETTLED_MODEL_RESULT: 'NO_RISE',
      preMedian: null,
      peak: null,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
    };
    row.falsePositiveRegression = isFalsePositiveRegression(row, def);
    return row;
  }

  const terminal = isCurrentF3TerminalSafetyRejection({
    lifecycleState: rise.lifecycleState,
    rejectionReason: rise.rejectionReason,
  });

  const currentResult = rise.lifecycleState;
  const preMedian = rise.prePlateau.median;
  const peak = Math.max(...rise.risePoints.map((p) => p.value));

  if (terminal) {
    const row: CaseReplayResult = {
      ...base,
      CURRENT_MODEL_RESULT: currentResult,
      CURRENT_RISE_TERMINAL_REJECTION: 'YES',
      CURRENT_REJECTION_REASON: rise.rejectionReason,
      SETTLED_EVALUATION_ALLOWED: 'NO',
      SETTLED_MODEL_RESULT: 'REJECTED',
      preMedian,
      peak,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
    };
    row.falsePositiveRegression = isFalsePositiveRegression(row, def);
    return row;
  }

  const series = toSeries(norm.samples);
  const lastRisePoint = rise.risePoints[rise.risePoints.length - 1];
  const peakIdx = series.findIndex(
    (p) => p.timestamp.getTime() === lastRisePoint.timestamp.getTime(),
  );
  const riseEndIdx = peakIdx >= 0 ? peakIdx : series.length - 1;

  const symbols = buildSettledPostSymbolsFromDetectorConfig(
    RAW_FUEL_RISE_DETECTOR_CONFIG_V1,
    symbolOverrides,
  );
  const settled = resolveSettledPostRefuelPlateau({
    series,
    riseEndIdx,
    peakIdx: riseEndIdx,
    preMedian,
    symbols,
  });
  const settledVerdict = classifySettledPostMaturity({ preMedian, settled });

  const row: CaseReplayResult = {
    ...base,
    CURRENT_MODEL_RESULT: currentResult,
    CURRENT_RISE_TERMINAL_REJECTION: 'NO',
    CURRENT_REJECTION_REASON: rise.rejectionReason,
    SETTLED_EVALUATION_ALLOWED: 'YES',
    SETTLED_MODEL_RESULT: settledVerdict.lifecycleState,
    preMedian,
    peak,
    settledPost: settledVerdict.authoritativePostLiters,
    delta: settledVerdict.deltaLiters,
    peakToSettledDrop: settled.peakToSettledDropLiters,
  };
  row.falsePositiveRegression = isFalsePositiveRegression(row, def);
  return row;
}

export function assertTerminalRejectionDominatesSettledPost(results: CaseReplayResult[]): void {
  for (const r of results) {
    if (r.CURRENT_RISE_TERMINAL_REJECTION !== 'YES') continue;
    if (r.SETTLED_EVALUATION_ALLOWED !== 'NO') {
      throw new Error(`${r.caseId}: terminal rejection must block settled evaluation`);
    }
    if (r.SETTLED_MODEL_RESULT !== 'REJECTED') {
      throw new Error(
        `${r.caseId}: terminal F3 REJECTED must not resurrect to ${r.SETTLED_MODEL_RESULT}`,
      );
    }
  }
}

export function runSensitivityGrid() {
  const literCaps = [1, 2, 3, 4, 5, 6];
  const ratioCaps = [0.15, 0.25, 0.35, 0.45, 0.55];
  const replayableNatural = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.filter((c) => c.samples.length > 0);
  const safetyNegative = ADVERSARIAL_REPLAY_CASES.filter(
    (c) => c.expectedSemanticClass === 'SAFETY_NEGATIVE',
  );

  const grid: Array<{
    maxPeakToSettledDropLiters: number;
    maxPeakToSettledDropRatioOfRise: number;
    naturalSettledReadyCount: number;
    naturalIdsReady: string[];
    safetyNegativeUnexpectedReadyCount: number;
    safetyNegativeIdsUnexpectedReady: string[];
    safetyNegativeResurrectionCount: number;
  }> = [];

  for (const liters of literCaps) {
    for (const ratio of ratioCaps) {
      const overrides = {
        maxPeakToSettledDropLiters: liters,
        maxPeakToSettledDropRatioOfRise: ratio,
      };
      const naturalResults = replayableNatural.map((c) => replayCase(c, overrides));
      const advResults = safetyNegative.map((c) => replayCase(c, overrides));
      const naturalReady = naturalResults.filter((r) => r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST');
      const badAdv = advResults.filter((r) => r.falsePositiveRegression);
      grid.push({
        maxPeakToSettledDropLiters: liters,
        maxPeakToSettledDropRatioOfRise: ratio,
        naturalSettledReadyCount: naturalReady.length,
        naturalIdsReady: naturalReady.map((r) => r.caseId),
        safetyNegativeUnexpectedReadyCount: badAdv.length,
        safetyNegativeIdsUnexpectedReady: badAdv.map((r) => r.caseId),
        safetyNegativeResurrectionCount: badAdv.filter(
          (r) => r.CURRENT_RISE_TERMINAL_REJECTION === 'YES',
        ).length,
      });
    }
  }

  const defaultHypothesis = grid.find(
    (g) =>
      g.maxPeakToSettledDropLiters === REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS &&
      g.maxPeakToSettledDropRatioOfRise === REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  );

  const firstLeak = grid.find((g) => g.safetyNegativeUnexpectedReadyCount > 0);

  return {
    classification: {
      dropLiters: REPLAY_DROP_CAP_CLASSIFICATION,
      dropRatio: REPLAY_DROP_RATIO_CLASSIFICATION,
      defaultHypothesisLiters: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
      defaultHypothesisRatio: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
      productionDropCapSelected: false,
      productionDropRatioSelected: false,
    },
    defaultHypothesisPoint: defaultHypothesis,
    safetyFrontierNote:
      firstLeak == null
        ? 'No SAFETY_NEGATIVE false-positive regressions across tested grid'
        : `First SAFETY_NEGATIVE leak at dropLiters=${firstLeak.maxPeakToSettledDropLiters} ratio=${firstLeak.maxPeakToSettledDropRatioOfRise}: ${firstLeak.safetyNegativeIdsUnexpectedReady.join(',')}`,
    grid,
  };
}

export function replayAllCases() {
  return ALL_REPLAY_CASES.map((c) => replayCase(c));
}

export function computeAggregateMetrics(results: CaseReplayResult[]) {
  const fpRegressions = results.filter((r) => r.falsePositiveRegression).length;
  const fnImprovements = results.filter(
    (r) =>
      (r.kind === 'NATURAL' || r.kind === 'PRODUCTION_LABELED') &&
      r.SETTLED_EVALUATION_ALLOWED === 'YES' &&
      r.CURRENT_MODEL_RESULT !== 'READY_FOR_PERSIST' &&
      r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST',
  ).length;
  const ambiguous = results.filter(
    (r) =>
      r.kind !== 'ADVERSARIAL' &&
      r.SETTLED_EVALUATION_ALLOWED === 'YES' &&
      r.CURRENT_MODEL_RESULT !== r.SETTLED_MODEL_RESULT,
  ).length;

  const semanticCounts = ADVERSARIAL_REPLAY_CASES.reduce(
    (acc, def) => {
      if (def.expectedSemanticClass) acc[def.expectedSemanticClass] += 1;
      return acc;
    },
    { POSITIVE_CONTROL: 0, SAFETY_NEGATIVE: 0, AMBIGUOUS: 0 } as Record<
      ExpectedSemanticClass,
      number
    >,
  );

  return { fpRegressions, fnImprovements, ambiguous, semanticCounts };
}

export { EXCLUDED_SUSPECT_CONTROLS, DEFENSIBLE_NATURAL_CALIBRATION_ROWS, ADVERSARIAL_REPLAY_CASES };
