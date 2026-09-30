/**
 * Offline historical replay: CURRENT peak-anchored F3 vs design settled-post policy.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/rfrf-settled-post-historical-replay.harness.ts
 *
 * Does NOT touch Production. Does NOT mutate candidates.
 */
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { normalizeRawFuelSamples, type NormalizedRawFuelSample } from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer';
import { detectChannelRises } from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import {
  ADVERSARIAL_REPLAY_CASES,
  ALL_REPLAY_CASES,
  CALIBRATION_PACK_MANIFEST,
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
  EXCLUDED_SUSPECT_CONTROLS,
  type ReplayCaseDefinition,
  type ReplayEvidenceTier,
} from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/design/settled-post-replay.fixtures';
import {
  buildSettledPostSymbolsFromDetectorConfig,
  classifySettledPostMaturity,
  REPLAY_DROP_CAP_CLASSIFICATION,
  REPLAY_DROP_RATIO_CLASSIFICATION,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  resolveSettledPostRefuelPlateau,
  RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION,
  type SettledPostPlateauConfigSymbols,
} from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/design/settled-post-refuel-plateau.policy';

interface CaseReplayResult {
  caseId: string;
  kind: ReplayCaseDefinition['kind'];
  vehicle: string;
  eventTimestamp: string;
  evidenceQuality: ReplayEvidenceTier;
  CURRENT_MODEL_RESULT: string;
  SETTLED_MODEL_RESULT: string;
  preMedian: number | null;
  peak: number | null;
  settledPost: number | null;
  delta: number | null;
  peakToSettledDrop: number | null;
  relativeCorroboration: string;
  groundTruthLiters: number | null;
  falsePositiveConcern: 'LOW' | 'MEDIUM' | 'HIGH' | 'N/A';
  falseNegativeConcern: 'LOW' | 'MEDIUM' | 'HIGH' | 'N/A';
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

function replayCase(
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
    relativeCorroboration: def.relativeCorroboration,
    groundTruthLiters: def.groundTruthLiters ?? null,
    notes: def.notes,
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
      falsePositiveConcern: def.kind === 'EXCLUDED_SUSPECT' ? 'N/A' : 'N/A',
      falseNegativeConcern: 'N/A',
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
      falsePositiveConcern: 'N/A',
      falseNegativeConcern: 'N/A',
      notes: norm.detail ?? def.notes,
    };
  }

  const rise = pickPrimaryRise(norm.samples);
  if (!rise) {
    return {
      ...base,
      CURRENT_MODEL_RESULT: 'NO_RISE',
      SETTLED_MODEL_RESULT: 'NO_RISE',
      preMedian: null,
      peak: null,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
      falsePositiveConcern: def.kind === 'ADVERSARIAL' ? 'LOW' : 'N/A',
      falseNegativeConcern:
        def.kind === 'NATURAL' || def.kind === 'PRODUCTION_LABELED' ? 'HIGH' : 'N/A',
    };
  }

  const series = toSeries(norm.samples);
  const lastRisePoint = rise.risePoints[rise.risePoints.length - 1];
  const peakIdx = series.findIndex(
    (p) => p.timestamp.getTime() === lastRisePoint.timestamp.getTime(),
  );
  const peak = Math.max(...rise.risePoints.map((p) => p.value));
  const preMedian = rise.prePlateau.median;
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

  const currentResult = rise.lifecycleState;
  const settledResult = settledVerdict.lifecycleState;

  let fp: CaseReplayResult['falsePositiveConcern'] = 'LOW';
  let fn: CaseReplayResult['falseNegativeConcern'] = 'LOW';
  if (def.kind === 'ADVERSARIAL') {
    fp = settledResult === 'READY_FOR_PERSIST' && def.id !== 'A8' ? 'HIGH' : 'LOW';
    fn = 'N/A';
  } else if (def.kind === 'NATURAL' || def.kind === 'PRODUCTION_LABELED') {
    fn =
      currentResult !== 'READY_FOR_PERSIST' && settledResult === 'READY_FOR_PERSIST'
        ? 'LOW'
        : currentResult !== 'READY_FOR_PERSIST' && settledResult !== 'READY_FOR_PERSIST'
          ? 'HIGH'
          : 'LOW';
    fp = settledResult === 'READY_FOR_PERSIST' ? 'MEDIUM' : 'LOW';
  } else if (def.kind === 'EXCLUDED_SUSPECT') {
    fp = settledResult === 'READY_FOR_PERSIST' ? 'HIGH' : 'LOW';
    fn = 'N/A';
  }

  return {
    ...base,
    CURRENT_MODEL_RESULT: currentResult,
    SETTLED_MODEL_RESULT: settledResult,
    preMedian,
    peak,
    settledPost: settledVerdict.authoritativePostLiters,
    delta: settledVerdict.deltaLiters,
    peakToSettledDrop: settled.peakToSettledDropLiters,
    falsePositiveConcern: fp,
    falseNegativeConcern: fn,
  };
}

