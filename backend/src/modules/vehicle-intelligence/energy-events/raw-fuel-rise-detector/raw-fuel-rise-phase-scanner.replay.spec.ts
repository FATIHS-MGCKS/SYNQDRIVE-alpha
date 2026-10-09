import { detectChannelRises } from './raw-fuel-rise-state-machine';
import type { NormalizedRawFuelSample } from './raw-fuel-rise-normalizer';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from './raw-fuel-rise-detector.config';
import { normalizeRawFuelSamples } from './raw-fuel-rise-normalizer';
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
import { preBaselineFromChannelRise } from './raw-fuel-rise-phase-scanner.replay-support';

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
    const rise = pickPrimaryChannelRise(norm.samples);
    if (!rise) throw new Error('expected channel rise');
    expect(rise.lifecycleState).toBe('OBSERVED');

    const preBaseline = preBaselineFromChannelRise(rise);
    expect(preBaseline.fresh).toBe(true);

    const r3a = scanRawFuelRisePhases({
      samples: toScannerSamples(KS_MS_661_2026_09_30_NATURAL_SAMPLES),
      preBaseline,
      riseAnchors: { riseOnsetAt: rise.riseOnsetAt, riseEndAt: rise.riseEndAt },
      structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
      calibrationBundle: REPLAY_CALIBRATION,
      policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
      physicalIdentityAnchors: {
        prePlateauBucket: Math.round(preBaseline.medianLiters),
        riseOnsetAt: rise.riseOnsetAt,
        signalChannel: 'ABSOLUTE_LITERS',
      },
      f3Context: {
        lifecycleState: rise.lifecycleState,
        rejectionReason: rise.rejectionReason ?? null,
      },
      evidenceProvenance: { caseId: 'KS_MS_661_2026_09_30', tier: 'CRITICAL_PATH_FULL_REPLAY' },
    });

    expect(r3a.maturityStatus).toBe('MATURE_SHADOW_READY');
    expect(r3a.proposal.proposedPostLiters).toBe(19);
    expect(r3a.proposal.proposedDeltaLiters).toBe(13);
    expect(r3a.instantaneousPeakLiters).toBe(20);
  });

  it('adversarial A1–A12: explicit accounting and safety negatives', () => {
    const totalCases = ADVERSARIAL_REPLAY_CASES.length;
    expect(totalCases).toBe(13);

    let scanned = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    let safetyNegativeExamined = 0;
    let safetyReadyCount = 0;
    let positiveExamined = 0;
    const positiveReady: string[] = [];

    for (const def of ADVERSARIAL_REPLAY_CASES) {
      if (def.samples.length === 0) {
        skipped += 1;
        skipReasons.EMPTY_SAMPLES = (skipReasons.EMPTY_SAMPLES ?? 0) + 1;
        continue;
      }
      const norm = normalizeRawFuelSamples(
        def.samples,
        new Date(def.window.from),
        new Date(def.window.to),
        RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
      );
      if (!norm.ok) {
        skipped += 1;
        skipReasons.NORMALIZE_FAIL = (skipReasons.NORMALIZE_FAIL ?? 0) + 1;
        continue;
      }
      const rise = pickPrimaryChannelRise(norm.samples);
      if (!rise) {
        skipped += 1;
        skipReasons.NO_CHANNEL_RISE = (skipReasons.NO_CHANNEL_RISE ?? 0) + 1;
        continue;
      }

      const preBaseline = preBaselineFromChannelRise(rise);
      if (!preBaseline.fresh) {
        skipReasons.STALE_PRE_BASELINE = (skipReasons.STALE_PRE_BASELINE ?? 0) + 1;
      }

      scanned += 1;

      const f3Terminal = isCurrentF3TerminalSafetyRejection({
        lifecycleState: rise.lifecycleState,
        rejectionReason: rise.rejectionReason ?? null,
      });

      const r3a = scanRawFuelRisePhases({
        samples: toScannerSamples(def.samples),
        preBaseline,
        riseAnchors: { riseOnsetAt: rise.riseOnsetAt, riseEndAt: rise.riseEndAt },
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

      if (def.expectedSemanticClass === 'SAFETY_NEGATIVE') {
        safetyNegativeExamined += 1;
        if (r3a.maturityStatus === 'MATURE_SHADOW_READY') {
          safetyReadyCount += 1;
        }
      }
      if (def.expectedSemanticClass === 'POSITIVE_CONTROL') {
        positiveExamined += 1;
        if (r3a.maturityStatus === 'MATURE_SHADOW_READY') {
          positiveReady.push(def.id);
        }
      }
      if (f3Terminal) {
        expect(r3a.maturityStatus).not.toBe('MATURE_SHADOW_READY');
      }
    }

    expect(scanned + skipped).toBe(totalCases);
    expect(safetyNegativeExamined).toBeGreaterThan(0);
    expect(safetyReadyCount).toBe(0);
    expect(positiveReady).toEqual(expect.arrayContaining(['A8', 'A10_POS']));
    expect(positiveExamined).toBeGreaterThanOrEqual(2);
  });
});
