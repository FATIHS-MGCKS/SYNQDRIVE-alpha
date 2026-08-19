import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import {
  LEGACY_AGGREGATE_EVENT_TYPES,
  projectVehicleReadinessAggregate,
  projectVehicleReadinessAggregateCondition,
  VEHICLE_READINESS_AGGREGATE_EVENT_TYPE,
  vehicleReadinessSourceFingerprint,
} from './vehicle-readiness-notification.projector';

const VEH = 'veh-1';
const LABEL = 'WOB A 1001';
const ORG = 'org-a';

function baseHealth(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  const module = {
    state: 'good' as const,
    reason: '',
    last_updated_at: null,
    data_stale: false,
    pipeline_available: true,
  };
  return {
    vehicle_id: VEH,
    organization_id: ORG,
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

describe('projectVehicleReadinessAggregate', () => {
  it('READY health emits cleared VEHICLE_NOT_READY source', () => {
    const sources = projectVehicleReadinessAggregate(VEH, LABEL, baseHealth());
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      eventType: 'VEHICLE_NOT_READY',
      condition: 'READY',
      cleared: true,
    });
  });

  it('NOT_READY health emits active VEHICLE_NOT_READY source', () => {
    const sources = projectVehicleReadinessAggregate(
      VEH,
      LABEL,
      baseHealth({
        rental_blocked: true,
        rental_readiness: 'not_ready',
        blocking_reasons: ['tire critical'],
      }),
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      eventType: 'VEHICLE_NOT_READY',
      condition: 'NOT_READY',
      cleared: false,
      blockingReasonCount: 1,
    });
  });

  it('UNEVALUABLE health emits no sources', () => {
    const sources = projectVehicleReadinessAggregate(
      VEH,
      LABEL,
      baseHealth({
        availability: 'partial',
        rental_blocked: null,
        rental_readiness: 'unevaluable',
      }),
    );
    expect(sources).toHaveLength(0);
  });

  it('never emits BLOCKED_VEHICLE or MAINTENANCE_REQUIRED', () => {
    const blocked = projectVehicleReadinessAggregate(
      VEH,
      LABEL,
      baseHealth({ rental_blocked: true, rental_readiness: 'not_ready' }),
    );
    for (const source of blocked) {
      expect(source.eventType).toBe(VEHICLE_READINESS_AGGREGATE_EVENT_TYPE);
      expect(LEGACY_AGGREGATE_EVENT_TYPES as readonly string[]).not.toContain(source.eventType);
    }
  });

  it('golden fingerprint uses registry conditionCode', () => {
    expect(
      vehicleReadinessSourceFingerprint(ORG, { vehicleId: VEH }),
    ).toBe(`org-a|VEHICLE_NOT_READY|VEHICLE|veh-1|vehicle_not_ready|v1`);
  });
});

describe('projectVehicleReadinessAggregateCondition', () => {
  it('maps rental_readiness values', () => {
    expect(
      projectVehicleReadinessAggregateCondition(baseHealth({ rental_readiness: 'ready' })),
    ).toBe('READY');
    expect(
      projectVehicleReadinessAggregateCondition(
        baseHealth({ rental_readiness: 'not_ready', rental_blocked: true }),
      ),
    ).toBe('NOT_READY');
    expect(
      projectVehicleReadinessAggregateCondition(
        baseHealth({ rental_readiness: 'unevaluable', rental_blocked: null }),
      ),
    ).toBe('UNEVALUABLE');
  });
});
