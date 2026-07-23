import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { RENTAL_RULE_PERMISSION_REQUIREMENTS } from './rental-rules-permission.constants';

describe('Rental rules permission enforcement', () => {
  const orgId = 'org-a';
  const otherOrgId = 'org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const readRequirement = RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.read'];
  const writeRequirement = RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.write'];
  const publishRequirement = RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.publish'];
  const assignRequirement = RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.assign_vehicles'];
  const overrideRequirement = RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.manage_overrides'];

  const templateByKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

  function permissionsContext(
    user: Record<string, unknown> | undefined,
    routeOrgId = orgId,
    requirement = readRequirement,
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

  it('denies unauthenticated access (403)', async () => {
    await expect(
      permissionsGuard.canActivate(permissionsContext(undefined) as never),
    ).rejects.toMatchObject({
      response: { message: 'Authentication required', statusCode: 403 },
    });
  });

  it('denies authenticated user without active membership in org (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'You do not have access to this organization', statusCode: 403 },
    });
  });

  it('denies cross-tenant org access via OrgScopingGuard before permission lookup', async () => {
    await expect(
      orgScopingGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, otherOrgId) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'You do not have access to this organization', statusCode: 403 },
    });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies driver without rental_rules.read (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'DRIVER',
      permissions: normalizeMembershipPermissions(templateByKey('driver').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: rental-rules.read', statusCode: 403 },
    });
  });

  it('allows employee read-only for overview/list routes', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, readRequirement) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies read-only employee on write mutation (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, writeRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: rental-rules.write', statusCode: 403 },
    });
  });

  it('denies editor with write but without publish on publish route', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: {
        'rental-rules': { read: true, write: true, manage: false },
        'rental-rules-publish': { read: false, write: false, manage: false },
      },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, publishRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: rental-rules-publish.write', statusCode: 403 },
    });
  });

  it('allows station_manager vehicle assignment without write permission', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('station_manager').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, assignRequirement) as never,
      ),
    ).resolves.toBe(true);

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, writeRequirement) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows station_manager overrides without assign on wrong route', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('station_manager').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, overrideRequirement) as never,
      ),
    ).resolves.toBe(true);
  });

  it('allows ORG_ADMIN via membership bypass without explicit module JSON', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: null,
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, publishRequirement) as never,
      ),
    ).resolves.toBe(true);
  });

  it('allows MASTER_ADMIN cross-tenant without membership lookup', async () => {
    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, platformRole: 'MASTER_ADMIN' },
          otherOrgId,
          publishRequirement,
        ) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies sub_admin write on defaults patch (read-only template)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('sub_admin').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, writeRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: rental-rules.write', statusCode: 403 },
    });
  });
});
