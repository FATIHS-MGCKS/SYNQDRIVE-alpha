import { ForbiddenException } from '@nestjs/common';
import { StationsAccessService, StationsPermissionErrorCode } from './stations-access.service';

describe('StationsAccessService', () => {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let service: StationsAccessService;

  beforeEach(() => {
    service = new StationsAccessService(prisma as never);
    jest.clearAllMocks();
  });

  it('allows master admin without membership lookup', async () => {
    await expect(
      service.assertStationsPermission('org-1', { id: 'm1', platformRole: 'MASTER_ADMIN' }, 'stations.read'),
    ).resolves.toBeUndefined();
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies worker without stations.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      permissions: { stationsV2: { read: false } },
    });

    await expect(
      service.assertStationsPermission('org-1', { id: 'u1' }, 'stations.read'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows worker with stations.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      permissions: { stationsV2: { read: true } },
    });

    await expect(
      service.assertStationsPermission('org-1', { id: 'u1' }, 'stations.read'),
    ).resolves.toBeUndefined();
  });

  it('rejects cross-org access via assertStationsAccess', async () => {
    await expect(
      service.assertStationsAccess(
        { params: { orgId: 'org-b' } },
        { id: 'u1', organizationId: 'org-a' },
        'stations.read',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires organization context', async () => {
    await expect(
      service.assertStationsAccess({ params: {} }, { id: 'u1' }, 'stations.read'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationsPermissionErrorCode.ORGANIZATION_CONTEXT_REQUIRED,
      }),
    });
  });
});
