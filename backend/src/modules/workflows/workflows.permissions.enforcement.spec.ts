import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { WORKFLOW_PERMISSION_REQUIREMENTS } from './permissions/workflow-permission.constants';

describe('Workflow permission enforcement', () => {
  const orgId = 'org-a';
  const otherOrgId = 'org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const templateByKey = (systemKey: string) =>
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

  function permissionsContext(
    user: Record<string, unknown> | undefined,
    routeOrgId = orgId,
    requirement = WORKFLOW_PERMISSION_REQUIREMENTS['workflow.read'],
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

  it('denies unauthenticated access', async () => {
    await expect(
      permissionsGuard.canActivate(permissionsContext(undefined) as never),
    ).rejects.toMatchObject({
      response: { message: 'Authentication required', statusCode: 403 },
    });
  });

  it('denies foreign tenant via OrgScopingGuard before permission lookup', async () => {
    await expect(
      orgScopingGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, otherOrgId) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'You do not have access to this organization', statusCode: 403 },
    });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows master admin with tenant context in route param', async () => {
    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, platformRole: 'MASTER_ADMIN', organizationId: otherOrgId },
          orgId,
          WORKFLOW_PERMISSION_REQUIREMENTS['workflow.secrets.manage'],
        ) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows org admin without explicit workflow modules', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: null,
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies worker workflow.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: workflow-automation.read', statusCode: 403 },
    });
  });

  it('allows sub_admin workflow.read but denies external test', async () => {
    const subAdminPerms = normalizeMembershipPermissions(templateByKey('sub_admin').permissions);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: subAdminPerms,
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          orgId,
          WORKFLOW_PERMISSION_REQUIREMENTS['workflow.read'],
        ) as never,
      ),
    ).resolves.toBe(true);

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          orgId,
          WORKFLOW_PERMISSION_REQUIREMENTS['workflow.test_external'],
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'Missing permission: workflow-automation-test-external.manage',
        statusCode: 403,
      },
    });
  });

  it('denies sub_admin approval mutations', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('sub_admin').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          orgId,
          WORKFLOW_PERMISSION_REQUIREMENTS['workflow.approve'],
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: workflow-automation-approval.write', statusCode: 403 },
    });
  });

  it('denies sub_admin dead-letter replay', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('sub_admin').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          orgId,
          WORKFLOW_PERMISSION_REQUIREMENTS['workflow.dead_letter.replay'],
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'Missing permission: workflow-automation-dead-letter.manage',
        statusCode: 403,
      },
    });
  });

  it('denies direct API manipulation when membership belongs to another org', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: otherOrgId }, orgId) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies secrets management for sub_admin', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('sub_admin').permissions),
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          orgId,
          WORKFLOW_PERMISSION_REQUIREMENTS['workflow.secrets.manage'],
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: workflow-automation-secrets.manage', statusCode: 403 },
    });
  });
});
