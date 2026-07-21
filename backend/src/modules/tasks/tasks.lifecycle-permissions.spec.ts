import { ForbiddenException } from '@nestjs/common';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { TASK_PERMISSION_REQUIREMENTS } from './task-permission.constants';
import { TasksController } from './tasks.controller';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { TaskPermissionService } from './task-permission.service';
import { TasksService } from './tasks.service';
import { BadRequestException } from '@nestjs/common';
import { createTasksServiceHarness } from './__fixtures__/tasks-service.fixtures';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

function rolePermissions(systemKey: string) {
  const template = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((t) => t.systemKey === systemKey)!;
  return normalizeMembershipPermissions(template.permissions)!;
}

describe('Tasks lifecycle and cost permission characterization', () => {
  const lifecycleHandlers = [
    ['complete', 'tasks.complete'],
    ['cancel', 'tasks.cancel'],
  ] as const;

  it.each(lifecycleHandlers)('%s requires canonical %s permission', (method, action) => {
    expect(permissionOf(TasksController.prototype, method)).toEqual(
      TASK_PERMISSION_REQUIREMENTS[action],
    );
  });
});

describe('Task role permission matrix', () => {
  const cases = [
    {
      role: 'read_only',
      label: 'Read-only',
      complete: false,
      cancel: false,
      manageCosts: false,
      update: false,
    },
    {
      role: 'employee',
      label: 'Worker',
      complete: false,
      cancel: false,
      manageCosts: false,
      update: false,
    },
    {
      role: 'station_manager',
      label: 'Service Manager',
      complete: true,
      cancel: true,
      manageCosts: false,
      update: true,
    },
    {
      role: 'org_admin',
      label: 'Org Admin',
      complete: true,
      cancel: true,
      manageCosts: true,
      update: true,
    },
  ] as const;

  it.each(cases)('$label role matches lifecycle and cost expectations', (entry) => {
    const perms = rolePermissions(entry.role);
    expect(evaluateOperationalPermission(perms, 'tasks.complete')).toBe(entry.complete);
    expect(evaluateOperationalPermission(perms, 'tasks.cancel')).toBe(entry.cancel);
    expect(evaluateOperationalPermission(perms, 'tasks.manage_costs')).toBe(entry.manageCosts);
    expect(evaluateOperationalPermission(perms, 'tasks.update')).toBe(entry.update);
  });
});

describe('TasksController lifecycle permission enforcement', () => {
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
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requirement);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId },
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

  const lifecycleActions = ['tasks.complete', 'tasks.cancel'] as const;

  it.each(lifecycleActions)('allows station_manager write access for %s', async (action) => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: { tasks: { read: true, write: true, manage: false } },
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

  it.each(lifecycleActions)('denies read-only worker for %s (403)', async (action) => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: false, manage: false } },
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

  it('allows org admin membership bypass for tasks.complete', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: { tasks: { read: true, write: false, manage: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext(
          { id: userId, organizationId: orgId },
          TASK_PERMISSION_REQUIREMENTS['tasks.complete'],
        ) as never,
      ),
    ).resolves.toBe(true);
  });
});

describe('TasksController cost mutation enforcement', () => {
  const orgId = 'org1';
  const taskId = 't1';
  const user = { id: 'user-1', platformRole: undefined };

  const tasksService = {
    createManualTask: jest.fn(),
    updateTask: jest.fn(),
    completeTask: jest.fn(),
    bulkTaskActions: jest.fn(),
  };

  const taskPermissionService = {
    assert: jest.fn(),
  };

  const controller = new TasksController(
    tasksService as unknown as TasksService,
    taskPermissionService as unknown as TaskPermissionService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tasksService.createManualTask.mockResolvedValue({ id: taskId });
    tasksService.updateTask.mockResolvedValue({ id: taskId });
    tasksService.completeTask.mockResolvedValue({ id: taskId, status: 'DONE' });
    taskPermissionService.assert.mockResolvedValue(undefined);
  });

  it('requires tasks.manage_costs when create payload includes estimatedCostCents', async () => {
    await controller.create(orgId, { user } as never, {
      title: 'Task',
      estimatedCostCents: 1200,
    } as never);

    expect(taskPermissionService.assert).toHaveBeenCalledWith(
      { id: user.id, platformRole: undefined, organizationId: undefined },
      orgId,
      'tasks.manage_costs',
    );
    expect(tasksService.createManualTask).toHaveBeenCalled();
  });

  it('rejects update cost fields without tasks.manage_costs', async () => {
    taskPermissionService.assert.mockRejectedValue(
      new ForbiddenException('Missing permission: tasks.manage'),
    );

    await expect(
      controller.update(orgId, taskId, { user } as never, { actualCostCents: 500 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tasksService.updateTask).not.toHaveBeenCalled();
  });

  it('rejects complete actualCostCents without tasks.manage_costs', async () => {
    taskPermissionService.assert.mockRejectedValue(
      new ForbiddenException('Missing permission: tasks.manage'),
    );

    await expect(
      controller.complete(orgId, taskId, { user } as never, { actualCostCents: 500 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tasksService.completeTask).not.toHaveBeenCalled();
  });

  it('allows complete without cost payload using only tasks.complete guard', async () => {
    await controller.complete(orgId, taskId, { user } as never, { resolutionNote: 'Done' } as never);

    expect(taskPermissionService.assert).not.toHaveBeenCalled();
    expect(tasksService.completeTask).toHaveBeenCalled();
  });
});

describe('Tasks legacy status bypass prevention', () => {
  it('rejects DONE via legacy update() path', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    prisma.orgTask.findFirst.mockResolvedValue({ organizationId: 'org1', status: 'OPEN' });

    await expect(svc.update('t1', { status: 'DONE' }, 'org1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('rejects CANCELLED via legacy update() path', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    prisma.orgTask.findFirst.mockResolvedValue({ organizationId: 'org1', status: 'OPEN' });

    await expect(svc.update('t1', { status: 'CANCELLED' }, 'org1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });
});
