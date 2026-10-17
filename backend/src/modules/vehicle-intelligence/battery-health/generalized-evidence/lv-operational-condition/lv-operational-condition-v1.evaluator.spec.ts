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
      restingThresholdAuthority: 'BATTERY_STATUS_CLASSIFY_RESTING_VOLTAGE_V1',
    },
    openProviderObservabilityGapCount: 0,
    historicalQueryMode: 'RECENT_DESC_LIMIT',
    inputCoverageIncomplete: false,
    historicalObservationsTruncated: false,
    eligibleRestObservations: [],
    latestGlobalObservation: null,
    latestEligibleRestObservation: null,
    wakeVoltageObservations: [],
    sessionFeatures: [],
    crankEvidence: null,
    ...overrides,
  };
}

function restObs(
  partial: Partial<LvOperationalConditionObservationV1> & { voltageV: number },
): LvOperationalConditionObservationV1 {
  return {
    observationId: partial.observationId ?? 'obs-1',
    sourceMeasurementId: partial.sourceMeasurementId ?? 'm-1',
    restSessionId: partial.restSessionId ?? 'sess-1',
    voltageV: partial.voltageV,
    voltageObservedAt: partial.voltageObservedAt ?? '2026-10-01T08:00:00.000Z',
    providerObservationAt: partial.providerObservationAt ?? partial.voltageObservedAt ?? '2026-10-01T08:00:00.000Z',
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

  it('does not downgrade GREEN operational risk when provider gap or truncated coverage', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        openProviderObservabilityGapCount: 1,
        inputCoverageIncomplete: true,
        historicalObservationsTruncated: true,
        chemistry: {
          ...baseInput().chemistry,
          normalizedType: 'LEAD_ACID',
        },
        eligibleRestObservations: [
          restObs({ voltageV: 12.65, restSessionId: 's1' }),
          restObs({ voltageV: 12.62, observationId: 'o2', restSessionId: 's2' }),
        ],
      }),
    );
    expect(result.operationalRiskStatus).toBe('GREEN');
    expect(result.dataQuality).toBe('DEGRADED');
    expect(result.reasonCodes).toContain('PROVIDER_GAP_OPEN');
    expect(result.reasonCodes).toContain('INPUT_COVERAGE_TRUNCATED');
    expect(result.assessmentConfidence).toBe('LOW');
  });

  it('does not emit pseudo-exact SoC percentages', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [
          restObs({ voltageV: 12.65, restSessionId: 's1' }),
          restObs({ voltageV: 12.62, observationId: 'o2', restSessionId: 's2' }),
        ],
      }),
    );
    expect(result).not.toHaveProperty('socEstimation');
    expect(result.restingChargeBand.qualification).toBe('COARSE_BAND_ONLY');
    expect(result.restingChargeBand.bandStatus).toBe('GOOD');
    expect((result as Record<string, unknown>).estimatedSocPercent).toBeUndefined();
  });

  it('flags context-limited extreme slopes without RED escalation', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [
          restObs({ voltageV: 12.5, restSessionId: 's1' }),
          restObs({ voltageV: 12.48, observationId: 'o2', restSessionId: 's2' }),
        ],
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

  it('classifies healthy AGM rest voltages as GREEN resting band and YELLOW traffic light at watch threshold', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [
          restObs({ voltageV: 12.5, restSessionId: 's1' }),
          restObs({ voltageV: 12.52, observationId: 'o2', restSessionId: 's2' }),
        ],
      }),
    );
    expect(result.restingVoltageBand).toBe('WATCH');
    expect(result.operationalRiskStatus).toBe('YELLOW');
  });

  it('returns UNKNOWN risk when rest stabilization is unverified', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        eligibleRestObservations: [restObs({ voltageV: 12.1, actualRestAgeHours: 0.1 })],
      }),
    );
    expect(result.reasonCodes).toContain('REST_STABILIZATION_UNVERIFIED');
    expect(result.operationalRiskStatus).toBe('UNKNOWN');
  });

  it('keeps startability UNKNOWN when only wake voltage exists', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        wakeVoltageObservations: [
          restObs({
            observationId: 'wake',
            voltageV: 12.1,
            evidenceClass: 'REST_WAKE_VOLTAGE',
            actualRestAgeHours: 0.05,
          }),
        ],
      }),
    );
    expect(result.startabilityStatus).toBe('UNKNOWN');
    expect(result.startabilityStatus).not.toBe('GREEN');
  });

  it('matches KS MS 661 AGM median rest (~12.506 V) as WATCH/YELLOW without coverage downgrade', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        chemistry: { ...baseInput().chemistry, normalizedType: 'AGM', ampereHours: 70 },
        inputCoverageIncomplete: true,
        eligibleRestObservations: [
          restObs({ voltageV: 12.506, restSessionId: 'ks-a' }),
          restObs({ voltageV: 12.51, observationId: 'ks-b', restSessionId: 'ks-b' }),
        ],
      }),
    );
    expect(result.restingVoltageBand).toBe('WATCH');
    expect(result.operationalRiskStatus).toBe('YELLOW');
    expect(result.dataQuality).toBe('DEGRADED');
  });

  it('matches WOB L 7503 lead-acid median rest (~12.556 V) as GREEN risk with degraded data under provider gap', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        chemistry: { ...baseInput().chemistry, normalizedType: 'LEAD_ACID', ampereHours: 60 },
        openProviderObservabilityGapCount: 1,
        eligibleRestObservations: [
          restObs({ voltageV: 12.556, restSessionId: 'wob-a' }),
          restObs({ voltageV: 12.55, observationId: 'wob-b', restSessionId: 'wob-b' }),
        ],
      }),
    );
    expect(result.restingVoltageBand).toBe('GOOD');
    expect(result.operationalRiskStatus).toBe('GREEN');
    expect(result.dataQuality).toBe('DEGRADED');
    expect(result.reasonCodes).toContain('PROVIDER_GAP_OPEN');
  });

  it('marks manual spec confidence 1.0 as not physically verified in data quality', () => {
    const result = evaluateLvOperationalConditionV1(
      baseInput({
        chemistry: {
          ...baseInput().chemistry,
          sourceType: 'MANUAL',
          sourceConfidence: 1,
        },
        eligibleRestObservations: [
          restObs({ voltageV: 12.65, restSessionId: 's1' }),
          restObs({ voltageV: 12.62, observationId: 'o2', restSessionId: 's2' }),
        ],
      }),
    );
    expect(result.reasonCodes).toContain('MANUAL_BATTERY_SPEC_NOT_PHYSICALLY_VERIFIED');
  });
});
