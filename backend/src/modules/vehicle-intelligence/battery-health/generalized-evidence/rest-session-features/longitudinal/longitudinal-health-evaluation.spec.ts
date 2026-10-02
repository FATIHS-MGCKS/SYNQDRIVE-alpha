import { computeM3_3E_ConsumptionInputFingerprintV1 } from './longitudinal-assessment-input.adapter';
import { M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL } from './longitudinal-assessment-input.golden';
import { M3_3E_CALIBRATION_UNSET_PROFILE_FINGERPRINT_V1 } from './longitudinal-health-calibration-profile';
import {
  M3_3E_E3_GOLDEN_RESULT_FINGERPRINT_LITERAL,
} from './longitudinal-health-evaluation.golden';
import { evaluateM3_3E_LongitudinalHealthEvaluationV1 } from './longitudinal-health-evaluation.policy';
import {
  buildE3GoldenInput,
  buildE3InputFromSessions,
  sessionWithFeatures,
} from './longitudinal-health-evaluation.test-helpers';

const evaluate = evaluateM3_3E_LongitudinalHealthEvaluationV1;

describe('evaluateM3_3E_LongitudinalHealthEvaluationV1 (M3.3E E3)', () => {
  it('pins golden result fingerprint on E1 golden input', () => {
    const out = evaluate({ input: buildE3GoldenInput() });
    expect(out.status).toBe('OK');
    if (out.status !== 'OK') return;
    expect(out.evaluation.resultFingerprint).toBe(M3_3E_E3_GOLDEN_RESULT_FINGERPRINT_LITERAL);
    expect(out.evaluation.calibration.calibrationProfileFingerprint).toBe(
      M3_3E_CALIBRATION_UNSET_PROFILE_FINGERPRINT_V1,
    );
    expect(out.evaluation.inputBinding.consumptionInputFingerprint).toBe(
      M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL,
    );
    expect(out.evaluation.condition).toBe('NOT_ASSESSED');
    expect(out.evaluation.claimLevel).toBe('NONE');
  });

  describe('A — zero eligible observations', () => {
    it('NO_CONCLUSION with NO_ASSESSMENT_GRADE_OBSERVATIONS', () => {
      const template = buildE3GoldenInput();
      const input = {
        ...template,
        assessmentGradeObservations: [],
        eligibleVersionSegments: [],
        evidenceWindow: {
          firstEligibleAnchorAt: null,
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
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.evaluationStatus).toBe('NO_CONCLUSION');
      expect(out.evaluation.vehicleSummary).toBe('NO_EVALUABLE_SEGMENT');
      expect(out.evaluation.segments).toEqual([]);
      expect(out.evaluation.noConclusionReasons).toContain('NO_ASSESSMENT_GRADE_OBSERVATIONS');
    });
  });

  describe('frozen Cases A–D (median metric)', () => {
    it('Case A — one point: descriptive only, structural trend', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'a1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000, robustRestSlopeMvPerHour: null, shutdownToFirstRestDeltaMv: null },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.evaluationStatus).toBe('EVALUATED_DESCRIPTIVE_ONLY');
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.trendState).toBe('NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL');
      expect(m?.statistics.seriesMedianQuantized).not.toBeNull();
      expect(m?.statistics.theilSenSlopePerDayQuantized).toBeNull();
    });

    it('Case B — two distinct anchors', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'b1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12000 },
        }),
        sessionWithFeatures({
          restSessionId: 'b2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12100 },
        }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.trendState).toBe('NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED');
      expect(m?.statistics.theilSenSlopePerDayQuantized).not.toBeNull();
      expect(m?.statistics.residualMadQuantized).toBeNull();
      expect(m?.statistics.stepChangeMagnitudeQuantized).toBeNull();
      expect(m?.reasonCodes).toContain('INSUFFICIENT_POINTS_FOR_DISPERSION');
      expect(m?.reasonCodes).toContain('INSUFFICIENT_POINTS_FOR_STEP');
    });

    it('Case C — three distinct anchors enables MAD', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({ restSessionId: 'c1', anchorAt: '2026-01-01T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
        sessionWithFeatures({ restSessionId: 'c2', anchorAt: '2026-01-02T10:00:00.000Z', features: { medianRestVoltageMv: 12100 } }),
        sessionWithFeatures({ restSessionId: 'c3', anchorAt: '2026-01-03T10:00:00.000Z', features: { medianRestVoltageMv: 12050 } }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.trendState).toBe('NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED');
      expect(m?.statistics.residualMadQuantized).not.toBeNull();
      expect(m?.statistics.stepChangeMagnitudeQuantized).toBeNull();
    });
  });

  describe('validation fail-closed', () => {
    it('Y — E1 fingerprint mismatch', () => {
      const input = buildE3GoldenInput();
      input.consumptionInputFingerprint = 'a'.repeat(64);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_CONSUMPTION_FINGERPRINT_MISMATCH',
      });
    });

    it('N — shutdown delta non-SELECTED with non-null rejects', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'bad-delta',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { shutdownToFirstRestDeltaMv: 100 },
          anchorResolutionStatus: 'UNAVAILABLE',
        }),
      ]);
      expect(evaluate({ input })).toEqual({
        status: 'REJECTED',
        reason: 'M3_3E_EVALUATION_SHUTDOWN_DELTA_ANCHOR_INCONSISTENT',
      });
    });

    it('X — malformed anchor timestamp', () => {
      const input = buildE3GoldenInput();
      input.assessmentGradeObservations[0].anchorAt = 'not-iso';
      expect(evaluate({ input }).status).toBe('REJECTED');
    });
  });

  describe('Z — result fingerprint deterministic', () => {
    it('same input yields same fingerprint', () => {
      const input = buildE3GoldenInput();
      const a = evaluate({ input });
      const b = evaluate({ input });
      expect(a.status).toBe('OK');
      expect(b.status).toBe('OK');
      if (a.status === 'OK' && b.status === 'OK') {
        expect(a.evaluation.resultFingerprint).toBe(b.evaluation.resultFingerprint);
      }
    });
  });

  describe('T/U — dispersion and step do not change trendState', () => {
    it('two-point trend stays NOT_CLASSIFIED when dispersion absent', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({ restSessionId: 't1', anchorAt: '2026-01-01T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
        sessionWithFeatures({ restSessionId: 't2', anchorAt: '2026-01-02T10:00:00.000Z', features: { medianRestVoltageMv: 11900 } }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.trendState).toBe('NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED');
      expect(m?.statistics.residualMadQuantized).toBeNull();
    });
  });

  describe('S — UNSET never creates classification', () => {
    it('condition NOT_ASSESSED and confidence NOT_APPLICABLE', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      expect(out.evaluation.condition).toBe('NOT_ASSESSED');
      for (const seg of out.evaluation.segments) {
        for (const m of seg.metrics) {
          expect(m.confidence).toBe('NOT_APPLICABLE');
        }
      }
    });
  });

  describe('Case D / G — step change and tie-break', () => {
    it('four points allow step magnitude (Case D)', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({ restSessionId: 'd1', anchorAt: '2026-01-01T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
        sessionWithFeatures({ restSessionId: 'd2', anchorAt: '2026-01-02T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
        sessionWithFeatures({ restSessionId: 'd3', anchorAt: '2026-01-03T10:00:00.000Z', features: { medianRestVoltageMv: 13000 } }),
        sessionWithFeatures({ restSessionId: 'd4', anchorAt: '2026-01-04T10:00:00.000Z', features: { medianRestVoltageMv: 13000 } }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.statistics.stepChangeMagnitudeQuantized).not.toBeNull();
      expect(m?.trendState).toBe('NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED');
    });
  });

  describe('J/K — slope direction', () => {
    it('negative slope quantized', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({ restSessionId: 'j1', anchorAt: '2026-01-01T10:00:00.000Z', features: { medianRestVoltageMv: 12500 } }),
        sessionWithFeatures({ restSessionId: 'j2', anchorAt: '2026-01-02T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.statistics.theilSenSlopePerDayQuantized).toBeLessThan(0);
    });

    it('flat slope (K)', () => {
      const input = buildE3InputFromSessions([
        sessionWithFeatures({ restSessionId: 'k1', anchorAt: '2026-01-01T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
        sessionWithFeatures({ restSessionId: 'k2', anchorAt: '2026-01-02T10:00:00.000Z', features: { medianRestVoltageMv: 12000 } }),
      ]);
      const out = evaluate({ input });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      const m = out.evaluation.segments[0].metrics.find((x) => x.metric === 'MEDIAN_REST_VOLTAGE');
      expect(m?.statistics.theilSenSlopePerDayQuantized).toBe(0);
    });
  });

  describe('AA — result fingerprint sensitivity', () => {
    it('changes when meaningful statistic changes', () => {
      const a = evaluate({ input: buildE3GoldenInput() });
      const input2 = buildE3InputFromSessions([
        sessionWithFeatures({
          restSessionId: 'aa1',
          anchorAt: '2026-01-01T10:00:00.000Z',
          features: { medianRestVoltageMv: 12200 },
        }),
        sessionWithFeatures({
          restSessionId: 'aa2',
          anchorAt: '2026-01-02T10:00:00.000Z',
          features: { medianRestVoltageMv: 12300 },
        }),
      ]);
      const b = evaluate({ input: input2 });
      expect(a.status).toBe('OK');
      expect(b.status).toBe('OK');
      if (a.status === 'OK' && b.status === 'OK') {
        expect(a.evaluation.resultFingerprint).not.toBe(b.evaluation.resultFingerprint);
      }
    });
  });

  describe('AB — reason code ordering', () => {
    it('reasonCodes are deduplicated and UTF-16 sorted', () => {
      const out = evaluate({ input: buildE3GoldenInput() });
      expect(out.status).toBe('OK');
      if (out.status !== 'OK') return;
      for (const seg of out.evaluation.segments) {
        for (const m of seg.metrics) {
          const sorted = [...m.reasonCodes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          expect(m.reasonCodes).toEqual(sorted);
          expect(new Set(m.reasonCodes).size).toBe(m.reasonCodes.length);
        }
      }
    });
  });
});
