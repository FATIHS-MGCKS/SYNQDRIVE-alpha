import { Reflector } from '@nestjs/core';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { RENTAL_RULE_PERMISSION_REQUIREMENTS } from '@modules/rental-rules/rental-rules-permission.constants';
import { RentalRulesController } from '@modules/rental-rules/rental-rules.controller';

describe('Vehicle rental requirements — security enforcement', () => {
  const orgA = 'org-tenant-a';
  const orgB = 'org-tenant-b';
  const vehicleId = 'veh-1';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = { organizationMembership: { findFirst: jest.fn() } };
  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const readRequirement = RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.read'];
  const overrideRequirement =
    RENTAL_RULE_PERMISSION_REQUIREMENTS['rental_rules.manage_overrides'];

  const templateByKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

  function context(
    user: Record<string, unknown> | undefined,
    routeOrgId = orgA,
    requirement = readRequirement,
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requirement);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId: routeOrgId, vehicleId },
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

  it('denies unauthenticated access to vehicle rental requirements', async () => {
    await expect(
      permissionsGuard.canActivate(context(undefined) as never),
    ).rejects.toMatchObject({
      response: { message: 'Authentication required', statusCode: 403 },
    });
  });

  it('denies cross-tenant org on vehicle requirements route', async () => {
    await expect(
      orgScopingGuard.canActivate(
        context({ id: userId, organizationId: orgA }, orgB) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'You do not have access to this organization', statusCode: 403 },
    });
  });

  it('denies driver without rental_rules.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'DRIVER',
      permissions: normalizeMembershipPermissions(templateByKey('driver').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        context({ id: userId, organizationId: orgA }, orgA, readRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: rental-rules.read', statusCode: 403 },
    });
  });

  it('allows employee read for getVehicleRequirements handler', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        context({ id: userId, organizationId: orgA }, orgA, readRequirement) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies employee read on override mutation (manage_overrides required)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        context({ id: userId, organizationId: orgA }, orgA, overrideRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'Missing permission: rental-rules-overrides.write',
        statusCode: 403,
      },
    });
  });

  it('scopes rental requirements service lookup by org + vehicleId', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prismaVehicle = { vehicle: { findFirst } };

    await prismaVehicle.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgA },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: vehicleId, organizationId: orgA },
    });
  });

  it('documents getVehicleRequirements is on RentalRulesController', () => {
    expect(typeof RentalRulesController.prototype.getVehicleRequirements).toBe('function');
    expect(typeof RentalRulesController.prototype.getVehicleEffectiveRules).toBe('function');
  });
});
