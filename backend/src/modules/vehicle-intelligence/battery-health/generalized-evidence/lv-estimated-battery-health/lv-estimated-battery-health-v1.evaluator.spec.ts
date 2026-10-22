import { evaluateLvEstimatedBatteryHealthV1 } from './lv-estimated-battery-health-v1.evaluator';
import type { LvEstimatedBatteryHealthInputV1 } from './lv-estimated-battery-health-v1.types';
import type {
  LvOperationalConditionInputV1,
  LvOperationalConditionObservationV1,
} from '../lv-operational-condition/lv-operational-condition-v1.types';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from '../lv-operational-condition/lv-operational-condition-v1.constants';

function restObs(
  partial: Partial<LvOperationalConditionObservationV1> & { voltageV: number },
  idx = 1,
): LvOperationalConditionObservationV1 {
  return {
    observationId: partial.observationId ?? `obs-${idx}`,
    sourceMeasurementId: partial.sourceMeasurementId ?? `m-${idx}`,
    restSessionId: partial.restSessionId ?? `sess-${idx}`,
    voltageV: partial.voltageV,
    voltageObservedAt: partial.voltageObservedAt ?? `2026-10-0${idx}T08:00:00.000Z`,
    providerObservationAt:
      partial.providerObservationAt ?? partial.voltageObservedAt ?? `2026-10-0${idx}T08:00:00.000Z`,
    operationalContext: partial.operationalContext ?? 'REST',
    evidenceClass: partial.evidenceClass ?? 'PARKED_REST_CANDIDATE',
    actualRestAgeHours: partial.actualRestAgeHours ?? 8,
    temperatureC: partial.temperatureC ?? null,
    isLvCharging: partial.isLvCharging ?? false,
    engineRunning: partial.engineRunning ?? false,
  };
}

function baseCondition(
  overrides: Partial<LvOperationalConditionInputV1> = {},
): LvOperationalConditionInputV1 {
  return {
    modelVersion: LV_OPERATIONAL_CONDITION_MODEL_VERSION,
    organizationId: 'org',
    vehicleId: 'veh',
    evaluatedAtIso: '2026-10-18T12:00:00.000Z',
    chemistry: {
      normalizedType: 'AGM',
      batterySpecId: 'spec-1',
      sourceType: 'MANUAL',
      sourceConfidence: 0.9,
      nominalVoltageV: 12,
      ampereHours: 70,
      authority: 'VEHICLE_BATTERY_SPEC',
      restingThresholdAuthority: 'BATTERY_STATUS_CLASSIFY_RESTING_VOLTAGE_V1',
    },
    openProviderObservabilityGapCount: 0,
    historicalQueryMode: 'RECENT_DESC_LIMIT',
    inputCoverageIncomplete: false,
    historicalObservationsTruncated: false,
    geDataSelection: {
      rawVoltageRowCount: 0,
      dedupedVoltageRowCount: 0,
      eligibleRestObservationCount: 0,
      measuredFromIso: null,
      measuredToIso: null,
    },
    eligibleRestObservations: [],
    assessmentTimelineObservations: [],
    latestGlobalObservation: null,
    latestEligibleRestObservation: null,
    wakeVoltageObservations: [],
    sessionFeatures: [],
    crankEvidence: null,
    ...overrides,
  };
}

function healthInput(
  overrides: Partial<LvEstimatedBatteryHealthInputV1> & {
    conditionOverrides?: Partial<LvOperationalConditionInputV1>;
  } = {},
): LvEstimatedBatteryHealthInputV1 {
  const { conditionOverrides, ...rest } = overrides;
  return {
    restoreCutoffIso: '2026-10-17T21:55:43.000Z',
    postRestoreObservationCount: 0,
    conditionInput: baseCondition(conditionOverrides),
    ...rest,
  };
}

