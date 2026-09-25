import { evaluateM3_3E_LongitudinalHealthEvaluationV1 } from './longitudinal-health-evaluation.policy';
import {
  buildE3GoldenInput,
  buildE3InputFromSessions,
  sessionWithFeatures,
  syncE3ConsumptionInputFingerprint,
} from './longitudinal-health-evaluation.test-helpers';

const evaluate = evaluateM3_3E_LongitudinalHealthEvaluationV1;

describe('M3.3E E3.1.1 V1 comparability / context closure', () => {
  describe('V1 comparability (A–C)', () => {
    it('A — legal V1 observations use SAME_SEGMENT_CONTEXT_LIMITED', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      for (const seg of out.evaluation.segments) {
        for (const m of seg.metrics) {
          expect(m.comparability).toBe('SAME_SEGMENT_CONTEXT_LIMITED');
        }
      }
    });

    it('B — empty metric series never emits SAME_SEGMENT_COMPARABLE', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const slope = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'ROBUST_REST_SLOPE',
      );
      expect(slope?.statistics.seriesCount).toBe(0);
      expect(slope?.comparability).toBe('SAME_SEGMENT_CONTEXT_LIMITED');
      expect(slope?.trendState).toBe('NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL');
      expect(slope?.comparability).not.toBe('SAME_SEGMENT_COMPARABLE');
    });

    it('C — forged non-UNKNOWN charge class still CONTEXT_LIMITED under UNSET', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'c1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
        }),
        sessionWithFeatures({
          restSessionId: 'c2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12100 },
        }),
      ]);
      for (const obs of input.assessmentGradeObservations) {
        obs.chargeOpportunityClass = 'CHARGED';
        obs.features.chargeOpportunityClass = 'CHARGED';
      }
      syncE3ConsumptionInputFingerprint(input);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const median = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'MEDIAN_REST_VOLTAGE',
      );
      expect(median?.comparability).toBe('SAME_SEGMENT_CONTEXT_LIMITED');
    });

    it('C — charge class mirror mismatch rejects', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'mirror',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000, chargeOpportunityClass: 'UNKNOWN' },
        }),
      ]);
      input.assessmentGradeObservations[0].chargeOpportunityClass = 'CHARGED';
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_CHARGE_CLASS_MIRROR_MISMATCH',
      });
    });
  });

  describe('first-point-age / C1 envelope (D–H)', () => {
    it('D — maxActualRestAgeMs set, observationSpanMs null rejects', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'd1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            minimumRestVoltageMv: 12000,
            maximumRestVoltageMv: 12000,
            maxActualRestAgeMs: 100,
            observationSpanMs: null,
            numberOfValidRestPoints: 1,
          },
        }),
      ]);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
      });
    });

    it('E — maxActualRestAgeMs null, observationSpanMs set rejects', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'e1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: null,
            minimumRestVoltageMv: null,
            maximumRestVoltageMv: null,
            maxActualRestAgeMs: null,
            observationSpanMs: 0,
            numberOfValidRestPoints: 0,
          },
        }),
      ]);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
      });
    });

    it('F — zero valid points: no manufactured firstPointAgeRangeMs', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'f1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: null,
            minimumRestVoltageMv: null,
            maximumRestVoltageMv: null,
            robustRestSlopeMvPerHour: -0.5,
            maxActualRestAgeMs: null,
            observationSpanMs: null,
            numberOfValidRestPoints: 0,
          },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const slope = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'ROBUST_REST_SLOPE',
      );
      expect(slope?.contextDescriptors.firstPointAgeRangeMs).toEqual({ min: null, max: null });
    });

    it('G — one valid point: span 0, firstPointAge equals maxActualRestAgeMs', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'g1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            minimumRestVoltageMv: 12000,
            maximumRestVoltageMv: 12000,
            maxActualRestAgeMs: 3600000,
            observationSpanMs: 0,
            numberOfValidRestPoints: 1,
          },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const median = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'MEDIAN_REST_VOLTAGE',
      );
      expect(median?.contextDescriptors.firstPointAgeRangeMs.min).toBe(3600000);
      expect(median?.contextDescriptors.firstPointAgeRangeMs.max).toBe(3600000);
    });

    it('H — firstPointAgeRangeMs scoped to metric series only', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'h1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: null,
            minimumRestVoltageMv: null,
            maximumRestVoltageMv: null,
            robustRestSlopeMvPerHour: -0.5,
            maxActualRestAgeMs: null,
            observationSpanMs: null,
            numberOfValidRestPoints: 0,
          },
        }),
        sessionWithFeatures({
          restSessionId: 'h2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            robustRestSlopeMvPerHour: null,
            maxActualRestAgeMs: 9999,
            observationSpanMs: 100,
          },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const slope = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'ROBUST_REST_SLOPE',
      );
      const median = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'MEDIAN_REST_VOLTAGE',
      );
      expect(slope?.contextDescriptors.firstPointAgeRangeMs).toEqual({ min: null, max: null });
      expect(median?.contextDescriptors.firstPointAgeRangeMs.min).toBe(9899);
      expect(median?.contextDescriptors.firstPointAgeRangeMs.max).toBe(9899);
    });
  });

  describe('E3.1 metric scoping preserved (I)', () => {
    it('null median row does not affect slope metric temperature context', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'scope-a',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: null,
            minimumRestVoltageMv: null,
            maximumRestVoltageMv: null,
            robustRestSlopeMvPerHour: -0.5,
            numberOfValidRestPoints: 0,
            maxActualRestAgeMs: null,
            observationSpanMs: null,
          },
        }),
        sessionWithFeatures({
          restSessionId: 'scope-b',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            robustRestSlopeMvPerHour: -0.6,
          },
        }),
      ]);
      input.assessmentGradeObservations[0].temperatureC = 5;
      input.assessmentGradeObservations[0].temperatureSource = 'TRIP_EXTERIOR';
      syncE3ConsumptionInputFingerprint(input);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const slopeMetric = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'ROBUST_REST_SLOPE',
      );
      expect(slopeMetric?.contextDescriptors.temperature.tripExteriorCount).toBe(1);
      expect(slopeMetric?.contextDescriptors.temperature.unknownCount).toBe(1);
    });
  });
});
