import * as fs from 'fs';
import * as path from 'path';
import { evaluateLvEstimatedBatteryHealthV1 } from './lv-estimated-battery-health-v1.evaluator';
import { evaluateLvEstimatedBatteryHealthV1WithResearchPolicy } from './lv-estimated-battery-health-v1.evaluator';
import type { LvEstimatedBatteryHealthInputV1 } from './lv-estimated-battery-health-v1.types';
import type { LvOperationalConditionObservationV1 } from '../lv-operational-condition/lv-operational-condition-v1.types';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from '../lv-operational-condition/lv-operational-condition-v1.constants';

type FixtureVehicle = {
  label: string;
  vehicleId: string;
  chemistry: { type: string };
  episodes: LvOperationalConditionObservationV1[];
  n16Summary: { status: string; ruleId: string };
};

function mapEpisode(raw: Record<string, unknown>): LvOperationalConditionObservationV1 {
  return {
    observationId: String(raw.observationId),
    sourceMeasurementId: String(raw.sourceMeasurementId),
    restSessionId: raw.restSessionId ? String(raw.restSessionId) : null,
    voltageV: Number(raw.voltageV),
    voltageObservedAt: String(raw.voltageObservedAt),
    providerObservationAt: raw.providerObservationAt ? String(raw.providerObservationAt) : null,
    operationalContext: 'REST',
    evidenceClass: String(raw.evidenceClass ?? 'PARKED_REST_CANDIDATE'),
    actualRestAgeHours: Number(raw.actualRestAgeHours),
    temperatureC: null,
    isLvCharging: false,
    engineRunning: false,
  };
}

/** Production pattern: low REST sample followed by charging within ~10s (audit Q2/Q3). */
function withProductionPreStartFollowUps(
  episodes: LvOperationalConditionObservationV1[],
): LvOperationalConditionObservationV1[] {
  const timeline = [...episodes];
  for (const ep of episodes) {
    const isLow = ep.voltageV < 12.2;
    const shortRest = (ep.actualRestAgeHours ?? 99) < 6;
    if (!isLow || !shortRest) continue;
    const t = Date.parse(ep.voltageObservedAt);
    timeline.push({
      ...ep,
      observationId: `${ep.observationId}-wake-followup`,
      voltageObservedAt: new Date(t + 10_000).toISOString(),
      voltageV: ep.voltageV + 1.6,
      isLvCharging: true,
      operationalContext: 'CHARGING',
      evidenceClass: 'CHARGING_CONTAMINATED',
      engineRunning: false,
    });
  }
  return timeline.sort(
    (a, b) => Date.parse(a.voltageObservedAt) - Date.parse(b.voltageObservedAt),
  );
}

function buildInput(
  v: FixtureVehicle,
  evaluatedAt: string,
): LvEstimatedBatteryHealthInputV1 {
  const episodes = v.episodes.map((e) => mapEpisode(e as unknown as Record<string, unknown>));
  const timeline = withProductionPreStartFollowUps(episodes);
  const chemType = v.chemistry.type === 'LEAD_ACID' ? 'LEAD_ACID' : 'AGM';
  return {
    restoreCutoffIso: '2026-10-17T21:55:43.000Z',
    postRestoreObservationCount: 100,
    conditionInput: {
      modelVersion: LV_OPERATIONAL_CONDITION_MODEL_VERSION,
      organizationId: 'org-fixture',
      vehicleId: v.vehicleId,
      evaluatedAtIso: evaluatedAt,
      chemistry: {
        normalizedType: chemType,
        batterySpecId: 'spec',
        sourceType: 'MANUAL',
        sourceConfidence: 1,
        nominalVoltageV: 12,
        ampereHours: 70,
        authority: 'VEHICLE_BATTERY_SPEC',
        restingThresholdAuthority: 'BATTERY_STATUS_CLASSIFY_RESTING_VOLTAGE_V1',
      },
      openProviderObservabilityGapCount: v.label === 'AUDI' ? 1 : 0,
      historicalQueryMode: 'RECENT_DESC_LIMIT',
      inputCoverageIncomplete: false,
      historicalObservationsTruncated: false,
      geDataSelection: {
        rawVoltageRowCount: 0,
        dedupedVoltageRowCount: 0,
        eligibleRestObservationCount: episodes.length,
        measuredFromIso: null,
        measuredToIso: null,
      },
      eligibleRestObservations: episodes,
      assessmentTimelineObservations: timeline,
      latestGlobalObservation: null,
      latestEligibleRestObservation: episodes[episodes.length - 1] ?? null,
      wakeVoltageObservations: [],
      sessionFeatures: [],
      crankEvidence: {
        source: 'BATTERY_FEATURES',
        crankTripId: null,
        crankAtIso: '2026-07-16T08:00:00.000Z',
        vPreCrankV: null,
        vMinCrankV: null,
        crankDropV: null,
        vRecovery5sV: null,
        vRecovery30sV: null,
        crankObservationCount: 0,
      },
    },
  };
}

