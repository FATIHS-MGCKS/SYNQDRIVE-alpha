import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { TASK_PERMISSION_REQUIREMENTS } from './task-permission.constants';
import { TasksController } from './tasks.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('TasksController permissions characterization', () => {
  const readHandlers = [
    'findAll',
    'summary',
    'findOne',
    'vehicleTasks',
    'bookingTasks',
    'vendorTasks',
    'customerTasks',
  ] as const;

  it('applies OrgScopingGuard, RolesGuard and PermissionsGuard on controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TasksController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it.each(readHandlers)('%s requires canonical tasks.read permission', (method) => {
    expect(permissionOf(TasksController.prototype, method)).toEqual(
      TASK_PERMISSION_REQUIREMENTS['tasks.read'],
    );
  });

  const mutationHandlers = [
    ['create', 'tasks.create'],
    ['update', 'tasks.update'],
    ['assign', 'tasks.assign'],
  ] as const;

  it.each(mutationHandlers)('%s requires canonical %s permission', (method, action) => {
    expect(permissionOf(TasksController.prototype, method)).toEqual(
      TASK_PERMISSION_REQUIREMENTS[action],
    );
  });

  it('does not require tasks.read on other write handlers', () => {
    const writeHandlers = [
      'start',
      'waiting',
      'complete',
      'cancel',
      'bulkActions',
      'addComment',
      'addChecklistItem',
      'updateChecklistItem',
      'addAttachment',
    ] as const;

    for (const method of writeHandlers) {
      expect(permissionOf(TasksController.prototype, method)).toBeUndefined();
    }
  });
});

describe('TasksController read permission enforcement', () => {
  const orgId = 'org-a';
  const otherOrgId = 'org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const tasksReadRequirement = TASK_PERMISSION_REQUIREMENTS['tasks.read'];

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

  function orgScopingContext(
    user: Record<string, unknown>,
    routeOrgId = orgId,
  ) {
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
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(tasksReadRequirement);
  });

  it('allows tenant user with tasks.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('allows read-only membership with tasks.read and no write flag', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: false, manage: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies tenant user without tasks.read (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { dashboard: { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: tasks.read', statusCode: 403 },
    });
  });

  it('denies unauthenticated access when tasks.read is required (403)', async () => {
    await expect(
      permissionsGuard.canActivate(permissionsContext(undefined) as never),
    ).rejects.toMatchObject({
      response: { message: 'Authentication required', statusCode: 403 },
    });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows MASTER_ADMIN without membership permission lookup for tasks.read', async () => {
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

  it('denies access when membership is missing in target org (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      orgScopingGuard.canActivate(
        orgScopingContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'You do not have access to this organization',
        statusCode: 403,
      },
    });
  });
});

describe('TasksController write permission enforcement', () => {
  const orgId = 'org-a';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;

  function permissionsContext(
    user: Record<string, unknown> | undefined,
    requirement: (typeof TASK_PERMISSION_REQUIREMENTS)[keyof typeof TASK_PERMISSION_REQUIREMENTS],
    routeOrgId = orgId,
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
    jest.clearAllMocks();
  });

  const writeActions = ['tasks.create', 'tasks.update', 'tasks.assign'] as const;

  it.each(writeActions)('allows tenant user with tasks.write for %s', async (action) => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: true } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          TASK_PERMISSION_REQUIREMENTS[action],
        ) as never,
      ),
    ).resolves.toBe(true);
  });

  it.each(writeActions)('denies tenant user with read-only tasks permission for %s (403)', async (action) => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          TASK_PERMISSION_REQUIREMENTS[action],
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: tasks.write', statusCode: 403 },
    });
  });

  it.each(writeActions)('allows MASTER_ADMIN for %s without membership lookup', async (action) => {
    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, platformRole: 'MASTER_ADMIN' },
          TASK_PERMISSION_REQUIREMENTS[action],
          'org-other',
        ) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
