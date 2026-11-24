import { HmOnlyCanonicalReadinessObservationService } from './hm-only-canonical-readiness-observation.service';

describe('HmOnlyCanonicalReadinessObservationService tenant short-circuit', () => {
  it('does not read org entitlements on cross-tenant access', async () => {
    const orgFindUniqueOrThrow = jest.fn();
    const orgProductFindMany = jest.fn();
    const prisma = {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hm-1',
          organizationId: 'org-a',
          vin: 'VIN',
          brand: 'BMW',
          clearanceStatus: 'APPROVED',
          sourceMode: 'HM_ONLY',
          registrationState: 'NOT_REGISTERED',
          hmVehicleReference: 'ref',
          packageType: 'HEALTH',
          updatedAt: new Date(),
          createdAt: new Date(),
          synqdriveVehicleId: null,
        }),
      },
      organization: { findUniqueOrThrow: orgFindUniqueOrThrow, findUnique: jest.fn() },
      organizationProduct: { findMany: orgProductFindMany, findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      vehicleOnboardingCase: { findFirst: jest.fn() },
    };

    const service = new HmOnlyCanonicalReadinessObservationService(prisma as never);
    const result = await service.observeHmOnlyRegistrationAttempt({
      dto: {
        hmVehicleId: 'hm-1',
        organizationId: 'org-b',
        model: 'X5',
        year: 2022,
        fuelType: 'GASOLINE',
        vehicleType: 'SEDAN',
      },
      access: { tenantOrganizationId: 'org-b', isMasterAdmin: false, actorUserId: null },
      skipReadOnlyTransaction: true,
    });

    expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_NOT_EVALUABLE');
    expect(result.canonicalReadiness).not.toBe('CANONICAL_READINESS_PASS');
    expect(orgFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(orgProductFindMany).not.toHaveBeenCalled();
  });
});