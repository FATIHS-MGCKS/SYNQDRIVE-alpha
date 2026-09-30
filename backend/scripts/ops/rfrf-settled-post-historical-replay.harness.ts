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
  ALL_REPLAY_CASES,
  type ReplayCaseDefinition,
} from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/design/settled-post-replay.fixtures';
import {
  buildSettledPostSymbolsFromDetectorConfig,
  classifySettledPostMaturity,
  resolveSettledPostRefuelPlateau,
  RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION,
} from '../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/design/settled-post-refuel-plateau.policy';

interface CaseReplayResult {
  caseId: string;
  kind: ReplayCaseDefinition['kind'];
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

function replayCase(def: ReplayCaseDefinition): CaseReplayResult {
  const norm = normalizeRawFuelSamples(
    def.samples,
    new Date(def.window.from),
    new Date(def.window.to),
    RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
  );
  if (!norm.ok) {
    return {
      caseId: def.id,
      kind: def.kind,
      CURRENT_MODEL_RESULT: `NORMALIZE_FAIL:${norm.reason}`,
      SETTLED_MODEL_RESULT: 'SKIPPED',
      preMedian: null,
      peak: null,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
      relativeCorroboration: def.relativeCorroboration,
      groundTruthLiters: def.groundTruthLiters ?? null,
      falsePositiveConcern: 'N/A',
      falseNegativeConcern: 'N/A',
      notes: norm.detail,
    };
  }

  const rise = pickPrimaryRise(norm.samples);
  if (!rise) {
    return {
      caseId: def.id,
      kind: def.kind,
      CURRENT_MODEL_RESULT: 'NO_RISE',
      SETTLED_MODEL_RESULT: 'NO_RISE',
      preMedian: null,
      peak: null,
      settledPost: null,
      delta: null,
      peakToSettledDrop: null,
      relativeCorroboration: def.relativeCorroboration,
      groundTruthLiters: def.groundTruthLiters ?? null,
      falsePositiveConcern: def.kind === 'ADVERSARIAL' ? 'LOW' : 'N/A',
      falseNegativeConcern: def.kind === 'NATURAL' ? 'HIGH' : 'N/A',
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

  const symbols = buildSettledPostSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
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
    fp = settledResult === 'READY_FOR_PERSIST' ? 'HIGH' : 'LOW';
    fn = 'N/A';
  } else if (def.kind === 'NATURAL' || def.kind === 'PRODUCTION_LABELED') {
    fn =
      currentResult !== 'READY_FOR_PERSIST' && settledResult === 'READY_FOR_PERSIST'
        ? 'LOW'
        : currentResult !== 'READY_FOR_PERSIST' && settledResult !== 'READY_FOR_PERSIST'
          ? 'HIGH'
          : 'LOW';
    fp = settledResult === 'READY_FOR_PERSIST' ? 'MEDIUM' : 'LOW';
  }

  return {
    caseId: def.id,
    kind: def.kind,
    CURRENT_MODEL_RESULT: currentResult,
    SETTLED_MODEL_RESULT: settledResult,
    preMedian,
    peak,
    settledPost: settledVerdict.authoritativePostLiters,
    delta: settledVerdict.deltaLiters,
    peakToSettledDrop: settled.peakToSettledDropLiters,
    relativeCorroboration: def.relativeCorroboration,
    groundTruthLiters: def.groundTruthLiters ?? null,
    falsePositiveConcern: fp,
    falseNegativeConcern: fn,
    notes: def.notes,
  };
}

function main() {
  const results = ALL_REPLAY_CASES.map(replayCase);
  const fpRegressions = results.filter(
    (r) =>
      r.kind === 'ADVERSARIAL' &&
      r.SETTLED_MODEL_RESULT === 'READY_FOR_PERSIST' &&
      r.caseId !== 'A8_overshoot_valid_settle',
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

  const ks = results.find((r) => r.caseId === 'KS_MS_661_2026_09_30');

  console.log(
    JSON.stringify(
      {
        harness: 'rfrf-settled-post-historical-replay',
        settledPolicyVersion: RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION,
        detectorConfigVersion: RAW_FUEL_RISE_DETECTOR_CONFIG_V1.thresholdProvenance,
        historicalCaseCount: ALL_REPLAY_CASES.filter((c) => c.kind !== 'ADVERSARIAL').length,
        adversarialCaseCount: ALL_REPLAY_CASES.filter((c) => c.kind === 'ADVERSARIAL').length,
        falsePositiveRegressionCount: fpRegressions,
        falseNegativeImprovementCount: fnImprovements,
        ambiguousCaseCount: ambiguous,
        KS_MS_661_2026_09_30: ks,
        results,
      },
      null,
      2,
    ),
  );
}

main();
