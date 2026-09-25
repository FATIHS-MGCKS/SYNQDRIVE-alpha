import { evaluateM3_3E_LongitudinalHealthEvaluationV1 } from './longitudinal-health-evaluation.policy';
import {
  buildE3GoldenInput,
  buildE3InputFromSessions,
  sessionWithFeatures,
} from './longitudinal-health-evaluation.test-helpers';
import { M3_3E_E3_GOLDEN_RESULT_FINGERPRINT_LITERAL } from './longitudinal-health-evaluation.golden';

const evaluate = evaluateM3_3E_LongitudinalHealthEvaluationV1;

const legalZeroPointFeatures = {
  medianRestVoltageMv: null,
  minimumRestVoltageMv: null,
  maximumRestVoltageMv: null,
  robustRestSlopeMvPerHour: null,
  shutdownToFirstRestDeltaMv: null,
  restVoltageVarianceMv2: null,
  maxActualRestAgeMs: null,
  maxInterObservationGapMs: null,
  observationSpanMs: null,
  numberOfValidRestPoints: 0,
} as const;

describe('M3.3E E3.1.2 C1 primary-metric envelope', () => {
  it('A — zero points + non-null slope rejects', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'a1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: { ...legalZeroPointFeatures, robustRestSlopeMvPerHour: -0.5 },
      }),
    ]);
    expect(evaluate({ input })).toEqual({
      status: 'REJECTED',
      reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
    });
  });

  it('B — zero points + shutdown delta rejects', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'b1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: { ...legalZeroPointFeatures, shutdownToFirstRestDeltaMv: 100 },
        anchorResolutionStatus: 'SELECTED',
      }),
    ]);
    expect(evaluate({ input })).toEqual({
      status: 'REJECTED',
      reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
    });
  });

  it('C — zero points + variance rejects', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'c1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: { ...legalZeroPointFeatures, restVoltageVarianceMv2: 0 },
      }),
    ]);
    expect(evaluate({ input })).toEqual({
      status: 'REJECTED',
      reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
    });
  });

  it('D — one point + non-null slope rejects', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'd1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: {
          medianRestVoltageMv: 12000,
          minimumRestVoltageMv: 12000,
          maximumRestVoltageMv: 12000,
          maxActualRestAgeMs: 1000,
          observationSpanMs: 0,
          numberOfValidRestPoints: 1,
          robustRestSlopeMvPerHour: -0.5,
        },
      }),
    ]);
    expect(evaluate({ input })).toEqual({
      status: 'REJECTED',
      reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
    });
  });

  it('E — one point + null slope accepts', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'e1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: {
          medianRestVoltageMv: 12000,
          minimumRestVoltageMv: 12000,
          maximumRestVoltageMv: 12000,
          maxActualRestAgeMs: 1000,
          observationSpanMs: 0,
          numberOfValidRestPoints: 1,
          robustRestSlopeMvPerHour: null,
          shutdownToFirstRestDeltaMv: 50,
        },
        anchorResolutionStatus: 'SELECTED',
      }),
    ]);
    expect(evaluate({ input }).status).toBe('OK');
  });

  it('F — two points + null slope may remain valid', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'f1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: { medianRestVoltageMv: 12000, robustRestSlopeMvPerHour: null },
      }),
      sessionWithFeatures({
        restSessionId: 'f2',
        anchorAt: '2026-01-02T10:00:00.000Z',
        features: { medianRestVoltageMv: 12100, robustRestSlopeMvPerHour: null },
      }),
    ]);
    expect(evaluate({ input }).status).toBe('OK');
  });

  it('G — legal zero-point observation accepts; no primary metric level-evaluable', () => {
    const input = buildE3InputFromSessions([
      sessionWithFeatures({
        restSessionId: 'g1',
        anchorAt: '2026-01-01T10:00:00.000Z',
        features: { ...legalZeroPointFeatures },
      }),
    ]);
    const out = evaluate({ input });
    expect(out.status).toBe('OK');
    if (out.status !== 'OK') return;
    expect(out.evaluation.evaluationStatus).toBe('NO_CONCLUSION');
    for (const seg of out.evaluation.segments) {
      for (const m of seg.metrics) {
        expect(m.statistics.seriesCount).toBe(0);
      }
    }
  });

  it('pins E3 golden unchanged after C1 envelope closure', () => {
    const out = evaluate({ input: buildE3GoldenInput() });
    expect(out.status).toBe('OK');
    if (out.status !== 'OK') return;
    expect(out.evaluation.resultFingerprint).toBe(M3_3E_E3_GOLDEN_RESULT_FINGERPRINT_LITERAL);
  });
});
