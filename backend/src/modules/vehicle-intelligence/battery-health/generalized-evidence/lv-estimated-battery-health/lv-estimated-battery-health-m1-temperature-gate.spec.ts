import { evaluateLvEstimatedBatteryHealthV1 } from './lv-estimated-battery-health-v1.evaluator';
import type { LvEstimatedBatteryHealthInputV1 } from './lv-estimated-battery-health-v1.types';
import type { LvOperationalConditionObservationV1 } from '../lv-operational-condition/lv-operational-condition-v1.types';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from '../lv-operational-condition/lv-operational-condition-v1.constants';

/**
 * M1 (temperature publication gate) — analysis-only in P11 scope.
 * Documents current production behavior; P11 does not relax NOT_PUBLICATION_READY.
 */
describe('M1 temperature publication gate (analysis, unchanged in P11)', () => {
  function restObs(voltageV: number, session: string): LvOperationalConditionObservationV1 {
    return {
      observationId: `obs-${session}`,
      sourceMeasurementId: `m-${session}`,
      restSessionId: session,
      voltageV,
      voltageObservedAt: '2026-10-18T08:00:00.000Z',
      providerObservationAt: '2026-10-18T08:00:00.000Z',
      operationalContext: 'REST',
      evidenceClass: 'PARKED_REST_CANDIDATE',
      actualRestAgeHours: 8,
      temperatureC: null,
      isLvCharging: false,
      engineRunning: false,
    };
  }

  it('missing temperature still forces NOT_PUBLICATION_READY (baseline for future M1 change)', () => {
    const episodes = [restObs(12.55, 'a'), restObs(12.54, 'b'), restObs(12.53, 'c')];
    const input: LvEstimatedBatteryHealthInputV1 = {
      restoreCutoffIso: '2026-10-17T21:55:43.000Z',
      postRestoreObservationCount: 0,
      conditionInput: {
        modelVersion: LV_OPERATIONAL_CONDITION_MODEL_VERSION,
        organizationId: 'org',
        vehicleId: 'veh',
        evaluatedAtIso: '2026-10-18T12:00:00.000Z',
        chemistry: {
          normalizedType: 'AGM',
          batterySpecId: 's',
          sourceType: 'MANUAL',
          sourceConfidence: 1,
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
          eligibleRestObservationCount: 2,
          measuredFromIso: null,
          measuredToIso: null,
        },
        eligibleRestObservations: episodes,
        assessmentTimelineObservations: episodes,
        latestGlobalObservation: null,
        latestEligibleRestObservation: episodes[1],
        wakeVoltageObservations: [],
        sessionFeatures: [],
        crankEvidence: null,
      },
    };
    const result = evaluateLvEstimatedBatteryHealthV1(input);
    expect(result.assessmentEligibility).toBe('NOT_PUBLICATION_READY');
    expect(result.reasonCodes).toContain('HEALTH_TEMPERATURE_UNAVAILABLE');
    expect(result.estimateConfidence).toBe('LOW');
  });
});