describe('P11 production episode fixture (offline replay)', () => {
  const fixturePath = path.join(
    __dirname,
    'fixtures',
    'n16-p10-production-episodes.fixture.json',
  );
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
    evaluatedAt: string;
    vehicles: FixtureVehicle[];
  };

  it('Tiguan: P1 YELLOW → P11 GREEN (recovered single CRITICAL)', () => {
    const v = raw.vehicles.find((x) => x.label === 'TIGUAN')!;
    const input = buildInput(v, raw.evaluatedAt);
    const p1 = evaluateLvEstimatedBatteryHealthV1(input);
    const p11 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
      input,
      'P11_CONDITION_POLICY_V2',
    );
    expect(p1.estimatedHealthStatus).toBe('YELLOW');
    expect(p11.estimatedHealthStatus).toBe('GREEN');
    expect(p11.decisionTrace.p11ShadowRuleId).toBe('P11_RULE_GREEN_STABLE_MEDIAN_AND_RECENCY');
  });

  it('Arteon: P1 YELLOW, P11 YELLOW (recurrent critical pattern)', () => {
    const v = raw.vehicles.find((x) => x.label === 'ARTEON')!;
    const input = buildInput(v, raw.evaluatedAt);
    const p1 = evaluateLvEstimatedBatteryHealthV1(input);
    const p11 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
      input,
      'P11_CONDITION_POLICY_V2',
    );
    expect(p1.estimatedHealthStatus).toBe('YELLOW');
    expect(p11.estimatedHealthStatus).toBe('YELLOW');
    expect(p11.reasonCodes).toContain('HEALTH_P11_LOW_VOLTAGE_EVENT_RETAINED');
  });

  it('Audi: P1 YELLOW; P11 YELLOW on anchor (recency improved vs lifetime CRIT)', () => {
    const v = raw.vehicles.find((x) => x.label === 'AUDI')!;
    const input = buildInput(v, raw.evaluatedAt);
    const p1 = evaluateLvEstimatedBatteryHealthV1(input);
    const p11 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
      input,
      'P11_CONDITION_POLICY_V2',
    );
    expect(p1.estimatedHealthStatus).toBe('YELLOW');
    expect(p11.estimatedHealthStatus).toBe('YELLOW');
    expect(p11.decisionTrace.p11ShadowRuleId).toMatch(/P11_RULE_YELLOW/);
  });

  it('confidence and publication eligibility unchanged vs P1 on same input', () => {
    const v = raw.vehicles.find((x) => x.label === 'TIGUAN')!;
    const input = buildInput(v, raw.evaluatedAt);
    const p1 = evaluateLvEstimatedBatteryHealthV1(input);
    const p11 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(
      input,
      'P11_CONDITION_POLICY_V2',
    );
    expect(p11.estimateConfidence).toBe(p1.estimateConfidence);
    expect(p11.assessmentEligibility).toBe(p1.assessmentEligibility);
  });
});
