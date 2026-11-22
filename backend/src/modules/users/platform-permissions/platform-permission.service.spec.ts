import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformPermissionKey, Prisma, UserPlatformRole, UserStatus } from '@prisma/client';
import { PlatformPermissionService } from './platform-permission.service';
import { PLATFORM_PERMISSION_JWT_VALUES } from './platform-permission.constants';

describe('PlatformPermissionService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    userPlatformPermissionGrant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
  };

  let service: PlatformPermissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (inner: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new PlatformPermissionService(prisma as never);
  });

  it('resolveJwtPermissions returns allowlisted JWT strings only', async () => {
    (prisma.userPlatformPermissionGrant.findMany as jest.Mock).mockResolvedValue([
      { permissionKey: PlatformPermissionKey.MASTER_BILLING },
    ]);
    await expect(service.resolveJwtPermissions('user-1')).resolves.toEqual([
      PLATFORM_PERMISSION_JWT_VALUES.MASTER_BILLING,
    ]);
  });

  it('grantMasterBilling is idempotent when active grant exists', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (prisma.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue({
      id: 'grant-1',
    });
    const result = await service.grantMasterBilling('target', 'admin-1');
    expect(result).toEqual({ granted: true, idempotent: true, grantId: 'grant-1' });
    expect(prisma.userPlatformPermissionGrant.create).not.toHaveBeenCalled();
  });

  it('rejects grant for MASTER_ADMIN targets', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await expect(service.grantMasterBilling('target', 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects grant for missing users', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.grantMasterBilling('missing', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revokeMasterBilling is idempotent when no active grant', async () => {
    (prisma.userPlatformPermissionGrant.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.revokeMasterBilling('target', 'admin-1');
    expect(result).toEqual({ revoked: false, idempotent: true, grantId: null });
  });

  it('grantMasterBilling treats unique-index race (P2002) as idempotent success', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (prisma.userPlatformPermissionGrant.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'grant-race' });
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    (prisma.userPlatformPermissionGrant.create as jest.Mock).mockRejectedValue(p2002);
    const result = await service.grantMasterBilling('target', 'admin-1');
    expect(result).toEqual({ granted: true, idempotent: true, grantId: 'grant-race' });
  });

  it('hasActiveMasterBillingGrant denies when user inactive', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      status: UserStatus.INACTIVE,
    });
    await expect(service.hasActiveMasterBillingGrant('inactive-user')).resolves.toBe(false);
    expect(prisma.userPlatformPermissionGrant.findFirst).not.toHaveBeenCalled();
  });

  it('rejects UI audit grant for MASTER_ADMIN', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.MASTER_ADMIN,
    });
    await expect(
      service.grantUiAuditPermission('target', 'admin-1', PlatformPermissionKey.UI_AUDIT_RENTAL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects UI audit grant when user has active ORG_ADMIN membership', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
    });
    (prisma.organizationMembership.findFirst as jest.Mock).mockResolvedValue({ id: 'mem-1' });
    await expect(
      service.grantUiAuditPermission('target', 'admin-1', PlatformPermissionKey.UI_AUDIT_OPERATOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});