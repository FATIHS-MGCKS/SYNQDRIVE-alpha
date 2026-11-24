import { HmOnlyCanonicalReadinessObservationService } from './hm-only-canonical-readiness-observation.service';
import {
  getHmReadinessObservationMetric,
  resetHmReadinessObservationMetricsForTests,
} from './hm-only-canonical-readiness-observability';

describe('HmOnlyCanonicalReadinessObservationService', () => {
  beforeEach(() => {
    resetHmReadinessObservationMetricsForTests();
  });

  it('evaluates ICE candidate without persisting (mocked read model)', async () => {
    const hmId = 'hm-1';
    const orgId = 'org-1';
    const prisma = {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: hmId,
          organizationId: orgId,
          vin: 'WBA12345678901234',
          brand: 'BMW',
          clearanceStatus: 'APPROVED',
          sourceMode: 'HM_ONLY',
          registrationState: 'NOT_REGISTERED',
          hmVehicleReference: 'hm-ref',
          packageType: 'HEALTH',
          updatedAt: new Date(),
          createdAt: new Date(),
          synqdriveVehicleId: null,
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: orgId,
          status: 'ACTIVE',
          businessType: 'RENTAL',
        }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vehicleOnboardingCase: { findFirst: jest.fn().mockResolvedValue(null) },
      billingBillableVehicleAssignment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      organizationProduct: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'op-1',
            status: 'ACTIVE',
            product: { slug: 'RENTAL' },
            productId: 'p1',
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'op-1',
          status: 'ACTIVE',
          product: { slug: 'RENTAL' },
          productId: 'p1',
        }),
      },
      billingSubscriptionItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 'base-1' }),
      },
    };

    const service = new HmOnlyCanonicalReadinessObservationService(prisma as never);
    const result = await service.observeHmOnlyRegistrationAttempt({
      dto: {
        hmVehicleId: hmId,
        organizationId: orgId,
        model: 'X5',
        year: 2022,
        fuelType: 'GASOLINE',
        vehicleType: 'SEDAN',
      },
      access: { tenantOrganizationId: orgId, isMasterAdmin: false, actorUserId: null },
    });

    expect(result.legacyAdmission).toBe('LEGACY_ADMISSIBLE');
    expect(result.canonicalAdmission).toBe('CANONICAL_ADMISSION_ELIGIBLE');
    expect(result.canonicalReadiness).toBe('CANONICAL_READINESS_PASS');
    expect(result.divergenceLegacyOnly).toBe(false);
    expect(getHmReadinessObservationMetric('hm_observation_evaluated_total')).toBe(1);
  });
});