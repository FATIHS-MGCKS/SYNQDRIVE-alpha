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
import { attributeChannelRiseToCanonicalEvent } from '../../../../../scripts/ops/rfrf-settled-post/rfrf-oq014-r4a-rise-attribution.lib';
import { scanRawFuelRisePhases } from './raw-fuel-rise-phase-scanner';
import { buildStructuralSymbolsFromDetectorConfig } from './raw-fuel-rise-phase-scanner.types';
import { RFRF_RISE_PHASE_SCANNER_POLICY_VERSION } from './raw-fuel-rise-phase-scanner.policy';
import { preBaselineFromChannelRise } from './raw-fuel-rise-phase-scanner.replay-support';

import {
  COMMITTED_FULL_REPLAY_FIXTURE_IDS,
  NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS,
  maxEventsFromSingleVehicle,
} from '../../../../../scripts/ops/rfrf-settled-post/rfrf-oq014-r4a-event-accounting';

/** EED-EV-0104 / R4A authoritative inventory — not all rows have committed replay spines. */
const NATURAL_ELIGIBLE_N = NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS.length;
const NATURAL_ELIGIBLE_VEHICLE_N = 3;
const COMMITTED_REPLAY_N = COMMITTED_FULL_REPLAY_FIXTURE_IDS.length;

const CALIBRATION_BUNDLE = {
  bundleVersion: 'replay-hypothesis-v1',
  classification: 'REPLAY_HYPOTHESIS' as const,
  maxPeakToSettledDropLiters: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  maxPeakToSettledDropRatioOfRise: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
};

function pickAttributedChannelRise(
  samples: NormalizedRawFuelSample[],
  row: { id: string; eventTimestamp: string; window: { from: string; to: string } },
) {
  const rises = detectChannelRises(samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
  const attribution = attributeChannelRiseToCanonicalEvent(rises, {
    eventId: row.id,
    eventTimestamp: new Date(row.eventTimestamp),
    episodeWindowFrom: new Date(row.window.from),
    episodeWindowTo: new Date(row.window.to),
  });
  return attribution.status === 'ATTRIBUTED' ? attribution.rise : null;
}

describe('R3A fleet replay metrics (EED-EV-0104 baseline)', () => {
  it('preserves population accounting and per-event F3 pre baselines', () => {
    expect(CALIBRATION_PACK_MANIFEST.defensibleNaturalRows).toBe(7);
    expect(NATURAL_ELIGIBLE_N).toBe(6);
    expect(NATURAL_ELIGIBLE_VEHICLE_N).toBe(3);
    const wob = maxEventsFromSingleVehicle(NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS);
    expect(wob.count).toBe(3);
    expect(wob.fraction).toBe(0.5);

    const replayable = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.filter((r) => r.samples.length > 0);
    /** Five in-pack series; sixth eligible (WOB 09-15) + KS MX 09-04 replay via EED-EV-0104 spine JSON (R4A metrics). */
    expect(replayable.length).toBe(5);
    expect(COMMITTED_REPLAY_N).toBe(6);

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

      const rise = pickAttributedChannelRise(norm.samples, row);
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
    expect(evaluated).toBeLessThanOrEqual(replayable.length);
    expect(skipped + evaluated).toBe(replayable.length);
    expect(EXCLUDED_SUSPECT_CONTROLS.length).toBeGreaterThan(0);
    expect(matureShadow).toBeGreaterThan(0);
    expect(drops.length).toBeGreaterThan(0);
  });
});
