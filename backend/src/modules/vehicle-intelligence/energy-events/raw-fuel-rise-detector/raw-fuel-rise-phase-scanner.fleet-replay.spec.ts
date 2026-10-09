import {
  CALIBRATION_PACK_MANIFEST,
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
  EXCLUDED_SUSPECT_CONTROLS,
} from '../../../../../scripts/ops/rfrf-settled-post/settled-post-replay.fixtures';
import {
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
} from '../../../../../scripts/ops/rfrf-settled-post/settled-post-refuel-plateau.policy';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from './raw-fuel-rise-detector.config';
import { detectRawFuelRises } from './raw-fuel-rise-detector';
import { normalizeRawFuelSamples } from './raw-fuel-rise-normalizer';
import { buildDetectorPhysicsContext } from './testing/raw-fuel-rise-detector-test.util';
import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate/raw-refuel-candidate.types';
import { scanRawFuelRisePhases } from './raw-fuel-rise-phase-scanner';
import { buildStructuralSymbolsFromDetectorConfig } from './raw-fuel-rise-phase-scanner.types';
import { RFRF_RISE_PHASE_SCANNER_POLICY_VERSION } from './raw-fuel-rise-phase-scanner.policy';

function coalesceDate(...candidates: (Date | null | undefined)[]): Date {
  for (const candidate of candidates) {
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return candidate;
    }
  }
  return new Date(0);
}

function riseAnchorsFromCandidate(primary: RawRefuelCandidateObservation) {
  const riseOnsetAt = coalesceDate(
    primary.riseOnsetAt,
    primary.physicalEvidenceStart,
    primary.scanWindowStart,
  );
  const riseEndAt = coalesceDate(
    primary.riseEndAt,
    primary.physicalEvidenceEnd,
    primary.scanWindowEnd,
    riseOnsetAt,
  );
  return { riseOnsetAt, riseEndAt };
}

const CALIBRATION_BUNDLE = {
  bundleVersion: 'replay-hypothesis-v1',
  classification: 'REPLAY_HYPOTHESIS' as const,
  maxPeakToSettledDropLiters: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  maxPeakToSettledDropRatioOfRise: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
};

describe('R3A fleet replay metrics (EED-EV-0104 baseline)', () => {
  it('preserves eligible natural counts and reports shadow maturity distribution', () => {
    expect(CALIBRATION_PACK_MANIFEST.defensibleNaturalRows).toBe(7);
    const replayable = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.filter((r) => r.samples.length > 0);
    expect(replayable.length).toBe(5);

    let matureShadow = 0;
    let safetyNegativeReady = 0;
    const drops: number[] = [];

    for (const row of replayable) {
      const norm = normalizeRawFuelSamples(
        row.samples,
        new Date(row.window.from),
        new Date(row.window.to),
        RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
      );
      if (!norm.ok || row.samples.length === 0) continue;
      const ctx = buildDetectorPhysicsContext({
        organizationId: 'org',
        vehicleId: row.vehicle,
        scanWindowStart: new Date(row.window.from),
        scanWindowEnd: new Date(row.window.to),
      });
      const f3 = detectRawFuelRises({ context: ctx, samples: norm.samples });
      const primary = f3.candidates[0];
      if (!primary) continue;

      const r3a = scanRawFuelRisePhases({
        samples: row.samples
          .filter((s) => typeof s.absoluteLiters === 'number')
          .map((s) => ({ timestamp: s.timestamp, absoluteLiters: s.absoluteLiters as number })),
        preBaseline: { medianLiters: 6, fresh: true, staleReason: null },
        riseAnchors: riseAnchorsFromCandidate(primary),
        structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
        calibrationBundle: CALIBRATION_BUNDLE,
        policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
        physicalIdentityAnchors: null,
        f3Context: {
          lifecycleState: primary.lifecycleState,
          rejectionReason: primary.rejectionReason ?? null,
        },
        evidenceProvenance: { fleetRowId: row.id },
      });

      if (r3a.maturityStatus === 'MATURE_SHADOW_READY') matureShadow += 1;
      if (row.expectedSemanticClass === 'SAFETY_NEGATIVE' && r3a.maturityStatus === 'MATURE_SHADOW_READY') {
        safetyNegativeReady += 1;
      }
      if (r3a.peakToSettledDropLiters != null) drops.push(r3a.peakToSettledDropLiters);
    }

    expect(safetyNegativeReady).toBe(0);
    expect(EXCLUDED_SUSPECT_CONTROLS.length).toBeGreaterThan(0);
    expect(matureShadow).toBeGreaterThan(0);
    expect(drops.length).toBeGreaterThan(0);
  });
});
