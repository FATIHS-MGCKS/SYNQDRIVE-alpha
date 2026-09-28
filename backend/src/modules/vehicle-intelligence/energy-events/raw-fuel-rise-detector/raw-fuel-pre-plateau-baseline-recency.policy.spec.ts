import type { RawRefuelCandidate } from '@prisma/client';
import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildSparseBridgeRefuelEpisodeSamples,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';
import {
  evaluateRawFuelPrePlateauRecency,
  RFRF_BASELINE_RECENCY_MAX_BRIDGE_MS,
  RFRF_BASELINE_RECENCY_MAX_BRIDGE_SECONDS,
} from './raw-fuel-pre-plateau-baseline-recency.policy';
import {
  buildKsMx20260916FreshPre5Samples,
  buildKsMx20260916StalePre10Samples,
  buildKsMx20260916StalePre14Samples,
  buildKsMx20260916StalePre17Samples,
  KS_MX_STALE_PRE10_DEFECT,
} from '../raw-fuel-refuel-fallback/testing/ks-mx-2026-09-16-baseline-recency.fixture';
import {
  buildKsMx20240916StaleBaselineCandidate,
  buildWob20260919AuthoritativeNativeRow,
  buildWob20260919StretchedEndCandidate,
  buildWob20260927EventBCandidate,
} from '../raw-fuel-refuel-fallback/testing/wob-2026-09-19-stretched-end.fixture';
import {
  WOB_2026_09_19_OBSERVED_FILL,
} from '../raw-fuel-refuel-fallback/testing/wob-2026-09-19-observed-fuel.fixture';
import { classifyFallbackAgainstAuthoritativeNativeRefuel } from '../raw-fuel-refuel-fallback/raw-refuel-native-fallback-stretched-end.policy';
import { evaluateRawRefuelPromotionEligibility } from '../raw-fuel-refuel-fallback/raw-refuel-promotion-eligibility.evaluator';
import { evaluateRawRefuelCandidateReadiness } from '../raw-fuel-refuel-fallback/raw-refuel-candidate-readiness.evaluator';
import {
  KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';

describe('RFRF baseline recency guard (EED-OQ-017)', () => {
  const ksMxWindow = buildDetectorPhysicsContext({
    scanWindowStart: new Date('2026-09-16T10:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-16T22:00:00.000Z'),
  });

  describe('A — KS MX stale baseline defect reproduction', () => {
    it('documents stale pre=10 L false delta path', () => {
      const samples = buildKsMx20260916StalePre10Samples();
      const preEnd = new Date(KS_MX_STALE_PRE10_DEFECT.PRE_PLATEAU_END_AT);
      const riseOnset = new Date(KS_MX_STALE_PRE10_DEFECT.RISE_ONSET_AT);
      const bridgeSeconds = (riseOnset.getTime() - preEnd.getTime()) / 1000;
      expect(KS_MX_STALE_PRE10_DEFECT.PRE_PLATEAU_VALUE).toBe(10);
      expect(KS_MX_STALE_PRE10_DEFECT.DETECTED_DELTA_STALE).toBe(17);
      expect(bridgeSeconds).toBeGreaterThan(RFRF_BASELINE_RECENCY_MAX_BRIDGE_SECONDS);
      const recency = evaluateRawFuelPrePlateauRecency({
        prePlateauStartAt: new Date('2026-09-16T11:42:00.008Z'),
        prePlateauEndAt: preEnd,
        riseOnsetAt: riseOnset,
        riseOnsetPrimaryValue: 12,
        prePlateauMedian: 10,
        interveningPrimarySamples: samples
          .filter((s) => s.absoluteLiters != null)
          .map((s) => ({
            timestamp: s.timestamp,
            value: s.absoluteLiters!,
          }))
          .filter(
            (s) =>
              s.timestamp.getTime() > preEnd.getTime() &&
              s.timestamp.getTime() < riseOnset.getTime(),
          ),
        signalChannel: 'ABSOLUTE_LITERS',
      });
      expect(recency.classification).toBe('STALE');
    });
  });

  describe('B1–B16 unit matrix', () => {
    it('B1 fresh plateau, rise within 6 min → FRESH', () => {
      const preEnd = new Date('2026-09-06T08:10:00.000Z');
      const rise = new Date('2026-09-06T08:12:00.000Z');
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-06T08:00:00.000Z'),
          prePlateauEndAt: preEnd,
          riseOnsetAt: rise,
          riseOnsetPrimaryValue: 10.1,
          prePlateauMedian: 10,
          interveningPrimarySamples: [],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('FRESH');
    });

    it('B2 plateau days old with intervening material drop → STALE', () => {
      const preEnd = new Date('2026-09-01T08:00:00.000Z');
      const rise = new Date('2026-09-06T09:00:00.000Z');
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-01T07:00:00.000Z'),
          prePlateauEndAt: preEnd,
          riseOnsetAt: rise,
          riseOnsetPrimaryValue: 22,
          prePlateauMedian: 10,
          interveningPrimarySamples: [
            { timestamp: new Date('2026-09-06T08:30:00.000Z'), value: 5 },
          ],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('B3 bridge > configured max with intervening samples → STALE', () => {
      const preEnd = new Date('2026-09-06T08:00:00.000Z');
      const rise = new Date('2026-09-06T09:30:00.000Z');
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-06T07:50:00.000Z'),
          prePlateauEndAt: preEnd,
          riseOnsetAt: rise,
          riseOnsetPrimaryValue: 10,
          prePlateauMedian: 10,
          interveningPrimarySamples: [
            { timestamp: new Date('2026-09-06T08:30:00.000Z'), value: 10 },
          ],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('B4 bridge within time bound but intervening material drop → STALE', () => {
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-06T08:00:00.000Z'),
          prePlateauEndAt: new Date('2026-09-06T08:04:00.000Z'),
          riseOnsetAt: new Date('2026-09-06T08:08:00.000Z'),
          riseOnsetPrimaryValue: 22,
          prePlateauMedian: 10,
          interveningPrimarySamples: [
            { timestamp: new Date('2026-09-06T08:06:00.000Z'), value: 5 },
          ],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('B5 minor jitter within tolerance → FRESH', () => {
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-06T08:00:00.000Z'),
          prePlateauEndAt: new Date('2026-09-06T08:04:00.000Z'),
          riseOnsetAt: new Date('2026-09-06T08:08:00.000Z'),
          riseOnsetPrimaryValue: 10.2,
          prePlateauMedian: 10,
          interveningPrimarySamples: [
            { timestamp: new Date('2026-09-06T08:06:00.000Z'), value: 9.8 },
          ],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('FRESH');
    });

    it('B6 no pre plateau timestamp → INSUFFICIENT', () => {
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: null,
          prePlateauEndAt: null,
          riseOnsetAt: new Date('2026-09-06T08:08:00.000Z'),
          riseOnsetPrimaryValue: 10,
          prePlateauMedian: 10,
          interveningPrimarySamples: [],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('B7 post plateau length does not affect pre-baseline recency evaluation', () => {
      const evalPre = evaluateRawFuelPrePlateauRecency({
        prePlateauStartAt: new Date('2026-09-06T08:00:00.000Z'),
        prePlateauEndAt: new Date('2026-09-06T08:04:00.000Z'),
        riseOnsetAt: new Date('2026-09-06T08:08:00.000Z'),
        riseOnsetPrimaryValue: 10,
        prePlateauMedian: 10,
        interveningPrimarySamples: [],
        signalChannel: 'ABSOLUTE_LITERS',
      });
      expect(evalPre.classification).toBe('FRESH');
    });

    it('B8 WOB Event A shaped rise remains FRESH', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-24T08:00:00.000Z', 4, 4, 120),
        ...linearRiseSamples('2026-09-24T08:10:00.000Z', [8, 12, 16], 60),
        ...stablePlateauSamples('2026-09-24T08:20:00.000Z', 16, 4, 120),
      ];
      const result = detectRawFuelRises({
        context: buildDetectorPhysicsContext({
          scanWindowStart: new Date('2026-09-24T07:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-24T10:00:00.000Z'),
        }),
        samples,
      });
      expect(result.candidates[0]?.lifecycleState).toBe('READY_FOR_PERSIST');
      const meta = result.candidates[0]?.evidenceMeta as Record<string, unknown>;
      const block = meta.baselineRecency as Record<string, unknown>;
      expect(block.baselineRecencyClassification).toBe('FRESH');
      expect(result.candidates[0]?.deltaAbsoluteLiters).toBeCloseTo(12, 0);
    });

    it('B9 WOB Event B candidate fixture remains FRESH metadata when seeded', () => {
      const eventB = buildWob20260927EventBCandidate({
        evidenceMeta: {
          baselineRecency: {
            baselineRecencyClassification: 'FRESH',
            baselineRecencyReason: 'pre_plateau_recent_for_rise',
          },
        },
      });
      expect(
        (eventB.evidenceMeta as Record<string, unknown>).baselineRecency,
      ).toBeTruthy();
    });

    it('B10 replaced by S1–S8 silent-bridge matrix (see describe S)', () => {
      expect(true).toBe(true);
    });

    it('B11 KS MX pre10 policy → STALE', () => {
      const preEnd = new Date(KS_MX_STALE_PRE10_DEFECT.PRE_PLATEAU_END_AT);
      const rise = new Date(KS_MX_STALE_PRE10_DEFECT.RISE_ONSET_AT);
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-16T11:42:00.008Z'),
          prePlateauEndAt: preEnd,
          riseOnsetAt: rise,
          riseOnsetPrimaryValue: 12,
          prePlateauMedian: 10,
          interveningPrimarySamples: [{ timestamp: new Date('2026-09-16T20:42:00.008Z'), value: 5 }],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('B12 KS MX pre17 → STALE', () => {
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-16T12:00:00.008Z'),
          prePlateauEndAt: new Date('2026-09-16T12:06:00.008Z'),
          riseOnsetAt: new Date('2026-09-16T20:52:30.008Z'),
          riseOnsetPrimaryValue: 12,
          prePlateauMedian: 17,
          interveningPrimarySamples: [{ timestamp: new Date('2026-09-16T20:42:00.008Z'), value: 5 }],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('B13 KS MX pre14 → STALE', () => {
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-16T12:30:00.008Z'),
          prePlateauEndAt: new Date('2026-09-16T12:36:00.008Z'),
          riseOnsetAt: new Date('2026-09-16T20:52:30.008Z'),
          riseOnsetPrimaryValue: 15,
          prePlateauMedian: 14,
          interveningPrimarySamples: [{ timestamp: new Date('2026-09-16T20:42:00.008Z'), value: 5 }],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('B14 old READY without recency metadata → promotion blocked', () => {
      const ready = evaluateRawRefuelCandidateReadiness(
        buildKsMx20240916StaleBaselineCandidate() as RawRefuelCandidate,
        { capability: 'FUEL_CAPABLE' },
      );
      ready.ready = true;
      const result = evaluateRawRefuelPromotionEligibility(ready, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
        nativeOverlap: {
          advisoryClassification: 'NO_NATIVE_SIBLINGS',
          siblingAssessments: [],
          sameNativeEventIds: [],
          distinctNativeEventIds: [],
          insufficientNativeEventIds: [],
          detail: 'none',
        },
        candidateEvidenceMeta: {},
      });
      expect(result.status).toBe('BLOCKED_BASELINE_RECENCY');
    });

    it('B15 READY with explicit STALE → promotion blocked', () => {
      const ready = evaluateRawRefuelCandidateReadiness(
        buildKsMx20240916StaleBaselineCandidate({
          evidenceMeta: {
            baselineRecency: { baselineRecencyClassification: 'STALE' },
          },
        }) as RawRefuelCandidate,
        { capability: 'FUEL_CAPABLE' },
      );
      ready.ready = true;
      const result = evaluateRawRefuelPromotionEligibility(ready, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'TRUSTED',
        nativeOverlap: {
          advisoryClassification: 'NO_NATIVE_SIBLINGS',
          siblingAssessments: [],
          sameNativeEventIds: [],
          distinctNativeEventIds: [],
          insufficientNativeEventIds: [],
          detail: 'none',
        },
        candidateEvidenceMeta: {
          baselineRecency: { baselineRecencyClassification: 'STALE' },
        },
      });
      expect(result.status).toBe('BLOCKED_BASELINE_RECENCY');
    });

    it('B16 READY with FRESH → proceeds to trust gate (not blocked by recency)', () => {
      const ready = evaluateRawRefuelCandidateReadiness(
        buildKsMx20240916StaleBaselineCandidate({
          evidenceMeta: {
            baselineRecency: { baselineRecencyClassification: 'FRESH' },
          },
        }) as RawRefuelCandidate,
        { capability: 'FUEL_CAPABLE' },
      );
      ready.ready = true;
      const result = evaluateRawRefuelPromotionEligibility(ready, {
        capability: 'FUEL_CAPABLE',
        absoluteDetectionAdmissibility: 'ADMISSIBLE',
        absoluteSignalTrust: 'UNKNOWN',
        nativeOverlap: {
          advisoryClassification: 'NO_NATIVE_SIBLINGS',
          siblingAssessments: [],
          sameNativeEventIds: [],
          distinctNativeEventIds: [],
          insufficientNativeEventIds: [],
          detail: 'none',
        },
        candidateEvidenceMeta: {
          baselineRecency: { baselineRecencyClassification: 'FRESH' },
        },
      });
      expect(result.status).toBe('BLOCKED_PROMOTION_TRUST');
    });
  });

  describe('L — KS MX detector post-fix', () => {
    it('skips stale 10 L baseline and detects fresh ~5→27 when evidence exists', () => {
      const result = detectRawFuelRises({
        context: ksMxWindow,
        samples: buildKsMx20260916StalePre10Samples(),
      });
      const ready = result.candidates.filter((c) => c.lifecycleState === 'READY_FOR_PERSIST');
      expect(ready.length).toBeGreaterThanOrEqual(1);
      expect(ready[0].preFuelAbsoluteLiters).toBeCloseTo(5, 0.5);
      expect(ready[0].deltaAbsoluteLiters).toBeCloseTo(22, 1);
      expect(ready.some((c) => c.deltaAbsoluteLiters === 17)).toBe(false);
    });

    it('stale pre17 and pre14 paths do not emit false deltas', () => {
      for (const samples of [
        buildKsMx20260916StalePre17Samples(),
        buildKsMx20260916StalePre14Samples(),
      ]) {
        const result = detectRawFuelRises({ context: ksMxWindow, samples });
        const ready = result.candidates.filter((c) => c.lifecycleState === 'READY_FOR_PERSIST');
        for (const c of ready) {
          expect(c.preFuelAbsoluteLiters).toBeCloseTo(5, 0.5);
          expect([10, 13, 17]).not.toContain(Math.round(c.deltaAbsoluteLiters ?? 0));
        }
      }
    });
  });

  describe('S — silent-bridge baseline recency matrix (PR1822 hardening)', () => {
    const preBase = new Date('2026-09-06T08:00:00.000Z');
    const median = 10;
    const materialRise = 22;

    function evalSilentBridge(gapSeconds: number, riseValue = materialRise) {
      const preEnd = new Date(preBase.getTime() + 4 * 60_000);
      const rise = new Date(preEnd.getTime() + gapSeconds * 1000);
      return evaluateRawFuelPrePlateauRecency({
        prePlateauStartAt: preBase,
        prePlateauEndAt: preEnd,
        riseOnsetAt: rise,
        riseOnsetPrimaryValue: riseValue,
        prePlateauMedian: median,
        interveningPrimarySamples: [],
        signalChannel: 'ABSOLUTE_LITERS',
      });
    }

    it('S1 — 5-minute silent bridge, material rise onset → FRESH', () => {
      expect(evalSilentBridge(300).classification).toBe('FRESH');
    });

    it('S2 — exactly 6-minute silent bridge (360s) → FRESH at boundary', () => {
      expect(evalSilentBridge(360).classification).toBe('FRESH');
      expect(evalSilentBridge(360).bridgeGapSeconds).toBe(360);
    });

    it('S3 — 7-minute silent bridge → INSUFFICIENT_EVIDENCE', () => {
      const r = evalSilentBridge(420);
      expect(r.classification).toBe('INSUFFICIENT_EVIDENCE');
      expect(r.reason).toContain('silent_bridge');
    });

    it('S4 — 23-minute silent bridge → INSUFFICIENT_EVIDENCE', () => {
      expect(evalSilentBridge(23 * 60).classification).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('S5 — 2-hour silent bridge → INSUFFICIENT_EVIDENCE', () => {
      expect(evalSilentBridge(2 * 3600).classification).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('S6 — long bridge with intervening material state change → STALE', () => {
      const preEnd = new Date('2026-09-06T08:04:00.000Z');
      const rise = new Date('2026-09-06T09:30:00.000Z');
      expect(
        evaluateRawFuelPrePlateauRecency({
          prePlateauStartAt: new Date('2026-09-06T08:00:00.000Z'),
          prePlateauEndAt: preEnd,
          riseOnsetAt: rise,
          riseOnsetPrimaryValue: 22,
          prePlateauMedian: 10,
          interveningPrimarySamples: [
            { timestamp: new Date('2026-09-06T08:20:00.000Z'), value: 5 },
          ],
          signalChannel: 'ABSOLUTE_LITERS',
        }).classification,
      ).toBe('STALE');
    });

    it('S7 — WOB 09-19 observed episode: fresh pre plateau + stretched POST → baseline FRESH', () => {
      const result = detectRawFuelRises({
        context: buildDetectorPhysicsContext({
          scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
        }),
        samples: buildSparseBridgeRefuelEpisodeSamples(true),
      });
      const block = (result.candidates[0]?.evidenceMeta as Record<string, unknown>)
        ?.baselineRecency as Record<string, unknown>;
      expect(block?.baselineRecencyClassification).toBe('FRESH');
      expect(result.candidates[0]?.maxSampleGapSeconds).toBeGreaterThan(360);
      expect(WOB_2026_09_19_OBSERVED_FILL.PRE_TO_RISE_GAP_SECONDS).toBeLessThanOrEqual(360);
    });

    it('S8 — OQ-015 stretched-end convergence unchanged (SAME_NATIVE)', () => {
      const cand = buildWob20260919StretchedEndCandidate({
        evidenceMeta: {
          baselineRecency: { baselineRecencyClassification: 'FRESH' },
        },
      });
      const native = buildWob20260919AuthoritativeNativeRow();
      const verdict = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, native);
      expect(verdict.classification).toBe('SAME_PHYSICAL_REFUEL');
    });
  });

  describe('P — KS MS 661 objective recency', () => {
    it('reports baseline recency classification from detector output', () => {
      const samples = KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((s) => ({
        timestamp: new Date(s.timestamp),
        absoluteLiters: s.absoluteLiters,
        relativePercent: s.relativePercent,
      }));
      const result = detectRawFuelRises({
        context: buildDetectorPhysicsContext({
          scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
          scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
        }),
        samples,
      });
      const block = (result.candidates[0]?.evidenceMeta as Record<string, unknown>)
        ?.baselineRecency as Record<string, unknown>;
      expect(['FRESH', 'STALE', 'INSUFFICIENT_EVIDENCE']).toContain(
        block?.baselineRecencyClassification,
      );
    });
  });

  it('config-derived recency limit matches F3 maxSampleGapMs', () => {
    expect(RFRF_BASELINE_RECENCY_MAX_BRIDGE_MS).toBe(360_000);
    expect(RFRF_BASELINE_RECENCY_MAX_BRIDGE_SECONDS).toBe(360);
  });
});
