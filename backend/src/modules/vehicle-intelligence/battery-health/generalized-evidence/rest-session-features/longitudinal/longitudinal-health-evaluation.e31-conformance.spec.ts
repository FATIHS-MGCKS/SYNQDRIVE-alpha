import { computeM3_3E_ConsumptionInputFingerprintV1 } from './longitudinal-assessment-input.adapter';
import { M3_3E_E3_GOLDEN_RESULT_FINGERPRINT_LITERAL } from './longitudinal-health-evaluation.golden';
import {
  computeM3_3E_HealthEvaluationResultFingerprintV1,
  evaluateM3_3E_LongitudinalHealthEvaluationV1,
} from './longitudinal-health-evaluation.policy';
import {
  buildE3GoldenInput,
  buildE3InputFromSessions,
  sessionWithFeatures,
  syncE3ConsumptionInputFingerprint,
} from './longitudinal-health-evaluation.test-helpers';
import { versionTuple } from './longitudinal-profile.test-fixtures';

const evaluate = evaluateM3_3E_LongitudinalHealthEvaluationV1;

function cloneGolden() {
  return structuredClone(buildE3GoldenInput());
}

describe('M3.3E E3.1 conformance hardening', () => {
  describe('E3.1 validation', () => {
    it('rejects malformed eligibleEvidenceSpanMs', () => {
      const input = cloneGolden();
      input.evidenceWindow.eligibleEvidenceSpanMs = 999;
      expect(evaluate({ input }).status).toBe('REJECTED');
    });

    it('rejects non-null evidenceWindow on zero observations', () => {
      const template = cloneGolden();
      const input = {
        ...template,
        assessmentGradeObservations: [],
        eligibleVersionSegments: [],
        evidenceWindow: {
          firstEligibleAnchorAt: '2026-01-01T10:00:00.000Z',
          lastEligibleAnchorAt: null,
          eligibleEvidenceSpanMs: null,
        },
        coverage: {
          ...template.coverage,
          d3DefaultObservationCount: 0,
          assessmentGradeObservationCount: 0,
        },
        modelEvaluation: {
          inputAvailability: 'NO_ASSESSMENT_GRADE_INPUT' as const,
          modelSufficiency: 'NOT_EVALUATED' as const,
        },
        consumptionInputFingerprint: computeM3_3E_ConsumptionInputFingerprintV1({
          organizationId: template.identity.organizationId,
          vehicleId: template.identity.vehicleId,
          canonicalProfileFingerprint: template.identity.canonicalProfileFingerprint,
          longitudinalProfileContractVersion: template.identity.longitudinalProfileContractVersion,
          profilePolicyVersion: template.identity.profilePolicyVersion,
          integrityInspectionContractVersion: template.identity.integrityInspectionContractVersion,
          assessmentGradeObservations: [],
        }),
      };
      expect(evaluate({ input }).status).toBe('REJECTED');
    });

    it('rejects bad assessmentGradeObservationCount', () => {
      const input = cloneGolden();
      input.coverage.assessmentGradeObservationCount = 999;
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_COVERAGE',
      });
    });

    it('rejects bad d3 default disposition accounting', () => {
      const input = cloneGolden();
      input.coverage.d3DefaultObservationCount = 0;
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_COVERAGE',
      });
    });

    it('rejects duplicate sourceSegmentIndex', () => {
      const input = cloneGolden();
      input.eligibleVersionSegments.push({
        ...input.eligibleVersionSegments[0],
      });
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_SEGMENT_STRUCTURE',
      });
    });

    it('rejects maxActualRestAgeMs < observationSpanMs', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'span-bad',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            maxActualRestAgeMs: 100,
            observationSpanMs: 200,
          },
        }),
      ]);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
      });
    });

    it('rejects non-finite temperatureC', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'temp-bad',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
        }),
      ]);
      input.assessmentGradeObservations[0].temperatureC = Number.NaN;
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC',
      });
    });
  });

  describe('metric series scoping (C)', () => {
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

    it('MEDIAN_REST_VOLTAGE omits FIRST_POINT_AGE_UNCONTROLLED', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const median = out.evaluation.segments[0].metrics.find(
        (m) => m.metric === 'MEDIAN_REST_VOLTAGE',
      );
      expect(median?.reasonCodes).not.toContain('FIRST_POINT_AGE_UNCONTROLLED');
    });
  });

  describe('required matrix cases', () => {
    it('D — two same-anchor rows + one distinct anchor', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'd1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
        }),
        sessionWithFeatures({
          restSessionId: 'd2',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12100 },
        }),
        sessionWithFeatures({
          restSessionId: 'd3',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12200 },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.statistics.distinctAnchorCount).toBe(2);
      expect(m?.statistics.seriesCount).toBe(3);
      expect(m?.statistics.theilSenSlopePerDayQuantized).not.toBeNull();
    });

    it('H — even-count series median quantization', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'h1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
        }),
        sessionWithFeatures({
          restSessionId: 'h2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12002 },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.statistics.seriesMedianQuantized).toBe(12001000);
    });

    it('I — even-count Theil-Sen: middle physical slopes averaged then quantized once', () => {
      const day = 86400000;
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'i1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
        }),
        sessionWithFeatures({
          restSessionId: 'i2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12010 },
        }),
        sessionWithFeatures({
          restSessionId: 'i3',
          anchorAt: '2026-01-03T10:00:00.000Z',
          features: { medianRestVoltageMv: 12020 },
        }),
        sessionWithFeatures({
          restSessionId: 'i4',
          anchorAt: '2026-01-04T10:00:00.000Z',
          features: { medianRestVoltageMv: 12030 },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      const slopes: number[] = [];
      const anchors = [
        Date.parse('2026-01-01T10:00:00.000Z'),
        Date.parse('2026-01-02T10:00:00.000Z'),
        Date.parse('2026-01-03T10:00:00.000Z'),
        Date.parse('2026-01-04T10:00:00.000Z'),
      ];
      const ys = [12000, 12010, 12020, 12030];
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          slopes.push(((ys[j] - ys[i]) * day) / (anchors[j] - anchors[i]));
        }
      }
      slopes.sort((a, b) => a - b);
      const physicalMedian = (slopes[2] + slopes[3]) / 2;
      const expectedQuantized = Math.round(physicalMedian * 1000);
      expect(m?.statistics.theilSenSlopePerDayQuantized).toBe(expectedQuantized);
    });

    it('M — unresolved anchor, null delta, contextual reason preserved', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'm1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            shutdownToFirstRestDeltaMv: null,
          },
          anchorResolutionStatus: 'UNAVAILABLE',
        }),
        sessionWithFeatures({
          restSessionId: 'm2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            shutdownToFirstRestDeltaMv: 50,
          },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const delta = out.evaluation.segments[0].metrics.find(
        (x) => x.metric === 'SHUTDOWN_TO_FIRST_REST_DELTA',
      );
      expect(delta?.statistics.seriesCount).toBe(1);
      expect(delta?.reasonCodes).toContain('ANCHOR_UNRESOLVED_FOR_DELTA_METRIC');
    });

    it('Q — all primary metrics null => NO_CONCLUSION', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'q1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: null,
            minimumRestVoltageMv: null,
            maximumRestVoltageMv: null,
            robustRestSlopeMvPerHour: null,
            shutdownToFirstRestDeltaMv: null,
            numberOfValidRestPoints: 0,
            maxActualRestAgeMs: null,
            observationSpanMs: null,
          },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.evaluationStatus).toBe('NO_CONCLUSION');
    });

    it('R — one primary metric evaluable keeps segment evaluable', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'r1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: {
            medianRestVoltageMv: 12000,
            robustRestSlopeMvPerHour: null,
            shutdownToFirstRestDeltaMv: null,
          },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.evaluationStatus).toBe('EVALUATED_DESCRIPTIVE_ONLY');
    });

    it('O / AC / AD — multi-segment independent, no pooling, no winner', () => {
      const vA = versionTuple({ featureModelVersion: 'fm-a' });
      const vB = versionTuple({ featureModelVersion: 'fm-b' });
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'o1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
          version: vA,
        }),
        sessionWithFeatures({
          restSessionId: 'o2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12100 },
          version: vB,
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.vehicleSummary).toBe('SEGMENTED_NO_POOLED_CONCLUSION');
      expect(out.evaluation.segments).toHaveLength(2);
      expect(out.evaluation.segments[0].sourceSegmentIndex).toBe(0);
      expect(out.evaluation.segments[1].sourceSegmentIndex).toBe(1);
    });

    it('P — A→B→A preserves three segments', () => {
      const vA = versionTuple({ featureModelVersion: 'fm-a' });
      const vB = versionTuple({ featureModelVersion: 'fm-b' });
      const input = buildE3InputFromSessions([
        sessionWithFeatures({ restSessionId: 'p1', anchorAt: '2026-01-01T10:00:00.000Z', features: { medianRestVoltageMv: 12000 }, version: vA }),
        sessionWithFeatures({ restSessionId: 'p2', anchorAt: '2026-01-02T10:00:00.000Z', features: { medianRestVoltageMv: 12000 }, version: vB }),
        sessionWithFeatures({ restSessionId: 'p3', anchorAt: '2026-01-03T10:00:00.000Z', features: { medianRestVoltageMv: 12000 }, version: vA }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.segments.map((s) => s.sourceSegmentIndex)).toEqual([0, 1, 2]);
    });

    it('V — non-finite valid-time pair slope rejects', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'v1',
          anchorAt: '2026-01-01T00:00:00.000Z',
          features: { medianRestVoltageMv: 0 },
        }),
        sessionWithFeatures({
          restSessionId: 'v2',
          anchorAt: '2026-01-01T00:00:00.001Z',
          features: { medianRestVoltageMv: 9007199254740991 },
        }),
      ]);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW',
      });
    });

    it('W — unsafe quantized integer rejects', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'w1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 9007199254741 },
        }),
      ]);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW',
      });
    });

    it('L — stored quantized values are never negative zero', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      for (const seg of out.evaluation.segments) {
        for (const m of seg.metrics) {
          const nums = [
            m.statistics.seriesMedianQuantized,
            m.statistics.theilSenSlopePerDayQuantized,
            m.statistics.residualMadQuantized,
            m.statistics.stepChangeMagnitudeQuantized,
          ];
          for (const n of nums) {
            if (n !== null) {
              expect(Object.is(n, -0)).toBe(false);
            }
          }
        }
      }
    });
  });

  describe('result fingerprint sensitivity (E3.1)', () => {
    it('consumptionInputFingerprint sensitivity', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const base = { ...out.evaluation };
      delete (base as { resultFingerprint?: string }).resultFingerprint;
      const fp1 = computeM3_3E_HealthEvaluationResultFingerprintV1(base);
      const fp2 = computeM3_3E_HealthEvaluationResultFingerprintV1({
        ...base,
        inputBinding: {
          ...base.inputBinding,
          consumptionInputFingerprint: 'c'.repeat(64),
        },
      });
      expect(fp1).not.toBe(fp2);
    });

    it('calibrationProfileFingerprint sensitivity', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const body = { ...out.evaluation };
      delete (body as { resultFingerprint?: string }).resultFingerprint;
      const fp1 = computeM3_3E_HealthEvaluationResultFingerprintV1(body);
      const fp2 = computeM3_3E_HealthEvaluationResultFingerprintV1({
        ...body,
        calibration: {
          ...body.calibration,
          calibrationProfileFingerprint: 'd'.repeat(64),
        },
      });
      expect(fp1).not.toBe(fp2);
    });

    it('result body statistic sensitivity', () => {
      const out1 = evaluate({ input: buildE3GoldenInput() });
      const out2 = evaluate({
        input: buildE3InputFromSessions([
          sessionWithFeatures({
            restSessionId: 'fp1',
            anchorAt: '2026-01-01T10:00:00.000Z',
            features: { medianRestVoltageMv: 12500 },
          }),
          sessionWithFeatures({
            restSessionId: 'fp2',
            anchorAt: '2026-01-02T10:00:00.000Z',
            features: { medianRestVoltageMv: 12000 },
          }),
        ]),
      });
      expect(out1.status).toBe('OK');
      expect(out2.status).toBe('OK');
      if (out1.status !== 'OK' || out2.status !== 'OK') return;
      const body1 = { ...out1.evaluation };
      delete (body1 as { resultFingerprint?: string }).resultFingerprint;
      const body2 = { ...out2.evaluation };
      delete (body2 as { resultFingerprint?: string }).resultFingerprint;
      const fp1 = computeM3_3E_HealthEvaluationResultFingerprintV1(body1);
      const fp2 = computeM3_3E_HealthEvaluationResultFingerprintV1(body2);
      expect(fp1).not.toBe(fp2);
    });

    it('result body sensitivity and golden pin', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.resultFingerprint).toBe(M3_3E_E3_GOLDEN_RESULT_FINGERPRINT_LITERAL);
    });
  });
});
