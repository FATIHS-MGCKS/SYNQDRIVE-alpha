import { backfillEnforcementPolicyScopes } from './enforcement-policy-scope-backfill.util';

describe('backfillEnforcementPolicyScopes', () => {
  it('runs in dry-run mode without writes', async () => {
    const prisma = {
      enforcementPolicy: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'policy-1',
            organizationId: 'org-1',
            legacyOrgDataAuthorization: {
              vehicleIds: ['veh-1', 'missing'],
              customerIds: [],
              bookingIds: [],
            },
            vehicles: [],
            customers: [],
            bookings: [],
            stations: [],
          },
        ]),
      },
      $transaction: jest.fn(),
      vehicle: { findMany: jest.fn().mockResolvedValue([{ id: 'veh-1' }]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      station: { findMany: jest.fn().mockResolvedValue([]) },
      enforcementPolicyScopeMigrationFinding: { create: jest.fn() },
    };

    const result = await backfillEnforcementPolicyScopes(prisma as never, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.policiesProcessed).toBe(1);
    expect(result.vehiclesLinked).toBe(1);
    expect(result.findingsRecorded).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
