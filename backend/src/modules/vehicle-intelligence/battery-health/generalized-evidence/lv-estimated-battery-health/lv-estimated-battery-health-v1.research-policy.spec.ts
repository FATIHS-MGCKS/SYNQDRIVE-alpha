import {
  applyResearchPolicyAfterP1,
  classifyEstimatedHealthWithResearchPolicy,
} from './lv-estimated-battery-health-v1.research-policy';
import {
  evaluateLvEstimatedBatteryHealthV1,
  evaluateLvEstimatedBatteryHealthV1WithResearchPolicy,
} from './lv-estimated-battery-health-v1.evaluator';
import type { LvEstimatedBatteryHealthInputV1 } from './lv-estimated-battery-health-v1.types';
import type {
  LvOperationalConditionInputV1,
  LvOperationalConditionObservationV1,
} from '../lv-operational-condition/lv-operational-condition-v1.types';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from '../lv-operational-condition/lv-operational-condition-v1.constants';

/** Simulated fixture observations — not production vehicle measurements. */
function restObs(
  partial: Partial<LvOperationalConditionObservationV1> & { voltageV: number },
  idx = 1,
): LvOperationalConditionObservationV1 {
  return {
    observationId: partial.observationId ?? `sim-obs-${idx}`,
    sourceMeasurementId: partial.sourceMeasurementId ?? `sim-m-${idx}`,
    restSessionId: partial.restSessionId ?? `sim-sess-${idx}`,
    voltageV: partial.voltageV,
    voltageObservedAt: partial.voltageObservedAt ?? `2026-10-${String(idx).padStart(2, '0')}T08:00:00.000Z`,
    providerObservationAt:
      partial.providerObservationAt ?? partial.voltageObservedAt ?? `2026-10-${String(idx).padStart(2, '0')}T08:00:00.000Z`,
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
    organizationId: 'sim-org',
    vehicleId: 'sim-vehicle',
    evaluatedAtIso: '2026-10-21T12:00:00.000Z',
    chemistry: {
      normalizedType: 'AGM',
      batterySpecId: 'sim-spec',
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

const emptyBands = { GOOD: 0, WATCH: 0, WARNING: 0, CRITICAL: 0, UNSUPPORTED: 0 };

const healthyRestBands = {
  ...emptyBands,
  GOOD: 19,
  WATCH: 8,
  WARNING: 2,
};

function p3PassingContext(
  overrides: Partial<import('./lv-estimated-battery-health-v1.research-policy').ResearchPolicyEvaluationContext> = {},
) {
  return {
    bandCounts: healthyRestBands,
    episodeCount: 29,
    trend: 'STABLE' as const,
    loadSignal: 'GREEN' as const,
    crankStale: false,
    loadAuthorizedForHealth: true,
    loadProvenanceValidated: true,
    observationSpanDays: 21,
    openProviderGaps: 0,
    inputCoverageIncomplete: false,
    historicalObservationsTruncated: false,
    temperatureObservationCount: 5,
    temperatureProvenanceValid: true,
    ...overrides,
  };
}

describe('lv-estimated-battery-health-v1.research-policy (simulated fixtures)', () => {
  it('1) REST-only healthy majority → no GREEN under P2/P3', () => {
    const p1 = classifyEstimatedHealthWithResearchPolicy(
      'P1_BASELINE',
      {
        bandCounts: healthyRestBands,
        episodeCount: 29,
        trend: 'STABLE',
        loadSignal: 'UNKNOWN',
        chemistryKnown: true,
      },
      p3PassingContext({ loadSignal: 'UNKNOWN', loadAuthorizedForHealth: false }),
    );
    expect(p1.status).toBe('GREEN');

    const p2 = classifyEstimatedHealthWithResearchPolicy(
      'P2_LOAD_REQUIRED_GREEN',
      {
        bandCounts: healthyRestBands,
        episodeCount: 29,
        trend: 'STABLE',
        loadSignal: 'UNKNOWN',
        chemistryKnown: true,
      },
      p3PassingContext({ loadSignal: 'UNKNOWN', loadAuthorizedForHealth: false }),
    );
    expect(p2.status).toBe('UNKNOWN');
    expect(p2.extraReasonCodes).toContain('RESEARCH_GREEN_BLOCKED_NO_LOAD');
  });

  it('2) load UNKNOWN → no GREEN under research policies', () => {
    const r = applyResearchPolicyAfterP1(
      'P2_LOAD_REQUIRED_GREEN',
      { status: 'GREEN', ruleId: 'RULE_REST_HEALTHY_MAJORITY', extraReasonCodes: [] },
      p3PassingContext({ loadSignal: 'UNKNOWN', loadAuthorizedForHealth: false }),
    );
    expect(r.status).toBe('UNKNOWN');
  });

  it('3) stale crank → no GREEN under P2/P3', () => {
    const r = applyResearchPolicyAfterP1(
      'P3_CONSERVATIVE_GREEN',
      { status: 'GREEN', ruleId: 'RULE_REST_HEALTHY_MAJORITY', extraReasonCodes: [] },
      p3PassingContext({ crankStale: true, loadSignal: 'GREEN', loadAuthorizedForHealth: false }),
    );
    expect(r.status).toBe('UNKNOWN');
    expect(r.extraReasonCodes).toContain('RESEARCH_GREEN_BLOCKED_STALE_CRANK');
  });

  it('4) missing temperature → no GREEN under P3', () => {
    const r = applyResearchPolicyAfterP1(
      'P3_CONSERVATIVE_GREEN',
      { status: 'GREEN', ruleId: 'RULE_REST_HEALTHY_MAJORITY', extraReasonCodes: [] },
      p3PassingContext({ temperatureObservationCount: 0, temperatureProvenanceValid: false }),
    );
    expect(r.status).toBe('UNKNOWN');
    expect(r.extraReasonCodes).toContain('RESEARCH_GREEN_BLOCKED_NO_TEMPERATURE');
  });

  it('5) short history → no GREEN under P3', () => {
    const r = applyResearchPolicyAfterP1(
      'P3_CONSERVATIVE_GREEN',
      { status: 'GREEN', ruleId: 'RULE_REST_HEALTHY_MAJORITY', extraReasonCodes: [] },
      p3PassingContext({ episodeCount: 5, observationSpanDays: 21 }),
    );
    expect(r.status).toBe('UNKNOWN');
    expect(r.extraReasonCodes).toContain('RESEARCH_GREEN_BLOCKED_INSUFFICIENT_EPISODE_HISTORY');
  });

  it('6) critical REST finding → justified YELLOW on P1 (not fabricated RED)', () => {
    const r = classifyEstimatedHealthWithResearchPolicy(
      'P1_BASELINE',
      {
        bandCounts: { ...emptyBands, GOOD: 1, WATCH: 8, CRITICAL: 3 },
        episodeCount: 12,
        trend: 'STABLE',
        loadSignal: 'UNKNOWN',
        chemistryKnown: true,
      },
      p3PassingContext(),
    );
    expect(r.status).toBe('YELLOW');
    expect(r.ruleId).toBe('RULE_REST_WARNING_OR_DECLINE');
    expect(r.status).not.toBe('RED');
  });

  it('7) missing crank measurements do not invent battery deterioration (simulated)', () => {
    const episodes = [
      restObs({ voltageV: 12.55, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.54, restSessionId: 'b' }, 2),
    ];
    const out = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
      healthInput({ conditionOverrides: { eligibleRestObservations: episodes, crankEvidence: null } }),
      'P3_CONSERVATIVE_GREEN',
    );
    expect(out.estimatedHealthStatus).not.toBe('RED');
    expect(out.reasonCodes).toContain('HEALTH_LOAD_CRANK_UNAVAILABLE');
  });

  it('8) fresh load signal without validated provenance → no GREEN under P3', () => {
    const r = applyResearchPolicyAfterP1(
      'P3_CONSERVATIVE_GREEN',
      { status: 'GREEN', ruleId: 'RULE_REST_HEALTHY_MAJORITY', extraReasonCodes: [] },
      p3PassingContext({
        loadSignal: 'GREEN',
        loadAuthorizedForHealth: true,
        loadProvenanceValidated: false,
      }),
    );
    expect(r.status).toBe('UNKNOWN');
    expect(r.extraReasonCodes).toContain('RESEARCH_GREEN_BLOCKED_LOAD_PROVENANCE_INVALID');
  });

  it('9) full synthetic evidence → GREEN only when P3 gates satisfied (simulated)', () => {
    const episodes: LvOperationalConditionObservationV1[] = [];
    for (let i = 0; i < 10; i += 1) {
      const day = 1 + i * 2;
      episodes.push(
        restObs(
          {
            voltageV: 12.6,
            restSessionId: `sess-${i}`,
            voltageObservedAt: `2026-09-${String(day).padStart(2, '0')}T08:00:00.000Z`,
            temperatureC: 18,
          },
          i + 1,
        ),
      );
    }
    const crank = {
      source: 'BATTERY_FEATURES' as const,
      crankTripId: 'trip-sim-1',
      crankAtIso: '2026-10-20T07:00:00.000Z',
      vPreCrankV: 12.4,
      vMinCrankV: 11.2,
      crankDropV: 1.2,
      vRecovery5sV: 12.1,
      vRecovery30sV: 12.3,
      crankObservationCount: 3,
    };
    const input = healthInput({
      conditionOverrides: {
        eligibleRestObservations: episodes,
        crankEvidence: crank,
        evaluatedAtIso: '2026-10-21T12:00:00.000Z',
      },
    });
    const p3 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(input, 'P3_CONSERVATIVE_GREEN');
    expect(p3.estimatedHealthStatus).toBe('GREEN');
    expect(p3.decisionTrace.researchPolicyVariant).toBe('P3_CONSERVATIVE_GREEN');
  });

  it('10) Policy A default entrypoint unchanged (P1 regression)', () => {
    const episodes = [
      restObs({ voltageV: 12.62, restSessionId: 'a' }, 1),
      restObs({ voltageV: 12.61, restSessionId: 'b' }, 2),
      restObs({ voltageV: 12.6, restSessionId: 'c' }, 3),
    ];
    const input = healthInput({ conditionOverrides: { eligibleRestObservations: episodes } });
    const baseline = evaluateLvEstimatedBatteryHealthV1(input);
    const explicitP1 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(input, 'P1_BASELINE');
    expect(baseline.estimatedHealthStatus).toBe(explicitP1.estimatedHealthStatus);
    expect(baseline.decisionTrace.policyId).toBe(
      'LV_ESTIMATED_BATTERY_HEALTH_V1_DECISION_POLICY_P1_2026-10-19',
    );
    expect(baseline.decisionTrace.researchPolicyVariant).toBe('P1_BASELINE');
  });
});
