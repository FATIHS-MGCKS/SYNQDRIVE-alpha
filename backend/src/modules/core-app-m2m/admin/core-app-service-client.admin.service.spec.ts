import { BadRequestException } from '@nestjs/common';
import { CoreAppServiceClientStatus, ProductSlug } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ, CORE_APP_M2M_SCOPE_VEHICLE_READ } from '../core-app-m2m.constants';
import { CoreAppServiceClientAdminService } from './core-app-service-client.admin.service';

describe('CoreAppServiceClientAdminService', () => {
  const audit = {
    actorUserId: 'actor-1',
    correlationId: 'corr-1',
  };

  let tx: {
    coreAppServiceClient: { create: jest.Mock; update: jest.Mock };
    coreAppServiceOrgGrant: { upsert: jest.Mock; update: jest.Mock };
    activityLog: { create: jest.Mock };
  };
  const prisma = {
    coreAppServiceClient: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    coreAppServiceOrgGrant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const service = new CoreAppServiceClientAdminService(prisma as never);

  function resetTx() {
    tx = {
      coreAppServiceClient: { create: jest.fn(), update: jest.fn() },
      coreAppServiceOrgGrant: { upsert: jest.fn(), update: jest.fn() },
      activityLog: { create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }) },
    };
    prisma.$transaction.mockImplementation(async (fn: (inner: typeof tx) => Promise<unknown>) =>
      fn(tx),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    resetTx();
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores bcrypt hash only and returns one-time secret', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue(null);
    tx.coreAppServiceClient.create.mockImplementation(async ({ data }: { data: { credentialHash: string } }) => ({
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
    const hashArg = tx.coreAppServiceClient.create.mock.calls[0][0].data.credentialHash;
    expect(hashArg).not.toBe(result.clientSecret);
    expect(await bcrypt.compare(result.clientSecret, hashArg)).toBe(true);
    expect(tx.activityLog.create).toHaveBeenCalled();
  });

  it('increments credentialVersion when client is disabled', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });
    tx.coreAppServiceClient.update.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.DISABLED,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });

    await service.updateClient('uuid-1', { status: 'DISABLED' }, audit);
    expect(tx.coreAppServiceClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ credentialVersion: { increment: 1 } }),
      }),
    );
  });

  it('increments credentialVersion when allowedScopes change', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });
    tx.coreAppServiceClient.update.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ, CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      credentialVersion: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });

    await service.updateClient(
      'uuid-1',
      {
        allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ, CORE_APP_M2M_SCOPE_ENTITLEMENTS_READ],
      },
      audit,
    );
    expect(tx.coreAppServiceClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ credentialVersion: { increment: 1 } }),
      }),
    );
  });

  it('rejects product slug change on update', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.DISABLED,
      allowedScopes: [],
      credentialVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });

    await expect(
      service.updateClient('uuid-1', { productSlug: ProductSlug.VYMOD }, audit),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back mutation when transactional audit write fails', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });
    tx.coreAppServiceClient.update.mockResolvedValue({
      id: 'uuid-1',
      clientId: 'fleet-1',
      displayName: 'Fleet',
      productSlug: ProductSlug.FLEET,
      status: CoreAppServiceClientStatus.DISABLED,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      orgGrants: [],
    });
    tx.activityLog.create.mockRejectedValue(new Error('audit persistence failed'));

    await expect(service.updateClient('uuid-1', { status: 'DISABLED' }, audit)).rejects.toThrow(
      'audit persistence failed',
    );
  });
});