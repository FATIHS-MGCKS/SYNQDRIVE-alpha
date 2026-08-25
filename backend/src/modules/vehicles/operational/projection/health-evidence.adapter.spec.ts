import { healthEvidenceFromVehicleHealth } from './health-evidence.adapter';
import type { VehicleHealth } from '../../../rental-health/rental-health.types';
import { RENTAL_HEALTH_MODULE_KEYS } from '../../../rental-health/rental-health.types';

function baseHealth(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  const modules = Object.fromEntries(
    RENTAL_HEALTH_MODULE_KEYS.map((key) => [
      key,
      {
        state: 'good' as const,
        data_stale: false,
        last_updated_at: '2026-08-25T12:00:00.000Z',
        reason: 'ok',
      },
    ]),
  ) as VehicleHealth['modules'];

  return {
    vehicle_id: 'veh-1',
    organization_id: 'org-1',
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    modules,
    generated_at: '2026-08-25T12:00:00.000Z',
    evaluated_at: '2026-08-25T12:00:00.000Z',
    ...overrides,
  };
}

describe('healthEvidenceFromVehicleHealth', () => {
  it('maps canonical rental health fields to P0.2 health evidence snapshot', () => {
    const snapshot = healthEvidenceFromVehicleHealth(
      baseHealth({
        overall_state: 'critical',
        availability: 'ready',
        rental_blocked: true,
        generated_at: '2026-08-25T11:00:00.000Z',
      }),
    );

    expect(snapshot).toMatchObject({
      conditionState: 'critical',
      pipelineAvailability: 'ready',
      rentalBlocked: true,
      generatedAt: '2026-08-25T11:00:00.000Z',
      anyModuleDataStale: false,
      telemetryDependentModulesEvaluated: true,
    });
  });

  it('flags stale modules and unavailable pipeline conservatively', () => {
    const modules = baseHealth().modules;
    modules.battery = {
      state: 'warning',
      data_stale: true,
      last_updated_at: '2026-07-01T00:00:00.000Z',
      reason: 'stale',
    };

    const snapshot = healthEvidenceFromVehicleHealth(
      baseHealth({
        availability: 'unavailable',
        modules,
        generated_at: undefined,
        evaluated_at: '2026-07-01T00:00:00.000Z',
      }),
    );

    expect(snapshot.pipelineAvailability).toBe('unavailable');
    expect(snapshot.anyModuleDataStale).toBe(true);
    expect(snapshot.generatedAt).toBe('2026-07-01T00:00:00.000Z');
  });
});