function runSensitivityGrid() {
  const literCaps = [1, 2, 3, 4, 5, 6];
  const ratioCaps = [0.15, 0.25, 0.35, 0.45, 0.55];
  const replayableNatural = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.filter((c) => c.samples.length > 0);
  const adversarial = ADVERSARIAL_REPLAY_CASES;

  const grid: Array<{
    maxPeakToSettledDropLiters: number;
    maxPeakToSettledDropRatioOfRise: number;
    naturalSettledReadyCount: number;
    naturalIdsReady: string[];
    adversarialUnexpectedReadyCount: number;
    adversarialIdsUnexpectedReady: string[];
  }> = [];

  for (const liters of literCaps) {
    for (const ratio of ratioCaps) {
      const naturalResults = replayableNatural.map((c) =>
        replayCase(c, {
          maxPeakToSettledDropLiters: liters,
          maxPeakToSettledDropRatioOfRise: ratio,
        }),
      );
      const advResults = adversarial.map((c) =>
        replayCase(c, {
          maxPeakToSettledDropLiters: liters,
          maxPeakToSettledDropRatioOfRise: ratio,
        }),
      );
      const naturalReady = naturalResults.filter((r) => r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST');
      const advReady = advResults.filter(
        (r) =>
          r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST' && r.caseId !== 'A8' && r.caseId !== 'A10',
      );
      grid.push({
        maxPeakToSettledDropLiters: liters,
        maxPeakToSettledDropRatioOfRise: ratio,
        naturalSettledReadyCount: naturalReady.length,
        naturalIdsReady: naturalReady.map((r) => r.caseId),
        adversarialUnexpectedReadyCount: advReady.length,
        adversarialIdsUnexpectedReady: advReady.map((r) => r.caseId),
      });
    }
  }

  const defaultHypothesis = grid.find(
    (g) =>
      g.maxPeakToSettledDropLiters === REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS &&
      g.maxPeakToSettledDropRatioOfRise === REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  );

  const firstAdversarialLeak = grid.find((g) => g.adversarialUnexpectedReadyCount > 0);
  const allNaturalReadyAtDefault = defaultHypothesis?.naturalSettledReadyCount ?? 0;

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
      firstAdversarialLeak == null
        ? 'No adversarial READY (excluding A8) across tested grid — frontier not observed in grid'
        : `First adversarial leak at dropLiters=${firstAdversarialLeak.maxPeakToSettledDropLiters} ratio=${firstAdversarialLeak.maxPeakToSettledDropRatioOfRise}: ${firstAdversarialLeak.adversarialIdsUnexpectedReady.join(',')}`,
    allNaturalReadyAtDefaultHypothesis: allNaturalReadyAtDefault,
    grid,
  };
}

function adversarialResultById(results: CaseReplayResult[], id: string): string {
  const row = results.find((r) => r.caseId === id);
  if (!row) return 'MISSING';
  return `${row.CURRENT_MODEL_RESULT}→${row.SETTLED_MODEL_RESULT}`;
}

function main() {
  const results = ALL_REPLAY_CASES.map((c) => replayCase(c));
  const calibrationRows = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.map((c) => replayCase(c));
  const suspectRows = EXCLUDED_SUSPECT_CONTROLS.map((c) => replayCase(c));

  const fpRegressions = results.filter(
    (r) =>
      r.kind === 'ADVERSARIAL' &&
      r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST' &&
      r.caseId !== 'A8' &&
      r.caseId !== 'A10',
  ).length;
  const fnImprovements = results.filter(
    (r) =>
      (r.kind === 'NATURAL' || r.kind === 'PRODUCTION_LABELED') &&
      r.CURRENT_MODEL_RESULT !== 'READY_FOR_PERSIST' &&
      r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST',
  ).length;
  const ambiguous = results.filter(
    (r) => r.CURRENT_MODEL_RESULT !== r.SETTLED_MODEL_RESULT && r.kind !== 'ADVERSARIAL',
  ).length;

  const tierCounts = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.reduce(
    (acc, row) => {
      acc[row.replayEvidenceTier] += 1;
      return acc;
    },
    {
      FULL_REPLAY: 0,
      PARTIAL_REPLAY: 0,
      INSUFFICIENT_SOURCE_EVIDENCE: 0,
    } as Record<ReplayEvidenceTier, number>,
  );

  const sensitivity = runSensitivityGrid();

  console.log(
    JSON.stringify(
      {
        harness: 'rfrf-settled-post-historical-replay',
        settledPolicyVersion: RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION,
        detectorConfigVersion: RAW_FUEL_RISE_DETECTOR_CONFIG_V1.thresholdProvenance,
        calibrationPack: CALIBRATION_PACK_MANIFEST,
        defensibleNaturalRows: calibrationRows,
        excludedSuspectControls: suspectRows,
        replayTierCounts: tierCounts,
        historicalCaseCount: ALL_REPLAY_CASES.filter((c) => c.kind !== 'ADVERSARIAL').length,
        adversarialCaseCount: ADVERSARIAL_REPLAY_CASES.length,
        falsePositiveRegressionCount: fpRegressions,
        falseNegativeImprovementCount: fnImprovements,
        ambiguousCaseCount: ambiguous,
        sensitivityAnalysis: sensitivity,
        adversarialSemanticResults: Object.fromEntries(
          ADVERSARIAL_REPLAY_CASES.map((a) => [a.id, adversarialResultById(results, a.id)]),
        ),
        results,
      },
      null,
      2,
    ),
  );
}

main();
