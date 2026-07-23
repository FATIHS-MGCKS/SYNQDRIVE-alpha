import { ProviderAccessGrantStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { ProviderAccessGrantService } from './provider-access-grant.service';

describe('ProviderAccessGrantService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';
  const grantId = 'grant-1';
  const actorUserId = 'user-1';

  const baseGrant = {
    id: grantId,
    organizationId: orgId,
    provider: 'DIMO',
    providerAccountReference: null,
    providerGrantReference: null,
    providerStatus: ProviderAccessGrantStatus.PENDING,
    grantedAt: null,
    revokedAt: null,
    expiresAt: null,
    grantedScopes: [{ scopeKey: 'telemetry' }],
  };

  let prisma: {
    providerAccessGrant: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    providerAccessGrantScope: { createMany: jest.Mock };
    providerAccessGrantStatusEvent: { create: jest.Mock };
    processingActivity: { findFirst: jest.Mock };
    vehicle: { findFirst: jest.Mock };
    vehicleProviderConsent: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  let service: ProviderAccessGrantService;

  beforeEach(() => {
    prisma = {
      providerAccessGrant: {
        create: jest.fn().mockResolvedValue({ id: grantId }),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(baseGrant),
        update: jest.fn(),
      },
      providerAccessGrantScope: { createMany: jest.fn() },
      providerAccessGrantStatusEvent: { create: jest.fn() },
      processingActivity: { findFirst: jest.fn() },
      vehicle: { findFirst: jest.fn() },
      vehicleProviderConsent: { findFirst: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    service = new ProviderAccessGrantService(prisma as never);
  });

  it('rejects unknown provider scopes', async () => {
    await expect(
      service.create(orgId, {
        provider: 'DIMO',
        grantedScopes: ['unknown_scope'],
      }),
    ).rejects.toThrow('provider_scope_not_allowed:DIMO:unknown_scope');
  });

  it('rejects cross-tenant grant lookup', async () => {
    prisma.providerAccessGrant.findFirst.mockResolvedValue(null);

    await expect(service.findById(otherOrgId, grantId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets grantedAt server-side on activate', async () => {
    prisma.providerAccessGrant.findFirst.mockResolvedValue(baseGrant);
    prisma.providerAccessGrant.update.mockResolvedValue({
      ...baseGrant,
      providerStatus: ProviderAccessGrantStatus.ACTIVE,
      grantedAt: new Date(),
    });

    await service.activate(orgId, grantId, {}, actorUserId);

    expect(prisma.providerAccessGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: ProviderAccessGrantStatus.ACTIVE,
          grantedAt: expect.any(Date),
          lastVerifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('links legacy VPC without auto-activating', async () => {
    prisma.vehicleProviderConsent.findFirst.mockResolvedValue({
      id: 'vpc-1',
      organizationId: orgId,
      provider: 'DIMO',
      scopes: ['telemetry'],
      proofReference: 'proof-1',
      vehicleId: 'vehicle-1',
      legacyProviderAccessGrant: null,
    });
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1', organizationId: orgId });

    await service.linkFromLegacyVpc(orgId, 'vpc-1', actorUserId);

    expect(prisma.providerAccessGrant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: ProviderAccessGrantStatus.PENDING,
          legacyVehicleProviderConsentId: 'vpc-1',
        }),
      }),
    );
  });
});
