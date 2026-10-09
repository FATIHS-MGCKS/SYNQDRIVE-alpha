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
import { normalizeRawFuelSamples } from './raw-fuel-rise-normalizer';
import type { NormalizedRawFuelSample } from './raw-fuel-rise-normalizer';
import { detectChannelRises } from './raw-fuel-rise-state-machine';
import { scanRawFuelRisePhases } from './raw-fuel-rise-phase-scanner';
import { buildStructuralSymbolsFromDetectorConfig } from './raw-fuel-rise-phase-scanner.types';
import { RFRF_RISE_PHASE_SCANNER_POLICY_VERSION } from './raw-fuel-rise-phase-scanner.policy';
import { preBaselineFromChannelRise } from './raw-fuel-rise-phase-scanner.replay-support';

/** EED-EV-0104 authoritative inventory — not all rows have committed replay spines. */
const NATURAL_ELIGIBLE_N = 6;
const NATURAL_ELIGIBLE_VEHICLE_N = 3;
const COMMITTED_REPLAY_N = 5;

const CALIBRATION_BUNDLE = {
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

describe('R3A fleet replay metrics (EED-EV-0104 baseline)', () => {
  it('preserves population accounting and per-event F3 pre baselines', () => {
    expect(CALIBRATION_PACK_MANIFEST.defensibleNaturalRows).toBe(7);
    expect(NATURAL_ELIGIBLE_N).toBe(6);
    expect(NATURAL_ELIGIBLE_VEHICLE_N).toBe(3);

    const replayable = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.filter((r) => r.samples.length > 0);
    expect(replayable.length).toBe(COMMITTED_REPLAY_N);

    let evaluated = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    let matureShadow = 0;
    const drops: number[] = [];

    for (const row of replayable) {
      const norm = normalizeRawFuelSamples(
        row.samples,
        new Date(row.window.from),
        new Date(row.window.to),
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
        skipped += 1;
        skipReasons.STALE_PRE_BASELINE = (skipReasons.STALE_PRE_BASELINE ?? 0) + 1;
        continue;
      }

      evaluated += 1;

      const r3a = scanRawFuelRisePhases({
        samples: row.samples
          .filter((s) => typeof s.absoluteLiters === 'number')
          .map((s) => ({ timestamp: s.timestamp, absoluteLiters: s.absoluteLiters as number })),
        preBaseline,
        riseAnchors: { riseOnsetAt: rise.riseOnsetAt, riseEndAt: rise.riseEndAt },
        structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
        calibrationBundle: CALIBRATION_BUNDLE,
        policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
        physicalIdentityAnchors: null,
        f3Context: {
          lifecycleState: rise.lifecycleState,
          rejectionReason: rise.rejectionReason ?? null,
        },
        evidenceProvenance: { fleetRowId: row.id, preMedian: preBaseline.medianLiters },
      });

      if (r3a.maturityStatus === 'MATURE_SHADOW_READY') matureShadow += 1;
      if (r3a.peakToSettledDropLiters != null) drops.push(r3a.peakToSettledDropLiters);
    }

    expect(evaluated).toBeGreaterThan(0);
    expect(evaluated).toBeLessThanOrEqual(COMMITTED_REPLAY_N);
    expect(skipped + evaluated).toBe(COMMITTED_REPLAY_N);
    expect(EXCLUDED_SUSPECT_CONTROLS.length).toBeGreaterThan(0);
    expect(matureShadow).toBeGreaterThan(0);
    expect(drops.length).toBeGreaterThan(0);
  });
});
