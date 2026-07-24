/**
 * Pre-production smoke: bookings.read/write/manage matrix for default role templates.
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { evaluateModulePermission } from '@shared/auth/permission.util';

describe('Booking permissions smoke (DRIVER vs employee templates)', () => {
  const orgId = 'org-smoke';
  const userId = 'user-smoke';

  const templateByKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;

  const driverPerms = normalizeMembershipPermissions(templateByKey('driver').permissions)!;
  const employeePerms = normalizeMembershipPermissions(templateByKey('employee').permissions)!;
  const dispositionPerms = normalizeMembershipPermissions(templateByKey('disposition').permissions)!;

  let guard: PermissionsGuard;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = { organizationMembership: { findFirst: jest.fn() } };

  function ctx(requirement: { module: string; level: 'read' | 'write' | 'manage' }) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requirement);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId, organizationId: orgId },
          params: { orgId },
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  beforeEach(() => {
    guard = new PermissionsGuard(reflector, prisma as never);
    jest.clearAllMocks();
  });

  it('driver template: read allowed, write allowed (template grants bookings write), manage denied', () => {
    expect(
      evaluateModulePermission(driverPerms, 'bookings', 'read', {
        membershipRole: MembershipRole.DRIVER,
      }),
    ).toBe(true);
    expect(
      evaluateModulePermission(driverPerms, 'bookings', 'write', {
        membershipRole: MembershipRole.DRIVER,
      }),
    ).toBe(true);
    expect(
      evaluateModulePermission(driverPerms, 'bookings', 'manage', {
        membershipRole: MembershipRole.DRIVER,
      }),
    ).toBe(false);
  });

  it('employee template: read allowed, write denied, manage denied', () => {
    expect(
      evaluateModulePermission(employeePerms, 'bookings', 'read', {
        membershipRole: MembershipRole.WORKER,
      }),
    ).toBe(true);
    expect(
      evaluateModulePermission(employeePerms, 'bookings', 'write', {
        membershipRole: MembershipRole.WORKER,
      }),
    ).toBe(false);
    expect(
      evaluateModulePermission(employeePerms, 'bookings', 'manage', {
        membershipRole: MembershipRole.WORKER,
      }),
    ).toBe(false);
  });

  it('disposition template: write allowed for operational booking mutations', () => {
    expect(
      evaluateModulePermission(dispositionPerms, 'bookings', 'write', {
        membershipRole: MembershipRole.SUB_ADMIN,
      }),
    ).toBe(true);
  });

  it('PermissionsGuard denies employee POST create (bookings.write)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: employeePerms,
    });

    await expect(
      guard.canActivate(ctx({ module: 'bookings', level: 'write' }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('PermissionsGuard allows disposition POST create (bookings.write)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.SUB_ADMIN,
      permissions: dispositionPerms,
    });

    await expect(
      guard.canActivate(ctx({ module: 'bookings', level: 'write' }) as never),
    ).resolves.toBe(true);
  });

  it('PermissionsGuard denies employee DELETE cancel (bookings.manage)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.WORKER,
      permissions: employeePerms,
    });

    await expect(
      guard.canActivate(ctx({ module: 'bookings', level: 'manage' }) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
