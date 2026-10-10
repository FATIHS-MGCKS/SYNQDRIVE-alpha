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
  derivePopulationCountsFromRegistry,
  validateR4aEventAccountingRegistry,
} from './rfrf-oq014-r4a-event-accounting-validation.lib';
import {
  assertCommittedReplayCoverage,
  buildR4aPerEventCalibrationEvidenceArtifact,
  computeAllR4aEligibleMetrics,
  computeR4aPerEventMetrics,
  KS_MS_661_CANONICAL_CALIBRATION_EVENT_ID,
  isAuthoritativeCalibrationMetric,
  summarizeDropCalibration,
} from './rfrf-oq014-r4a-calibration-metrics.lib';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ACCOUNTING_JSON_PATH = path.join(
  REPO_ROOT,
  'architecture/knowledge-graphs/energy-event-detection/evidence/data/RFRF-OQ014-R4A-EVENT-ACCOUNTING.json',
);
const PER_EVENT_EVIDENCE_JSON_PATH = path.join(
  REPO_ROOT,
  'architecture/knowledge-graphs/energy-event-detection/evidence/data/RFRF-OQ014-R4A-PER-EVENT-CALIBRATION-RESULTS.json',
);

describe('RFRF OQ-014 R4A calibration integrity (offline)', () => {
  it('R4A-ACC-1 registry validation + JSON population counts from membership', () => {
    const validationErrors = validateR4aEventAccountingRegistry();
    expect(validationErrors).toEqual([]);

    const derived = derivePopulationCountsFromRegistry();
    const json = JSON.parse(fs.readFileSync(ACCOUNTING_JSON_PATH, 'utf8')) as {
      naturalCalibrationEligibleEventIds: string[];
      populationCounts: Record<string, number>;
      wobConcentration: { count: number; fraction: number };
    };

    expect(json.naturalCalibrationEligibleEventIds).toEqual([
      ...NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS,
    ]);
    expect(json.populationCounts).toEqual(derived);
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

  it('R4A-ACC-3 population counts derived from canonical membership', () => {
    const derived = derivePopulationCountsFromRegistry();
    expect(derived.canonicalPhysical).toBe(15);
    expect(derived.suspectPhysical).toBe(1);
    expect(derived.positiveLabeledPhysical).toBe(14);
    expect(derived.dropCalibrationEligible).toBe(6);
    expect(derived.settlingTimingCalibrationEligible).toBe(5);
    expect(derived.localityCalibrationEligible).toBe(5);
    expect(derived.committedFullReplayFixture).toBe(6);
    expect(derived.independentVehicleCount).toBe(3);

    expect(SUSPECT_PHYSICAL_EVENT_IDS.length).toBe(derived.suspectPhysical);
    expect(POSITIVE_LABELED_PHYSICAL_EVENT_IDS.length).toBe(derived.positiveLabeledPhysical);
    expect(DROP_CALIBRATION_ELIGIBLE_EVENT_IDS.length).toBe(derived.dropCalibrationEligible);
    expect(SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS.length).toBe(
      derived.settlingTimingCalibrationEligible,
    );
    expect(LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS.length).toBe(derived.localityCalibrationEligible);
    expect(COMMITTED_FULL_REPLAY_FIXTURE_IDS.length).toBe(derived.committedFullReplayFixture);
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
    expect(wob919.riseAttributionStatus).toBe('ATTRIBUTED');
    if (wob919.maxSettledWindowInternalGapMs != null) {
      expect(wob919.maxSettledWindowInternalGapMs).not.toBe(
        RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs,
      );
    }

    const ks661 = byId.get(KS_MS_661_CANONICAL_CALIBRATION_EVENT_ID)!;
    expect(ks661.peakToSettledDropLiters).toBe(1);
    expect(ks661.r3aMaturityStatus).toBe('MATURE_SHADOW_READY');
    expect(ks661.riseAttributionStatus).toBe('ATTRIBUTED');

    const wob915 = byId.get('WOB_7503_2026_09_15')!;
    expect(wob915.sourceProvenanceGrade).toBe(
      'BOUNDED_SPINE_EXTRACT_REPLAYABLE_NOT_CALIBRATION_GRADE',
    );
    expect(wob915.riseAttributionStatus).toBe('UNVERIFIED_EVENT_ANCHOR');
    expect(wob915.authoritativeCalibrationMetricEligible).toBe(false);
    expect(wob915.canonicalEventAnchor.firstSampleTimestampUtc).not.toBe(
      wob915.canonicalEventAnchor.canonicalRefuelTimestampUtc,
    );

    const ksMx904 = byId.get('KS_MX_2024_2026_09_04')!;
    expect(ksMx904.sourceProvenanceGrade).toBe(
      'BOUNDED_SPINE_EXTRACT_REPLAYABLE_NOT_CALIBRATION_GRADE',
    );

    const summary = summarizeDropCalibration(metrics);
    expect(summary.populationN).toBe(6);
    expect(summary.authoritativeN).toBe(metrics.filter(isAuthoritativeCalibrationMetric).length);
    expect(summary.authoritativeN).toBeLessThan(6);
    expect(summary.dropMin).toBe(0);
    expect(summary.dropMax).toBe(1);
  });

  it('R4A-MET-2 committed per-event CI evidence artifact matches live computation', () => {
    const live = buildR4aPerEventCalibrationEvidenceArtifact();
    expect(live.schemaVersion).toBe('rfrf-oq014-r4a-per-event-calibration-v3');
    expect(live.events.length).toBe(6);
    expect(live.dropCalibrationPopulationN).toBe(6);
    expect(live.authoritativeCalibrationMetricN).toBeLessThan(6);
    expect(live.calibrationDecision).toBe('CALIBRATION_INSUFFICIENT');
    expect(live.evidenceAcquisitionPlanningTargets.note).toContain('Planning targets');

    const committed = JSON.parse(fs.readFileSync(PER_EVENT_EVIDENCE_JSON_PATH, 'utf8'));
    expect(committed).toEqual(live);
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
