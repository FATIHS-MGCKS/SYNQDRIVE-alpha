import * as fs from 'fs';
import * as path from 'path';
import { detectChannelRises } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import { normalizeRawFuelSamples } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { scanRawFuelRisePhases } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner';
import {
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
} from './settled-post-refuel-plateau.policy';
import {
  buildStructuralSymbolsFromDetectorConfig,
} from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner.types';
import { RFRF_RISE_PHASE_SCANNER_POLICY_VERSION } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner.policy';
import { preBaselineFromChannelRise } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner.replay-support';
import { resolveCanonicalEventAnchors } from './rfrf-oq014-r4a-canonical-event-anchors.lib';
import { NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS } from './rfrf-oq014-r4a-event-accounting';
import {
  crossCheckSpineAgainstAgentDimoExtract,
  loadR4bWob7503SpineArtifact,
  validateR4bWob7503SpineProvenance,
} from './rfrf-oq014-r4b-spine-validation.lib';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ADMISSION_JSON = path.join(
  REPO_ROOT,
  'architecture/knowledge-graphs/energy-event-detection/evidence/data/RFRF-OQ014-R4B-WOB-7503-2026-10-09-ADMISSION.json',
);

describe('RFRF OQ-014 R4B — WOB 7503 2026-10-09 evidence admission', () => {
  const spine = loadR4bWob7503SpineArtifact();

  it('R4B-ADM-1 validates 109-sample spine provenance and 3040s gap', () => {
    const validation = validateR4bWob7503SpineProvenance(spine);
    expect(validation.errors).toEqual([]);
    expect(spine.sampleCount).toBe(109);
    expect(spine.maxObservationGapSeconds).toBe(3040);
    expect(spine.telemetryObservationGaps.some((g) => g.durationSeconds === 3040)).toBe(true);
    expect(spine.r4bAdmissionGrade).toBe('BOUNDED_SPINE_EXTRACT_REPLAYABLE_NOT_CALIBRATION_GRADE');
  });

  it('R4B-ADM-1b committed spine matches agent DIMO extract when present', () => {
    const cross = crossCheckSpineAgainstAgentDimoExtract(spine);
    if (cross.skipped) {
      return;
    }
    expect(cross.errors).toEqual([]);
  });

  it('R4B-ADM-2 admission manifest matches spine and canonical production UUID', () => {
    const manifest = JSON.parse(fs.readFileSync(ADMISSION_JSON, 'utf8'));
    expect(manifest.eventId).toBe('WOB_7503_2026_10_09');
    expect(manifest.groundTruth.userPumpLiters).toBe(18.11);
    expect(manifest.groundTruth.dimoMeasuredRiseLiters).toBe(18);
    expect(manifest.productionCanonical.canonicalVehicleEnergyEventId).toBe(
      '412f17f7-7380-4dd0-8e24-6939be4809d6',
    );
    expect(manifest.notPromotedToR4aEligibleN).toBe(true);
    expect(manifest.calibrationDecision).toBe('CALIBRATION_INSUFFICIENT');
    expect(NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS).not.toContain('WOB_7503_2026_10_09');
  });

  it('R4B-ADM-3 per-axis eligibility — quantity usable, timing/locality excluded', () => {
    const axes = spine.calibrationPopulationStatus;
    expect(axes.quantityValidation).toMatch(/USABLE/);
    expect(axes.physicalEventIdentity).toMatch(/PROVEN/);
    expect(axes.settlingTimingCalibration).toMatch(/EXCLUDED/);
    expect(axes.localityCalibration).toMatch(/EXCLUDED/);
    expect(axes.dropCalibrationEligibleN).toBe(false);
    expect(axes.authoritativeCalibrationMetricEligible).toBe(false);
  });

  it('R4B-ADM-4 forensic canonical anchor from native VEE rise start (not user pump time)', () => {
    const anchors = resolveCanonicalEventAnchors(
      'WOB_7503_2026_10_09',
      null,
      spine.canonicalPhysicalEpisode,
    );
    expect(anchors.canonicalRefuelTimestampUtc).toBe('2026-10-09T18:48:52.000Z');
    expect(anchors.canonicalRefuelTimestampProvenance).toBe('PRODUCTION_FORENSIC_PHYSICAL_EPISODE');
    expect(anchors.canonicalRefuelTimestampUtc).not.toBe(spine.userReportedGroundTruth.approxRefuelAnchorUtc);
  });

  it('R4B-ADM-5 offline R3A replay on committed spine (REPLAY_HYPOTHESIS)', () => {
    const rawSpine = JSON.parse(
      fs.readFileSync(
        path.join(
          REPO_ROOT,
          'architecture/knowledge-graphs/energy-event-detection/evidence/data/EED-EV-0110-WOB-L-7503-2026-10-09-ABSOLUTE-SPINE.json',
        ),
        'utf8',
      ),
    ) as { queryWindowUtc: { from: string; to: string } };
    const rawSamples = spine.samples
      .filter((s) => s.absoluteLiters != null)
      .map((s) => ({
        timestamp: new Date(s.timestamp),
        absoluteLiters: s.absoluteLiters as number,
        relativePercent: s.relativePercent,
      }));
    const norm = normalizeRawFuelSamples(
      rawSamples,
      new Date(rawSpine.queryWindowUtc.from),
      new Date(rawSpine.queryWindowUtc.to),
      RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
    );
    if (!norm.ok) {
      throw new Error(`normalize failed: ${norm.reason}`);
    }
    const rises = detectChannelRises(norm.samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
    expect(rises.length).toBeGreaterThanOrEqual(1);
    const rise = rises.reduce((best, r) =>
      r.riseOnsetAt > best.riseOnsetAt ? r : best,
    );
    const preBaseline = preBaselineFromChannelRise(rise);
    const r3a = scanRawFuelRisePhases({
      samples: norm.samples
        .filter((s) => typeof s.absoluteLiters === 'number')
        .map((s) => ({ timestamp: s.timestamp, absoluteLiters: s.absoluteLiters as number })),
      preBaseline,
      riseAnchors: { riseOnsetAt: rise.riseOnsetAt, riseEndAt: rise.riseEndAt },
      structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
      calibrationBundle: {
        bundleVersion: 'replay-hypothesis-v1',
        classification: 'REPLAY_HYPOTHESIS',
        maxPeakToSettledDropLiters: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
        maxPeakToSettledDropRatioOfRise: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
        maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
      },
      policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
      physicalIdentityAnchors: null,
      f3Context: { lifecycleState: 'READY_FOR_PERSIST', rejectionReason: null },
      evidenceProvenance: { fleetRowId: 'WOB_7503_2026_10_09', preMedian: preBaseline.medianLiters },
    });
    expect(r3a.maturityStatus).toBe('MATURE_SHADOW_READY');
    expect(preBaseline.medianLiters).toBe(6);
    const peak = Math.max(...rise.risePoints.map((p) => p.value));
    expect(peak).toBeGreaterThanOrEqual(23);
  });
});
