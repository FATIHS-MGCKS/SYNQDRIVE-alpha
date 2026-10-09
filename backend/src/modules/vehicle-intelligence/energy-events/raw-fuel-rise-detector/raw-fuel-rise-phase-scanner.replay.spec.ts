import { detectRawFuelRises } from './raw-fuel-rise-detector';
import { detectChannelRises } from './raw-fuel-rise-state-machine';
import type { NormalizedRawFuelSample } from './raw-fuel-rise-normalizer';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from './raw-fuel-rise-detector.config';
import { normalizeRawFuelSamples } from './raw-fuel-rise-normalizer';
import { buildDetectorPhysicsContext } from './testing/raw-fuel-rise-detector-test.util';
import type { RawRefuelCandidateObservation } from '../raw-refuel-candidate/raw-refuel-candidate.types';
import {
  ADVERSARIAL_REPLAY_CASES,
  KS_MS_661_2026_09_30_NATURAL_SAMPLES,
} from '../../../../../scripts/ops/rfrf-settled-post/settled-post-replay.fixtures';
import {
  isCurrentF3TerminalSafetyRejection,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
} from '../../../../../scripts/ops/rfrf-settled-post/settled-post-refuel-plateau.policy';
import { scanRawFuelRisePhases } from './raw-fuel-rise-phase-scanner';
import {
  buildStructuralSymbolsFromDetectorConfig,
  type RawFuelRisePhaseScannerSample,
} from './raw-fuel-rise-phase-scanner.types';
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

function f3ContextFromCandidate(primary: RawRefuelCandidateObservation) {
  return {
    lifecycleState: primary.lifecycleState,
    rejectionReason: primary.rejectionReason ?? null,
  };
}

const REPLAY_CALIBRATION = {
  bundleVersion: 'replay-hypothesis-v1',
  classification: 'REPLAY_HYPOTHESIS' as const,
  maxPeakToSettledDropLiters: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  maxPeakToSettledDropRatioOfRise: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
};

function pickPrimaryChannelRise(samples: NormalizedRawFuelSample[]) {
  const rises = detectChannelRises(samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
  if (rises.length === 0) return null;
  return rises.reduce((best, r) => {
    const peak = Math.max(...r.risePoints.map((p) => p.value));
    const bestPeak = Math.max(...best.risePoints.map((p) => p.value));
    return peak > bestPeak ? r : best;
  });
}

function toScannerSamples(
  samples: { timestamp: Date; absoluteLiters?: number | null }[],
): RawFuelRisePhaseScannerSample[] {
  return samples
    .filter((s) => typeof s.absoluteLiters === 'number')
    .map((s) => ({ timestamp: s.timestamp, absoluteLiters: s.absoluteLiters as number }));
}

describe('R3A phase scanner — offline replay bridge', () => {
  it('KS MS 661 2026-09-30 critical path: F3 unchanged, R3A settles 19 L shadow', () => {
    const window = {
      from: '2026-09-30T04:35:00.000Z',
      to: '2026-09-30T11:30:00.000Z',
    };
    const norm = normalizeRawFuelSamples(
      KS_MS_661_2026_09_30_NATURAL_SAMPLES,
      new Date(window.from),
      new Date(window.to),
      RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
    );
    if (!norm.ok) {
      throw new Error(`normalize failed: ${norm.reason}`);
    }
    const ctx = buildDetectorPhysicsContext({
      organizationId: 'org',
      vehicleId: 'veh',
      scanWindowStart: new Date(window.from),
      scanWindowEnd: new Date(window.to),
    });
    const f3 = detectRawFuelRises({ context: ctx, samples: norm.samples });
    expect(f3.candidates.length).toBeGreaterThan(0);
    const primary = f3.candidates[0];
    expect(primary.lifecycleState).toBe('OBSERVED');

    const r3a = scanRawFuelRisePhases({
      samples: toScannerSamples(KS_MS_661_2026_09_30_NATURAL_SAMPLES),
      preBaseline: { medianLiters: 6, fresh: true, staleReason: null },
      riseAnchors: riseAnchorsFromCandidate(primary),
      structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
      calibrationBundle: REPLAY_CALIBRATION,
      policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
      physicalIdentityAnchors: {
        prePlateauBucket: 6,
        riseOnsetAt: riseAnchorsFromCandidate(primary).riseOnsetAt,
        signalChannel: 'ABSOLUTE_LITERS',
      },
      f3Context: f3ContextFromCandidate(primary),
      evidenceProvenance: { caseId: 'KS_MS_661_2026_09_30', tier: 'CRITICAL_PATH_FULL_REPLAY' },
    });

    expect(r3a.maturityStatus).toBe('MATURE_SHADOW_READY');
    expect(r3a.proposal.proposedPostLiters).toBe(19);
    expect(r3a.proposal.proposedDeltaLiters).toBe(13);
    expect(r3a.instantaneousPeakLiters).toBe(20);
  });

  it('adversarial A1–A12: SAFETY_NEGATIVE never MATURE_SHADOW_READY', () => {
    let safetyReadyCount = 0;
    for (const def of ADVERSARIAL_REPLAY_CASES) {
      if (def.samples.length === 0) continue;
      const norm = normalizeRawFuelSamples(
        def.samples,
        new Date(def.window.from),
        new Date(def.window.to),
        RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
      );
      if (!norm.ok) {
        continue;
      }
      const rise = pickPrimaryChannelRise(norm.samples);
      if (!rise) continue;

      const f3Terminal = isCurrentF3TerminalSafetyRejection({
        lifecycleState: rise.lifecycleState,
        rejectionReason: rise.rejectionReason ?? null,
      });

      const r3a = scanRawFuelRisePhases({
        samples: toScannerSamples(def.samples),
        preBaseline: {
          medianLiters: rise.prePlateau.median,
          fresh: true,
          staleReason: null,
        },
        riseAnchors: {
          riseOnsetAt: rise.riseOnsetAt,
          riseEndAt: rise.riseEndAt,
        },
        structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
        calibrationBundle: REPLAY_CALIBRATION,
        policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
        physicalIdentityAnchors: null,
        f3Context: {
          lifecycleState: rise.lifecycleState,
          rejectionReason: rise.rejectionReason ?? null,
        },
        evidenceProvenance: { adversarialId: def.id },
      });

      if (def.expectedSemanticClass === 'SAFETY_NEGATIVE' && r3a.maturityStatus === 'MATURE_SHADOW_READY') {
        safetyReadyCount += 1;
      }
      if (f3Terminal) {
        expect(r3a.maturityStatus).not.toBe('MATURE_SHADOW_READY');
      }
    }
    expect(safetyReadyCount).toBe(0);
  });
});
