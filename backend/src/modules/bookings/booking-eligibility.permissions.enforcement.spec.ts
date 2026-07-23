import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS } from './booking-eligibility-permission.constants';

describe('Booking eligibility permission enforcement', () => {
  const orgId = 'org-a';
  const otherOrgId = 'org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const reviewRequirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.review'];
  const overrideRequirement = BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.override'];

  const templateByKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

  function permissionsContext(
    user: Record<string, unknown> | undefined,
    routeOrgId = orgId,
    requirement = reviewRequirement,
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requirement);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId: routeOrgId },
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  beforeEach(() => {
    permissionsGuard = new PermissionsGuard(reflector, prisma as never);
    orgScopingGuard = new OrgScopingGuard(prisma as never);
    jest.clearAllMocks();
  });

  it('denies unauthenticated eligibility preview (403)', async () => {
    await expect(
      permissionsGuard.canActivate(permissionsContext(undefined) as never),
    ).rejects.toMatchObject({
      response: { message: 'Authentication required', statusCode: 403 },
    });
  });

  it('denies driver eligibility review (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'DRIVER',
      permissions: normalizeMembershipPermissions(templateByKey('driver').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: booking-eligibility.read', statusCode: 403 },
    });
  });

  it('allows employee eligibility review without override permission', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, reviewRequirement) as never,
      ),
    ).resolves.toBe(true);

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, overrideRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: booking-eligibility-override.manage', statusCode: 403 },
    });
  });

  it('allows disposition override permission for manual approval workflows', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('disposition').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, overrideRequirement) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies cross-tenant eligibility review (IDOR)', async () => {
    await expect(
      orgScopingGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, otherOrgId) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows MASTER_ADMIN cross-tenant eligibility review', async () => {
    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, platformRole: 'MASTER_ADMIN' },
          otherOrgId,
          reviewRequirement,
        ) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
