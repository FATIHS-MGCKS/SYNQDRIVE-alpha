/**
 * Offline historical replay harness (design-only — no Production mutation).
 *
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/rfrf-settled-post/rfrf-settled-post-historical-replay.harness.ts
 */
import { CALIBRATION_PACK_MANIFEST } from './settled-post-replay.fixtures';
import {
  computeAggregateMetrics,
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
  EXCLUDED_SUSPECT_CONTROLS,
  replayAllCases,
  replayCase,
  runSensitivityGrid,
  ADVERSARIAL_REPLAY_CASES,
} from './settled-post-replay.lib';
import { RFRF_SETTLED_POST_PLATEAU_POLICY_VERSION } from './settled-post-refuel-plateau.policy';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import type { ReplayEvidenceTier } from './settled-post-replay.fixtures';

function main() {
  const results = replayAllCases();
  const calibrationRows = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.map((c) => replayCase(c));
  const suspectRows = EXCLUDED_SUSPECT_CONTROLS.map((c) => replayCase(c));
  const metrics = computeAggregateMetrics(results);
  const sensitivity = runSensitivityGrid();

  const tierCounts = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.reduce(
    (acc, row) => {
      acc[row.replayEvidenceTier] += 1;
      return acc;
    },
    {
      CRITICAL_PATH_FULL_REPLAY: 0,
      FULL_REPLAY: 0,
      PARTIAL_REPLAY: 0,
      INSUFFICIENT_SOURCE_EVIDENCE: 0,
    } as Record<ReplayEvidenceTier, number>,
  );

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
        falsePositiveRegressionCount: metrics.fpRegressions,
        falseNegativeImprovementCount: metrics.fnImprovements,
        ambiguousCaseCount: metrics.ambiguous,
        expectedSemanticClassCounts: metrics.semanticCounts,
        sensitivityAnalysis: sensitivity,
        adversarialSemanticResults: Object.fromEntries(
          ADVERSARIAL_REPLAY_CASES.map((a) => {
            const row = results.find((r) => r.caseId === a.id);
            return [
              a.id,
              row
                ? `${row.CURRENT_MODEL_RESULT}→${row.SETTLED_MODEL_RESULT} [terminal=${row.CURRENT_RISE_TERMINAL_REJECTION}]`
                : 'MISSING',
            ];
          }),
        ),
        results,
      },
      null,
      2,
    ),
  );
}

main();