describe('evaluateLvEstimatedBatteryHealthV1', () => {
  it('keeps N14 operational risk separate from estimated health (explicit reason code)', () => {
    const episodes = [
      restObs({ voltageV: 12.62, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.61, restSessionId: 'b' }, 2),
      restObs({ voltageV: 12.6, restSessionId: 'c' }, 3),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: episodes,
          chemistry: { ...baseCondition().chemistry, normalizedType: 'LEAD_ACID' },
          crankEvidence: {
            source: 'BATTERY_FEATURES',
            crankTripId: 'trip-1',
            crankAtIso: '2026-10-10T08:00:00.000Z',
            vPreCrankV: 12.4,
            vMinCrankV: 10.2,
            crankDropV: 2.2,
            vRecovery5sV: 11.5,
            vRecovery30sV: 12.0,
            crankObservationCount: 2,
          },
        },
      }),
    );
    expect(result.reasonCodes).toContain('HEALTH_N14_OPERATIONAL_RISK_NOT_HEALTH_PROXY');
    expect(result.n14OperationalRiskStatus).toBe('GREEN');
    expect(result.estimatedHealthStatus).toBe('YELLOW');
  });

  it('healthy but temporarily discharged: single critical rest with other good episodes → YELLOW not RED', () => {
    const episodes = [
      restObs({ voltageV: 11.95, restSessionId: 'low', actualRestAgeHours: 10 }, 1),
      restObs({ voltageV: 12.52, restSessionId: 'ok1', actualRestAgeHours: 10 }, 2),
      restObs({ voltageV: 12.48, restSessionId: 'ok2', actualRestAgeHours: 10 }, 3),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes } }),
    );
    expect(result.estimatedHealthStatus).toBe('YELLOW');
    expect(result.reasonCodes).toContain('HEALTH_TEMPORARILY_DISCHARGED_NOT_AGING');
    expect(result.estimatedHealthStatus).not.toBe('RED');
  });

  it('stable rest GREEN but validated weak cranking → YELLOW health', () => {
    const episodes = [
      restObs({ voltageV: 12.55, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.54, restSessionId: 'b' }, 2),
      restObs({ voltageV: 12.53, restSessionId: 'c' }, 3),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: episodes,
          crankEvidence: {
            source: 'BATTERY_FEATURES',
            crankTripId: 'trip-1',
            crankAtIso: '2026-10-10T08:00:00.000Z',
            vPreCrankV: 12.4,
            vMinCrankV: 10.2,
            crankDropV: 2.2,
            vRecovery5sV: 11.5,
            vRecovery30sV: 12.0,
            crankObservationCount: 2,
          },
        },
      }),
    );
    expect(result.estimatedHealthStatus).toBe('YELLOW');
    expect(result.reasonCodes).toContain('HEALTH_LOAD_CRANK_VALIDATED_WEAK');
  });

  it('repeated poor recovery after validated charging context → elevated health concern', () => {
    const episodes = [
      restObs({ voltageV: 12.1, restSessionId: 'w1', actualRestAgeHours: 12 }, 1),
      restObs({ voltageV: 12.05, restSessionId: 'w2', actualRestAgeHours: 12 }, 2),
      restObs({ voltageV: 11.98, restSessionId: 'w3', actualRestAgeHours: 12 }, 3),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: episodes,
          chemistry: { ...baseCondition().chemistry, normalizedType: 'LEAD_ACID' },
        },
      }),
    );
    expect(['YELLOW', 'RED']).toContain(result.estimatedHealthStatus);
    expect(result.estimatedHealthStatus).not.toBe('GREEN');
  });

  it('healthy repeated resting and load evidence → GREEN', () => {
    const episodes = [
      restObs({ voltageV: 12.56, restSessionId: 'a', temperatureC: 18 }, 1),
      restObs({ voltageV: 12.54, restSessionId: 'b', temperatureC: 19 }, 2),
      restObs({ voltageV: 12.55, restSessionId: 'c', temperatureC: 17 }, 3),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: episodes,
          crankEvidence: {
            source: 'BATTERY_FEATURES',
            crankTripId: 'trip-1',
            crankAtIso: '2026-10-15T08:00:00.000Z',
            vPreCrankV: 12.5,
            vMinCrankV: 11.8,
            crankDropV: 0.7,
            vRecovery5sV: 12.2,
            vRecovery30sV: 12.45,
            crankObservationCount: 3,
          },
        },
      }),
    );
    expect(result.estimatedHealthStatus).toBe('GREEN');
    expect(result.supportingSignalFamilies).toContain('LOAD_START_PERFORMANCE');
  });

  it('charging-contaminated latest global context limits charging family support', () => {
    const charging = restObs({
      voltageV: 14.5,
      operationalContext: 'CHARGING',
      isLvCharging: true,
      evidenceClass: 'CHARGING_CONTAMINATED',
    });
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: [],
          latestGlobalObservation: charging,
        },
      }),
    );
    expect(result.reasonCodes).toContain('HEALTH_CHARGING_CONTAMINATION_HIGH');
    expect(result.estimatedHealthStatus).toBe('UNKNOWN');
  });

  it('no temperature on eligible rests → publication not eligible', () => {
    const episodes = [
      restObs({ voltageV: 12.52, restSessionId: 'a', temperatureC: null }, 1),
      restObs({ voltageV: 12.51, restSessionId: 'b', temperatureC: null }, 2),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes } }),
    );
    expect(result.reasonCodes).toContain('HEALTH_TEMPERATURE_UNAVAILABLE');
    expect(result.assessmentEligibility).toBe('NOT_PUBLICATION_READY');
  });

  it('stale crank evidence does not authorize health conclusion from load', () => {
    const episodes = [
      restObs({ voltageV: 12.55, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.54, restSessionId: 'b' }, 2),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: episodes,
          evaluatedAtIso: '2026-10-18T12:00:00.000Z',
          crankEvidence: {
            source: 'BATTERY_FEATURES',
            crankTripId: 'trip-old',
            crankAtIso: '2026-06-01T08:00:00.000Z',
            vPreCrankV: 12.4,
            vMinCrankV: 9.5,
            crankDropV: 2.9,
            vRecovery5sV: 11.0,
            vRecovery30sV: 11.5,
            crankObservationCount: 1,
          },
        },
      }),
    );
    expect(result.reasonCodes).toContain('HEALTH_LOAD_CRANK_STALE');
    expect(result.estimatedHealthStatus).not.toBe('RED');
  });

  it('missing chemistry → UNKNOWN health', () => {
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          chemistry: { ...baseCondition().chemistry, normalizedType: 'UNKNOWN', authority: 'NONE' },
          eligibleRestObservations: [
            restObs({ voltageV: 12.5, restSessionId: 'a' }, 1),
            restObs({ voltageV: 12.48, restSessionId: 'b' }, 2),
          ],
        },
      }),
    );
    expect(result.estimatedHealthStatus).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('HEALTH_CHEMISTRY_UNKNOWN');
  });

  it('insufficient independent episodes → UNKNOWN', () => {
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: [restObs({ voltageV: 12.5, restSessionId: 'only' })],
        },
      }),
    );
    expect(result.estimatedHealthStatus).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('HEALTH_INSUFFICIENT_INDEPENDENT_EPISODES');
  });

  it('duplicate source measurements do not inflate episode count (dedup at input layer)', () => {
    const dup = restObs({ voltageV: 12.52, sourceMeasurementId: 'same', restSessionId: 's1' }, 1);
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          eligibleRestObservations: [dup, { ...dup, observationId: 'obs-dup' }],
        },
      }),
    );
    expect(result.evidenceCounts.qualifiedRestEpisodes).toBeLessThanOrEqual(1);
  });

  it('provider gaps reduce publication eligibility', () => {
    const episodes = [
      restObs({ voltageV: 12.52, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.51, restSessionId: 'b' }, 2),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({
        conditionOverrides: {
          openProviderObservabilityGapCount: 1,
          eligibleRestObservations: episodes,
        },
      }),
    );
    expect(result.reasonCodes).toContain('HEALTH_PROVIDER_GAP_OPEN');
    expect(result.assessmentEligibility).toBe('NOT_PUBLICATION_READY');
  });

  it('P1: repeated critical rests without load corroboration → YELLOW not RED', () => {
    const episodes = Array.from({ length: 12 }, (_, i) =>
      restObs(
        {
          voltageV: i < 3 ? 12.02 : i < 11 ? 12.48 : 12.55,
          restSessionId: `s-${i}`,
          voltageObservedAt: `2026-09-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
        },
        i,
      ),
    );
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes } }),
    );
    expect(result.estimatedHealthStatus).toBe('YELLOW');
    expect(result.decisionTrace.finalRuleId).toBe('RULE_REST_WARNING_OR_DECLINE');
    expect(result.reasonCodes).toContain('HEALTH_REST_LOW_VOLTAGE_NOT_PROVEN_AGING');
    expect(result.reasonCodes).toContain('HEALTH_CORRELATED_EVIDENCE_NOT_CORROBORATION');
  });

  it('P1: correlated families do not inflate confidence to HIGH from rest alone', () => {
    const episodes = [
      restObs({ voltageV: 12.52, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.51, restSessionId: 'b' }, 2),
      restObs({ voltageV: 12.5, restSessionId: 'c' }, 3),
      restObs({ voltageV: 12.49, restSessionId: 'd' }, 4),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes } }),
    );
    expect(result.decisionTrace.independentFamilies).toEqual(['RESTING_CONDITION']);
    expect(result.estimateConfidence).not.toBe('HIGH');
  });

  it('P1: healthy majority with watch episodes → GREEN', () => {
    const episodes = [
      ...Array.from({ length: 19 }, (_, i) =>
        restObs({ voltageV: 12.56, restSessionId: `g-${i}` }, i),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        restObs({ voltageV: 12.52, restSessionId: `w-${i}` }, 20 + i),
      ),
      restObs({ voltageV: 12.18, restSessionId: 'warn-1' }, 28),
      restObs({ voltageV: 12.16, restSessionId: 'warn-2' }, 29),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes } }),
    );
    expect(result.estimatedHealthStatus).toBe('GREEN');
    expect(result.decisionTrace.finalRuleId).toBe('RULE_REST_HEALTHY_MAJORITY');
  });

  it('contradictory N14 RED vs health GREEN without load → damped to YELLOW', () => {
    const episodes = [
      restObs({ voltageV: 11.7, restSessionId: 'c1', actualRestAgeHours: 10 }, 1),
      restObs({ voltageV: 11.65, restSessionId: 'c2', actualRestAgeHours: 10 }, 2),
    ];
    const result = evaluateLvEstimatedBatteryHealthV1(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes } }),
    );
    expect(result.n14OperationalRiskStatus).toBe('RED');
    expect(result.estimatedHealthStatus).not.toBe('GREEN');
    expect(result.measuredSOH).toBe('UNKNOWN');
    expect(result.customerPublicationEnabled).toBe(false);
  });
});
