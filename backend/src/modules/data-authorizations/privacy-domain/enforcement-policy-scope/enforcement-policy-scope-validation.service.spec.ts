import { EnforcementPolicyScopeResourceType } from '@prisma/client';
import { EnforcementPolicyScopeValidationService } from './enforcement-policy-scope-validation.service';

describe('EnforcementPolicyScopeValidationService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';

  let prisma: {
    vehicle: { findMany: jest.Mock };
    customer: { findMany: jest.Mock };
    booking: { findMany: jest.Mock };
    station: { findMany: jest.Mock };
    enforcementPolicyScopeMigrationFinding: { create: jest.Mock };
  };

  let service: EnforcementPolicyScopeValidationService;

  beforeEach(() => {
    prisma = {
      vehicle: { findMany: jest.fn() },
      customer: { findMany: jest.fn() },
      booking: { findMany: jest.fn() },
      station: { findMany: jest.fn() },
      enforcementPolicyScopeMigrationFinding: { create: jest.fn() },
    };
    service = new EnforcementPolicyScopeValidationService(prisma as never);
  });

  it('deduplicates scope ids', () => {
    const normalized = service.normalizeScopeSets({
      vehicleIds: ['v1', 'v1', ' v1 '],
      customerIds: [],
      bookingIds: [],
      stationIds: [],
    });
    expect(normalized.vehicleIds).toEqual(['v1']);
  });

  it('rejects mixed valid and invalid vehicle ids without leaking foreign ids', async () => {
    prisma.vehicle.findMany.mockResolvedValue([{ id: 'veh-valid' }]);

    await expect(
      service.assertAllValidOrThrow(orgId, {
        vehicleIds: ['veh-valid', 'veh-foreign'],
        customerIds: [],
        bookingIds: [],
        stationIds: [],
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'ENFORCEMENT_POLICY_INVALID_SCOPE_RESOURCES',
        message: expect.not.stringContaining('veh-foreign'),
      },
    });
  });

  it('records migration findings for missing legacy ids', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);

    const result = await service.validateAndResolve(
      orgId,
      { vehicleIds: ['missing-1'], customerIds: [], bookingIds: [], stationIds: [] },
      { recordFindings: true, enforcementPolicyId: 'policy-1' },
    );

    expect(result.invalidCount).toBe(1);
    expect(prisma.enforcementPolicyScopeMigrationFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgId,
          resourceType: EnforcementPolicyScopeResourceType.VEHICLE,
          referenceFingerprint: expect.any(String),
        }),
      }),
    );
    expect(
      prisma.enforcementPolicyScopeMigrationFinding.create.mock.calls[0][0].data.referenceFingerprint,
    ).not.toContain('missing-1');
  });

  it('scopes tenant lookup by organizationId', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);

    await service.validateAndResolve(otherOrgId, {
      vehicleIds: ['veh-1'],
      customerIds: [],
      bookingIds: [],
      stationIds: [],
    });

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      where: { organizationId: otherOrgId, id: { in: ['veh-1'] } },
      select: { id: true },
    });
  });
});
