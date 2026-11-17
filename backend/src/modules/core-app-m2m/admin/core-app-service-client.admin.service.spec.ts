import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from '../core-app-m2m.constants';
import { CoreAppServiceClientAdminService } from './core-app-service-client.admin.service';

describe('CoreAppServiceClientAdminService', () => {
  const prisma = {
    coreAppServiceClient: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    coreAppServiceOrgGrant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const masterAdminAudit = { record: jest.fn() };
  const service = new CoreAppServiceClientAdminService(
    prisma as never,
    masterAdminAudit as never,
  );

  const audit = {
    actorUserId: 'actor-1',
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects TAXI product slug on create', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue(null);
    await expect(
      service.createClient(
        {
          clientId: 'taxi-client',
          displayName: 'Taxi',
          productSlug: ProductSlug.TAXI,
          allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
        },
        audit,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.coreAppServiceClient.create).not.toHaveBeenCalled();
  });

  it('stores bcrypt hash only and returns one-time secret', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue(null);
    prisma.coreAppServiceClient.create.mockImplementation(async ({ data }: { data: { credentialHash: string } }) => ({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: 'DISABLED',
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    }));

    const result = await service.createClient(
      {
        clientId: 'fleet-1',
        displayName: 'Fleet',
        productSlug: ProductSlug.FLEET,
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      },
      audit,
    );

    expect(result.clientSecret).toHaveLength(43);
    const hashArg = prisma.coreAppServiceClient.create.mock.calls[0][0].data.credentialHash;
    expect(hashArg).not.toBe(result.clientSecret);
    expect(await bcrypt.compare(result.clientSecret, hashArg)).toBe(true);
    expect(masterAdminAudit.record).toHaveBeenCalled();
  });

  it('rejects product slug change on update', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: 'DISABLED',
      allowedScopes: [],
      credentialVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });

    await expect(
      service.updateClient('uuid-1', { productSlug: ProductSlug.VYMOD }, audit),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});