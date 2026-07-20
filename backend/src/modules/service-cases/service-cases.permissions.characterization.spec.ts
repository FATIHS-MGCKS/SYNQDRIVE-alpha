import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { SERVICE_CASE_PERMISSION_REQUIREMENTS } from './service-case-permission.constants';
import { ServiceCasesController } from './service-cases.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

function rolePermissions(systemKey: string) {
  const template = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;
  return normalizeMembershipPermissions(template.permissions)!;
}

describe('ServiceCasesController permissions characterization', () => {
  const readHandlers = ['list', 'getOne', 'vehicleCases', 'vendorCases'] as const;

  it('applies OrgScopingGuard, RolesGuard and PermissionsGuard on controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ServiceCasesController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it.each(readHandlers)('%s requires canonical service_cases.read permission', (method) => {
    expect(permissionOf(ServiceCasesController.prototype, method)).toEqual(
      SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.read'],
    );
  });

  it('does not require service_cases.read on mutation handlers', () => {
    const writeHandlers = [
      'create',
      'update',
      'complete',
      'cancel',
      'addComment',
      'addAttachment',
    ] as const;

    for (const method of writeHandlers) {
      expect(permissionOf(ServiceCasesController.prototype, method)).toBeUndefined();
    }
  });
});

describe('ServiceCasesController read permission enforcement', () => {
  const orgId = 'org-a';
  const otherOrgId = 'org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const serviceCasesReadRequirement = SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.read'];

  function permissionsContext(user: Record<string, unknown> | undefined, routeOrgId = orgId) {
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

  function orgScopingContext(user: Record<string, unknown>, routeOrgId = orgId) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId: routeOrgId },
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
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(serviceCasesReadRequirement);
  });

  it('allows service role with vendor-management.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { 'vendor-management': { read: true, write: true } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies employee without vendor-management.read (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: vendor-management.read', statusCode: 403 },
    });
  });

  it('allows MASTER_ADMIN without membership permission lookup', async () => {
    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, platformRole: 'MASTER_ADMIN' }, otherOrgId) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies cross-tenant org access via OrgScopingGuard (403)', async () => {
    await expect(
      orgScopingGuard.canActivate(
        orgScopingContext({ id: userId, organizationId: orgId }, otherOrgId) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'You do not have access to this organization',
        statusCode: 403,
      },
    });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});

describe('Service case read role matrix', () => {
  it('grants service_cases.read to service role and denies employee', () => {
    expect(evaluateOperationalPermission(rolePermissions('service'), 'service_cases.read')).toBe(true);
    expect(evaluateOperationalPermission(rolePermissions('employee'), 'service_cases.read')).toBe(false);
    expect(evaluateOperationalPermission(rolePermissions('org_admin'), 'service_cases.read')).toBe(true);
  });
});
