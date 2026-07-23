import {
  EnforcementPolicyStatus,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { EnforcementPolicyScopeService } from './enforcement-policy-scope.service';
import { EnforcementPolicyScopeValidationService } from './enforcement-policy-scope-validation.service';

describe('EnforcementPolicyScopeService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';
  const policyId = 'policy-1';

  const basePolicy = {
    id: policyId,
    organizationId: orgId,
    processingActivityId: 'activity-1',
    policyFamilyId: 'family-1',
    versionNumber: 1,
    isCurrentVersion: true,
    status: EnforcementPolicyStatus.DRAFT,
    enforcementMode: PrivacyEnforcementMode.SHADOW,
    dataCategory: PrivacyProcessingDataCategory.TELEMETRY_DATA,
    processingPurpose: PrivacyProcessingPurpose.LIVE_MAP,
    scopeType: PrivacyEnforcementScopeType.VEHICLE,
    pathId: null,
    legacyOrgDataAuthorizationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    vehicles: [],
    customers: [],
    bookings: [],
    stations: [],
  };

  let prisma: {
    enforcementPolicy: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    enforcementPolicyVehicle: { deleteMany: jest.Mock; createMany: jest.Mock };
    enforcementPolicyCustomer: { deleteMany: jest.Mock; createMany: jest.Mock };
    enforcementPolicyBooking: { deleteMany: jest.Mock; createMany: jest.Mock };
    enforcementPolicyStation: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  let validation: {
    assertAllValidOrThrow: jest.Mock;
    validateAndResolve: jest.Mock;
  };

  let service: EnforcementPolicyScopeService;

  beforeEach(() => {
    validation = {
      assertAllValidOrThrow: jest.fn().mockResolvedValue({
        vehicleIds: ['veh-1'],
        customerIds: [],
        bookingIds: [],
        stationIds: [],
        invalidCount: 0,
      }),
      validateAndResolve: jest.fn(),
    };

    prisma = {
      enforcementPolicy: {
        findFirst: jest.fn().mockResolvedValue(basePolicy),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...basePolicy,
          vehicles: [{ vehicleId: 'veh-1' }],
        }),
        create: jest.fn().mockResolvedValue({ id: 'policy-2' }),
        updateMany: jest.fn(),
      },
      enforcementPolicyVehicle: { deleteMany: jest.fn(), createMany: jest.fn() },
      enforcementPolicyCustomer: { deleteMany: jest.fn(), createMany: jest.fn() },
      enforcementPolicyBooking: { deleteMany: jest.fn(), createMany: jest.fn() },
      enforcementPolicyStation: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    service = new EnforcementPolicyScopeService(
      prisma as never,
      validation as unknown as EnforcementPolicyScopeValidationService,
    );
  });

  it('rejects cross-tenant policy lookup', async () => {
    prisma.enforcementPolicy.findFirst.mockResolvedValue(null);

    await expect(service.getScopes(otherOrgId, policyId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaces scopes transactionally on draft policies', async () => {
    await service.replaceScopes(orgId, policyId, { vehicleIds: ['veh-1'] });

    expect(prisma.enforcementPolicyVehicle.deleteMany).toHaveBeenCalled();
    expect(prisma.enforcementPolicyVehicle.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ organizationId: orgId, enforcementPolicyId: policyId, vehicleId: 'veh-1' }],
      }),
    );
  });

  it('blocks direct scope changes on active policies', async () => {
    prisma.enforcementPolicy.findFirst.mockResolvedValue({
      ...basePolicy,
      status: EnforcementPolicyStatus.ACTIVE,
    });

    await expect(
      service.replaceScopes(orgId, policyId, { vehicleIds: ['veh-1'] }),
    ).rejects.toMatchObject({
      response: { code: 'ENFORCEMENT_POLICY_SCOPE_NOT_EDITABLE' },
    });
  });

  it('creates a new policy version for active policies', async () => {
    prisma.enforcementPolicy.findFirst.mockResolvedValue({
      ...basePolicy,
      status: EnforcementPolicyStatus.ACTIVE,
    });

    await service.createScopedVersion(orgId, policyId, { vehicleIds: ['veh-2'] });

    expect(prisma.enforcementPolicy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isCurrentVersion: false },
      }),
    );
    expect(prisma.enforcementPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versionNumber: 2,
          status: EnforcementPolicyStatus.DRAFT,
          isCurrentVersion: true,
        }),
      }),
    );
  });

  it('prevents duplicate scope ids via validation normalization', async () => {
    validation.assertAllValidOrThrow.mockResolvedValue({
      vehicleIds: ['veh-1'],
      customerIds: [],
      bookingIds: [],
      stationIds: [],
      invalidCount: 0,
    });

    await service.replaceScopes(orgId, policyId, {
      vehicleIds: ['veh-1', 'veh-1'],
    });

    expect(validation.assertAllValidOrThrow).toHaveBeenCalled();
    const createManyCall = prisma.enforcementPolicyVehicle.createMany.mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(1);
  });

  it('re-reads policy status inside transaction for parallel update safety', async () => {
    prisma.enforcementPolicy.findFirst
      .mockResolvedValueOnce(basePolicy)
      .mockResolvedValueOnce({ ...basePolicy, status: EnforcementPolicyStatus.ACTIVE });

    await expect(
      service.replaceScopes(orgId, policyId, { vehicleIds: ['veh-1'] }),
    ).rejects.toMatchObject({
      response: { code: 'ENFORCEMENT_POLICY_SCOPE_NOT_EDITABLE' },
    });
  });
});
