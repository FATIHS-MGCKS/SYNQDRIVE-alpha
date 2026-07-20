import { RentalHealthController } from './rental-health.controller';
import { RentalHealthService } from './rental-health.service';
import {
  buildDegradedVehicleHealth,
  RENTAL_HEALTH_DEGRADATION_CODES,
  type VehicleHealth,
} from './rental-health.types';

function healthyVehicle(vehicleId: string, orgId: string): VehicleHealth {
  const module = {
    state: 'good' as const,
    reason: 'OK',
    last_updated_at: '2026-07-20T10:00:00.000Z',
    data_stale: false,
    pipeline_available: true,
  };
  return {
    vehicle_id: vehicleId,
    organization_id: orgId,
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: module,
      tires: module,
      brakes: module,
      error_codes: module,
      service_compliance: module,
      complaints: module,
      vehicle_alerts: { ...module, state: 'n_a' },
    },
    generated_at: '2026-07-20T10:00:00.000Z',
  };
}

describe('RentalHealthController.getFleetHealth', () => {
  const orgId = 'org-a';
  const rentalHealth = { getVehicleHealth: jest.fn() };
  const prisma = { vehicle: { findMany: jest.fn() } };
  const tireRentalReview = {};
  const brakeRentalReview = {};

  const controller = new RentalHealthController(
    rentalHealth as unknown as RentalHealthService,
    prisma as any,
    tireRentalReview as any,
    brakeRentalReview as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('degrades a single failed vehicle without false rental_blocked', async () => {
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'veh-bad' }, { id: 'veh-ok' }]);
    rentalHealth.getVehicleHealth
      .mockRejectedValueOnce(new Error('internal prisma timeout'))
      .mockResolvedValueOnce(healthyVehicle('veh-ok', orgId));

    const res = await controller.getFleetHealth(orgId);

    expect(res.vehicles).toHaveLength(2);
    const failed = res.vehicles.find((v) => v.vehicle_id === 'veh-bad')!;
    const ok = res.vehicles.find((v) => v.vehicle_id === 'veh-ok')!;

    expect(failed.overall_state).toBe('unknown');
    expect(failed.availability).toBe('unavailable');
    expect(failed.rental_blocked).toBeNull();
    expect(failed.degradation).toEqual({
      code: RENTAL_HEALTH_DEGRADATION_CODES.PIPELINE_UNAVAILABLE,
      message: 'Gesundheitsdaten konnten nicht geladen werden',
    });
    expect(failed.degradation?.message).not.toMatch(/prisma|timeout|Error/i);
    expect(failed).not.toHaveProperty('_error');

    expect(ok.rental_blocked).toBe(false);
    expect(ok.availability).toBe('ready');
  });

  it('degrades multiple failed vehicles and keeps healthy ones correct', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'veh-bad-1' },
      { id: 'veh-bad-2' },
      { id: 'veh-ok' },
    ]);
    rentalHealth.getVehicleHealth
      .mockRejectedValueOnce(new Error('boom-1'))
      .mockRejectedValueOnce(new Error('boom-2'))
      .mockResolvedValueOnce(healthyVehicle('veh-ok', orgId));

    const res = await controller.getFleetHealth(orgId);

    expect(res.vehicles).toHaveLength(3);
    for (const vehicle of res.vehicles.filter((v) => v.vehicle_id.startsWith('veh-bad'))) {
      expect(vehicle.rental_blocked).toBeNull();
      expect(vehicle.availability).toBe('unavailable');
    }
    expect(res.vehicles.find((v) => v.vehicle_id === 'veh-ok')?.rental_blocked).toBe(false);
  });

  it('degrades all vehicles when every pipeline fails', async () => {
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'veh-1' }, { id: 'veh-2' }]);
    rentalHealth.getVehicleHealth.mockRejectedValue(new Error('all down'));

    const res = await controller.getFleetHealth(orgId);

    expect(res.vehicles).toHaveLength(2);
    expect(res.vehicles.every((v) => v.rental_blocked === null)).toBe(true);
    expect(res.vehicles.every((v) => v.availability === 'unavailable')).toBe(true);
    expect(res.vehicles.every((v) => v.overall_state === 'unknown')).toBe(true);
  });

  it('does not leak internal error details in degraded payload', () => {
    const degraded = buildDegradedVehicleHealth({
      vehicle_id: 'veh-x',
      organization_id: orgId,
      degradation: {
        code: RENTAL_HEALTH_DEGRADATION_CODES.PIPELINE_UNAVAILABLE,
        message: 'Gesundheitsdaten konnten nicht geladen werden',
      },
    });

    expect(degraded).not.toHaveProperty('_error');
    expect(degraded.degradation?.message).toBe(
      'Gesundheitsdaten konnten nicht geladen werden',
    );
  });
});
