import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RentalHealthController } from './rental-health.controller';

describe('RentalHealthController scoped fleet', () => {
  const rentalHealth = { getVehicleHealth: jest.fn() };
  const rentalHealthFleet = { listFleetHealthPage: jest.fn() };
  const prisma = { vehicle: { findMany: jest.fn() } };
  const tireRentalReview = {};
  const brakeRentalReview = {};

  const controller = new RentalHealthController(
    rentalHealth as any,
    rentalHealthFleet as any,
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
        availability: { totalSelected: 1, byVehicleStatus: {}, semantics: 'vehicle_status_operational_vs_rental_health_per_row' },
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
});
