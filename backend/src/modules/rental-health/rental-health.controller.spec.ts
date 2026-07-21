import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RentalHealthController } from './rental-health.controller';
import {
  buildDegradedVehicleHealth,
  RENTAL_HEALTH_DEGRADATION_CODES,
} from './rental-health.types';

describe('RentalHealthController scoped fleet', () => {
  const rentalHealth = { getVehicleHealth: jest.fn() };
  const rentalHealthFleet = { listFleetHealthPage: jest.fn() };
  const prisma = { vehicle: { findMany: jest.fn() } };
  const tireRentalReview = {};
  const brakeRentalReview = {};

  const rentalHealthSummary = { getFleetRowsBatch: jest.fn() };
  const controller = new RentalHealthController(
    rentalHealth as any,
    rentalHealthFleet as any,
    rentalHealthSummary as any,
    prisma as any,
    tireRentalReview as any,
    brakeRentalReview as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies org, roles, and permissions guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RentalHealthController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it('delegates scoped fleet health to RentalHealthFleetService', async () => {
    const payload = {
      summary: {
        availability: {
          totalSelected: 1,
          byVehicleStatus: {},
          semantics: 'vehicle_status_operational_vs_rental_health_per_row',
        },
        pageHealth: { rentalBlocked: 0, byOverallState: {}, vehiclesWithDetail: 0 },
      },
      data: [],
      meta: { limit: 25, nextCursor: null },
    };
    rentalHealthFleet.listFleetHealthPage.mockResolvedValue(payload);

    await expect(
      controller.getScopedFleetHealth('org-1', { limit: 25 } as any, { user: { id: 'user-1' } }),
    ).resolves.toEqual(payload);

    expect(rentalHealthFleet.listFleetHealthPage).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      { limit: 25 },
    );
  });

  it('delegates legacy fleet health to summary batch read model', async () => {
    const degraded = buildDegradedVehicleHealth({
      vehicle_id: 'veh-bad',
      organization_id: 'org-1',
      availability: 'unavailable',
      degradation: {
        code: RENTAL_HEALTH_DEGRADATION_CODES.PIPELINE_UNAVAILABLE,
        message: 'Gesundheitsdaten konnten nicht geladen werden',
      },
    });
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'veh-bad' }]);
    rentalHealthSummary.getFleetRowsBatch.mockResolvedValue([degraded]);

    const res = await controller.getFleetHealth('org-1');

    expect(rentalHealthSummary.getFleetRowsBatch).toHaveBeenCalledWith('org-1', ['veh-bad']);
    expect(res.vehicles[0].rental_blocked).toBeNull();
    expect(res.vehicles[0].availability).toBe('unavailable');
    expect(res.vehicles[0].degradation?.message).not.toMatch(/prisma|timeout|Error/i);
  });

  it('does not leak internal error details in degraded payload', () => {
    const degraded = buildDegradedVehicleHealth({
      vehicle_id: 'veh-x',
      organization_id: 'org-1',
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
