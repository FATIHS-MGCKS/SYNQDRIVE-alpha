import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { EvaluationsPermissionGuard } from './evaluations-permission.guard';
import { EvaluationsAccessService } from './evaluations-access.service';
import type { EvaluationsPermissionAction } from './evaluations-permission.constants';

const templateByKey = (systemKey: string) =>
  DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

describe('EvaluationsPermissionGuard — direct API enforcement', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = { organizationMembership: { findFirst: jest.fn() } };
  const stationAccess = {
    resolve: jest.fn(),
    assertStationReadable: jest.fn(),
  };
  const evaluationsAccess = new EvaluationsAccessService(prisma as never, stationAccess as never);
  let guard: EvaluationsPermissionGuard;

  const buildCtx = (
    user: Record<string, unknown>,
    orgId = 'org-a',
    action: EvaluationsPermissionAction,
    query: Record<string, string | undefined> = {},
  ) => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(action);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId },
          query,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  };

  beforeEach(() => {
    guard = new EvaluationsPermissionGuard(reflector, evaluationsAccess);
    jest.clearAllMocks();
    stationAccess.resolve.mockResolvedValue({
      bypassScope: false,
      allowedStationIds: ['station-1'],
      membershipRole: 'WORKER',
      userId: 'user-1',
    });
    stationAccess.assertStationReadable.mockImplementation((access, stationId) => {
      if (!access.allowedStationIds.includes(stationId)) {
        throw new NotFoundException('Station not found');
      }
    });
  });

  it('denies employee executive dashboard access', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'worker-1', organizationId: 'org-a' }, 'org-a', 'evaluations.executive.read') as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: evaluations.executive.read', statusCode: 403 },
    });
  });

  it('allows disposition executive KPI read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('disposition').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'disp-1', organizationId: 'org-a' }, 'org-a', 'evaluations.executive.read') as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies station manager export without evaluations-export.write', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('station_manager').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'mgr-1', organizationId: 'org-a' }, 'org-a', 'evaluations.export.write') as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: evaluations.export.write', statusCode: 403 },
    });
  });

  it('allows accounting finance read and export', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('accounting').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'acct-1', organizationId: 'org-a' }, 'org-a', 'evaluations.finance.read') as never,
      ),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(
        buildCtx({ id: 'acct-1', organizationId: 'org-a' }, 'org-a', 'evaluations.export.write') as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies read-only worker predictive admin manage', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('read_only').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'ro-1', organizationId: 'org-a' }, 'org-a', 'evaluations.admin.manage') as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: evaluations.admin.manage', statusCode: 403 },
    });
  });

  it('allows service workshop driver analysis read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('service').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'svc-1', organizationId: 'org-a' }, 'org-a', 'evaluations.driver.read') as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies cross-tenant orgId spoofing', async () => {
    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'user-a', organizationId: 'org-a', platformRole: 'USER' },
          'org-b',
          'evaluations.executive.read',
        ) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies station outside membership scope when stationId query is provided', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('station_manager').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'mgr-1', organizationId: 'org-a' },
          'org-a',
          'evaluations.executive.read',
          { stationId: 'station-forbidden' },
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Station not found', statusCode: 404 },
    });
  });

  it('allows readable station within membership scope', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('station_manager').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'mgr-1', organizationId: 'org-a' },
          'org-a',
          'evaluations.executive.read',
          { stationId: 'station-1' },
        ) as never,
      ),
    ).resolves.toBe(true);
  });

  it('bypasses membership lookup for MASTER_ADMIN', async () => {
    await expect(
      guard.canActivate(
        buildCtx(
          { platformRole: 'MASTER_ADMIN' },
          'org-b',
          'evaluations.admin.manage',
        ) as never,
      ),
    ).resolves.toBe(true);

    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
