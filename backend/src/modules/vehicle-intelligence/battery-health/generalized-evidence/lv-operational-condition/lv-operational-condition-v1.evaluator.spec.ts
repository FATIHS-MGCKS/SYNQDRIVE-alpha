import { evaluateLvOperationalConditionV1 } from './lv-operational-condition-v1.evaluator';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from './lv-operational-condition-v1.constants';
import type { LvOperationalConditionInputV1, LvOperationalConditionObservationV1 } from './lv-operational-condition-v1.types';

function baseInput(
  overrides: Partial<LvOperationalConditionInputV1> = {},
): LvOperationalConditionInputV1 {
  return {
    modelVersion: LV_OPERATIONAL_CONDITION_MODEL_VERSION,
    organizationId: 'org',
    vehicleId: 'veh',
    evaluatedAtIso: '2026-10-17T12:00:00.000Z',
    chemistry: {
      normalizedType: 'AGM',
      batterySpecId: 'spec-1',
      sourceType: 'MANUAL',
      sourceConfidence: 0.9,
      nominalVoltageV: 12,
      ampereHours: 80,
      authority: 'VEHICLE_BATTERY_SPEC',
    },
    openProviderObservabilityGapCount: 0,
    historicalQueryMode: 'RECENT_DESC_LIMIT',
    inputCoverageIncomplete: false,
    historicalObservationsTruncated: false,
    eligibleRestObservations: [],
    latestGlobalObservation: null,
    wakeVoltageObservations: [],
    sessionFeatures: [],
    ...overrides,
  };
}

function restObs(
  partial: Partial<LvOperationalConditionObservationV1> & { voltageV: number },
): LvOperationalConditionObservationV1 {
  return {
    observationId: partial.observationId ?? 'obs-1',
    sourceMeasurementId: partial.sourceMeasurementId ?? 'm-1',
    voltageV: partial.voltageV,
    voltageObservedAt: partial.voltageObservedAt ?? '2026-10-01T08:00:00.000Z',
    operationalContext: partial.operationalContext ?? 'REST',
    evidenceClass: partial.evidenceClass ?? 'PARKED_REST_CANDIDATE',
    actualRestAgeHours: partial.actualRestAgeHours ?? 8,
    temperatureC: partial.temperatureC ?? 20,
    isLvCharging: partial.isLvCharging ?? false,
    engineRunning: partial.engineRunning ?? false,
  };
}

describe('evaluateLvOperationalConditionV1', () => {
  it('returns UNKNOWN when chemistry is unknown', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        chemistry: {
          ...baseInput().chemistry,
          normalizedType: 'UNKNOWN',
          authority: 'NONE',
          batterySpecId: null,
        },
        eligibleRestObservations: [restObs({ voltageV: 12.4 })],
      }),
    );
    expect(result.operationalRiskStatus).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('CHEMISTRY_UNKNOWN');
    expect(result.actualStateOfHealth).toBe('UNKNOWN');
  });

  it('excludes charging voltage 13.733 V from resting risk (adversarial)', () => {
    const charging = restObs({
      observationId: 'charge',
      voltageV: 13.733,
      operationalContext: 'CHARGING',
      isLvCharging: true,
    });
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [charging],
        latestGlobalObservation: charging,
      }),
    );
    expect(result.operationalRiskStatus).toBe('UNKNOWN');
    expect(result.eligibleRestObservationCount).toBe(0);
  });

  it('flags provider gap and truncated history', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        openProviderObservabilityGapCount: 1,
        inputCoverageIncomplete: true,
        historicalObservationsTruncated: true,
        eligibleRestObservations: [restObs({ voltageV: 12.55 }), restObs({ voltageV: 12.52, observationId: 'o2' })],
      }),
    );
    expect(result.reasonCodes).toContain('PROVIDER_GAP_OPEN');
    expect(result.reasonCodes).toContain('INPUT_COVERAGE_TRUNCATED');
  });

  it('does not treat context-limited extreme slopes as escalation', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [restObs({ voltageV: 12.5 }), restObs({ voltageV: 12.48, observationId: 'o2' })],
        sessionFeatures: [
          {
            restSessionId: 'sess',
            robustRestSlopeMvPerHour: -14170.9,
            slopeInterpretability: 'CONTEXT_LIMITED',
            slopeLimitationCodes: ['C3_SLOPE_SHORT_OBSERVATION_SPAN', 'C3_SLOPE_CHARGING_TRANSITION_END'],
            numberOfValidRestPoints: 2,
            observationSpanMs: 73_000,
          },
        ],
      }),
    );
    expect(result.reasonCodes).toContain('CONTEXT_LIMITED_SLOPE_ONLY');
    expect(result.operationalRiskStatus).not.toBe('RED');
  });

  it('classifies healthy AGM rest voltages as GREEN', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [
          restObs({ voltageV: 12.65 }),
          restObs({ voltageV: 12.62, observationId: 'o2' }),
        ],
      }),
    );
    expect(result.operationalRiskStatus).toBe('GREEN');
    expect(result.socEstimation.status).toBe('EVALUABLE');
    expect(result.socEstimation.estimatedSocPercent).not.toBeNull();
  });

  it('returns UNKNOWN for single-point rest session', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [restObs({ voltageV: 12.1, actualRestAgeHours: 0.1 })],
      }),
    );
    expect(result.reasonCodes).toContain('REST_AGE_TOO_SHORT');
  });
});
