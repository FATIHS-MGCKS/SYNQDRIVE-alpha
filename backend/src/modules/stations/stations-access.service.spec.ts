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

  it('denies worker from setting primary even with permission flag', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { stationsV2: { set_primary: true } },
    });

    await expect(service.assertCanSetPrimary('org-1', { id: 'u1' })).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationsPermissionErrorCode.SET_PRIMARY_ROLE_FORBIDDEN,
      }),
    });
  });

  it('allows manager to set primary when permission is granted', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'MANAGER',
      permissions: { stationsV2: { set_primary: true } },
    });

    await expect(service.assertCanSetPrimary('org-1', { id: 'u1' })).resolves.toBeUndefined();
  });

  it('assertStationsPermissions checks all actions', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      permissions: { stationsV2: { update_master_data: true, manage_operations: false } },
    });

    await expect(
      service.assertStationsPermissions('org-1', { id: 'u1' }, [
        'stations.update_master_data',
        'stations.manage_operations',
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: StationsPermissionErrorCode.MISSING_PERMISSION,
        permission: 'stations.manage_operations',
      }),
    });
  });
});
