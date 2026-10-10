import * as fs from 'fs';
import * as path from 'path';
import {
  ADVERSARIAL_REPLAY_CASES,
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
} from './settled-post-replay.fixtures';
import {
  assertTerminalRejectionDominatesSettledPost,
  replayAllCases,
  runSensitivityGrid,
} from './settled-post-replay.lib';
import {
  CANONICAL_PHYSICAL_EVENT_IDS,
  COMMITTED_FULL_REPLAY_FIXTURE_IDS,
  DROP_CALIBRATION_ELIGIBLE_EVENT_IDS,
  LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS,
  maxEventsFromSingleVehicle,
  NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS,
  POSITIVE_LABELED_PHYSICAL_EVENT_IDS,
  RFRF_OQ014_R4A_EVENT_ACCOUNTING,
  SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS,
  SETTLING_TIMING_INELIGIBLE_EVENT_IDS,
  SUSPECT_PHYSICAL_EVENT_IDS,
} from './rfrf-oq014-r4a-event-accounting';
import {
  assertCommittedReplayCoverage,
  computeAllR4aEligibleMetrics,
  computeR4aPerEventMetrics,
  summarizeDropCalibration,
} from './rfrf-oq014-r4a-calibration-metrics.lib';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ACCOUNTING_JSON_PATH = path.join(
  REPO_ROOT,
  'architecture/knowledge-graphs/energy-event-detection/evidence/data/RFRF-OQ014-R4A-EVENT-ACCOUNTING.json',
);

describe('RFRF OQ-014 R4A calibration integrity (offline)', () => {
  it('R4A-ACC-1 machine JSON matches TypeScript accounting registry', () => {
    const json = JSON.parse(fs.readFileSync(ACCOUNTING_JSON_PATH, 'utf8')) as {
      naturalCalibrationEligibleEventIds: string[];
      wobConcentration: { count: number; fraction: number };
    };
    expect(json.naturalCalibrationEligibleEventIds).toEqual([
      ...NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS,
    ]);
    expect(json.wobConcentration.count).toBe(3);
    expect(json.wobConcentration.fraction).toBe(0.5);
    expect(RFRF_OQ014_R4A_EVENT_ACCOUNTING.length).toBe(CANONICAL_PHYSICAL_EVENT_IDS.length);
  });

  it('R4A-ACC-2 reconciles WOB concentration — table 3/6 not narrative 4/6', () => {
    const wob = maxEventsFromSingleVehicle(NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS);
    expect(wob.vehicleLabel).toBe('WOB L 7503');
    expect(wob.count).toBe(3);
    expect(wob.fraction).toBe(0.5);
    expect(
      NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS.filter((id) => id.startsWith('WOB_7503')),
    ).toEqual([
      'WOB_7503_2026_09_19',
      'WOB_7503_2026_09_27_EVENT_B',
      'WOB_7503_2026_09_15',
    ]);
  });

  it('R4A-ACC-3 population counts independent', () => {
    expect(CANONICAL_PHYSICAL_EVENT_IDS.length).toBe(14);
    expect(SUSPECT_PHYSICAL_EVENT_IDS.length).toBe(1);
    expect(POSITIVE_LABELED_PHYSICAL_EVENT_IDS.length).toBe(13);
    expect(DROP_CALIBRATION_ELIGIBLE_EVENT_IDS.length).toBe(6);
    expect(SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS.length).toBe(5);
    expect(LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS.length).toBe(5);
    expect(COMMITTED_FULL_REPLAY_FIXTURE_IDS.length).toBe(6);
    expect(SETTLING_TIMING_INELIGIBLE_EVENT_IDS).toEqual(['WOB_7503_2026_09_19']);
  });

  it('R4A-ACC-4 committed full-replay fixtures resolvable (fixture + spine, no fabrication)', () => {
    assertCommittedReplayCoverage();
  });

  it('R4A-MET-1 per-event calibration metrics for eligible N=6', () => {
    const metrics = computeAllR4aEligibleMetrics();
    expect(metrics.length).toBe(6);

    const byId = new Map(metrics.map((m) => [m.eventId, m]));
    for (const id of NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS) {
      expect(byId.has(id)).toBe(true);
    }

    const wob919 = byId.get('WOB_7503_2026_09_19')!;
    expect(wob919.settlingTimingCalibrationEligible).toBe(false);
    expect(wob919.peakToSettledElapsedMs).toBe(2_325_000);
    expect(wob919.maxPeakToSettledContinuityGapMs).toBeGreaterThan(2_000_000);

    const ks661 = byId.get('KS_MS_661_2026_09_30')!;
    expect(ks661.peakToSettledDropLiters).toBe(1);
    expect(ks661.r3aMaturityStatus).toBe('MATURE_SHADOW_READY');

    const summary = summarizeDropCalibration(metrics);
    expect(summary.n).toBe(6);
    expect(summary.dropMin).toBe(0);
    expect(summary.dropMax).toBe(1);
    expect(summary.dropMedian).toBe(0);
  });

  it('R4A-MET-2 documents per-event outcomes (not aggregate PASS only)', () => {
    const lines: string[] = [];
    for (const id of NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS) {
      const m = computeR4aPerEventMetrics(id)!;
      lines.push(
        [
          m.eventId,
          `dropL=${m.peakToSettledDropLiters}`,
          `ratio=${m.peakToSettledDropRatio?.toFixed(4) ?? 'null'}`,
          `elapsedMs=${m.peakToSettledElapsedMs}`,
          `continuityGapMs=${m.maxPeakToSettledContinuityGapMs}`,
          `r3a=${m.r3aMaturityStatus}`,
          `preFresh=${m.preBaselineFresh}`,
          `provenance=${m.sourceProvenance}`,
        ].join(' '),
      );
    }
    expect(lines.length).toBe(6);
    expect(lines.some((l) => l.includes('KS_MS_661_2026_09_30'))).toBe(true);
  });

  it('R4A-REP-1 adversarial replay preserves terminal F3 dominance + zero SAFETY_NEGATIVE leaks', () => {
    const results = replayAllCases();
    assertTerminalRejectionDominatesSettledPost(results);
    const sensitivity = runSensitivityGrid();
    const defaultHypothesis = sensitivity.defaultHypothesisPoint;
    expect(defaultHypothesis?.safetyNegativeUnexpectedReadyCount).toBe(0);
    expect(defaultHypothesis?.safetyNegativeResurrectionCount).toBe(0);
  });

  it('R4A-REP-2 defensible pack vs eligible six — no silent relabel', () => {
    const packIds = new Set(DEFENSIBLE_NATURAL_CALIBRATION_ROWS.map((r) => r.id));
    const eligible = new Set(NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS);
    expect(packIds.has('KS_MS_661_2026_09_06_OBSERVED')).toBe(true);
    expect(eligible.has('KS_MS_661_2026_09_06')).toBe(false);
    expect(packIds.has('WOB_7503_2026_09_24')).toBe(true);
    expect(eligible.has('WOB_7503_2026_09_24')).toBe(false);
    expect(eligible.has('WOB_7503_2026_09_15')).toBe(true);
  });

  it('R4A-REP-3 A12 second-refuel separation remains SAFETY_NEGATIVE', () => {
    const a12 = ADVERSARIAL_REPLAY_CASES.find((c) => c.id === 'A12');
    expect(a12?.expectedSemanticClass).toBe('SAFETY_NEGATIVE');
    const row = replayAllCases().find((r) => r.caseId === 'A12');
    expect(row?.SETTLED_MODEL_RESULT).not.toBe('READY_FOR_PERSIST');
  });
});
