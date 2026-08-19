import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  projectVehicleReadinessEvaluability,
  projectVehicleReadinessEvaluabilityCondition,
  vehicleReadinessEvaluabilitySourceFingerprint,
  VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE,
} from './vehicle-readiness-evaluability-notification.projector';

function health(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  const module = {
    state: 'good' as const,
    reason: '',
    last_updated_at: null,
    data_stale: false,
    pipeline_available: true,
  };
  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-a',
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    rental_readiness: 'ready',
    blocking_reasons: [],
    modules: {
      battery: module,
      tires: module,
      brakes: module,
      error_codes: module,
      service_compliance: module,
      complaints: module,
      vehicle_alerts: module,
    },
    generated_at: '2026-06-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('projectVehicleReadinessEvaluability (P2.4)', () => {
  it('unevaluable health emits active UNEVALUABLE source', () => {
    const sources = projectVehicleReadinessEvaluability(
      'veh-1',
      'WOB 1',
      health({ availability: 'partial', rental_blocked: null, rental_readiness: 'unevaluable' }),
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      eventType: 'VEHICLE_READINESS_UNEVALUABLE',
      condition: 'UNEVALUABLE',
      cleared: false,
    });
  });

  it('ready health emits cleared EVALUABLE source', () => {
    const sources = projectVehicleReadinessEvaluability('veh-1', 'WOB 1', health());
    expect(sources[0]).toMatchObject({
      eventType: 'VEHICLE_READINESS_UNEVALUABLE',
      condition: 'EVALUABLE',
      cleared: true,
    });
  });

  it('not_ready health emits cleared EVALUABLE source', () => {
    const sources = projectVehicleReadinessEvaluability(
      'veh-1',
      'WOB 1',
      health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
    );
    expect(sources[0].condition).toBe('EVALUABLE');
    expect(sources[0].cleared).toBe(true);
  });

  it('condition mapping treats ready and not_ready as EVALUABLE', () => {
    expect(projectVehicleReadinessEvaluabilityCondition(health())).toBe('EVALUABLE');
    expect(
      projectVehicleReadinessEvaluabilityCondition(
        health({ rental_readiness: 'not_ready', rental_blocked: true, blocking_reasons: ['x'] }),
      ),
    ).toBe('EVALUABLE');
    expect(
      projectVehicleReadinessEvaluabilityCondition(
        health({ rental_readiness: 'unevaluable', rental_blocked: null, availability: 'partial' }),
      ),
    ).toBe('UNEVALUABLE');
  });

  it('golden fingerprint', () => {
    expect(vehicleReadinessEvaluabilitySourceFingerprint('org-a', { vehicleId: 'veh-1' })).toBe(
      'org-a|VEHICLE_READINESS_UNEVALUABLE|VEHICLE|veh-1|vehicle_readiness_unevaluable|v1',
    );
    expect(VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE).toBe('VEHICLE_READINESS_UNEVALUABLE');
  });
});
