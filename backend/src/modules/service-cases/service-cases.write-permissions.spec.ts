import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { SERVICE_CASE_PERMISSION_REQUIREMENTS } from './service-case-permission.constants';
import { ServiceCasePermissionService } from './service-case-permission.service';
import { ServiceCasesController } from './service-cases.controller';
import { ServiceCasesService } from './service-cases.service';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('ServiceCasesController write permission characterization', () => {
  const mutationHandlers = [
    ['create', 'service_cases.create'],
    ['update', 'service_cases.update'],
    ['complete', 'service_cases.complete'],
    ['cancel', 'service_cases.cancel'],
    ['createTask', 'service_cases.update'],
    ['linkTask', 'service_cases.update'],
    ['unlinkTask', 'service_cases.update'],
  ] as const;

  it.each(mutationHandlers)('%s requires canonical %s permission', (method, action) => {
    expect(permissionOf(ServiceCasesController.prototype, method)).toEqual(
      SERVICE_CASE_PERMISSION_REQUIREMENTS[action],
    );
  });
});

describe('ServiceCasesController write permission enforcement', () => {
  const orgId = 'org1';
  const caseId = 'sc1';
  const user = { id: 'user-1', platformRole: undefined };

  const serviceCases = {
    create: jest.fn(),
    update: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
  };

  const serviceCasePermissionService = {
    assert: jest.fn().mockResolvedValue(undefined),
  };

  const serviceCaseTaskLinks = {
    createTask: jest.fn(),
    linkTask: jest.fn(),
    unlinkTask: jest.fn(),
  };

  const controller = new ServiceCasesController(
    serviceCases as unknown as ServiceCasesService,
    serviceCasePermissionService as unknown as ServiceCasePermissionService,
    serviceCaseTaskLinks as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    serviceCases.create.mockResolvedValue({ id: caseId });
    serviceCases.update.mockResolvedValue({ id: caseId });
    serviceCases.complete.mockResolvedValue({ id: caseId, status: 'COMPLETED' });
    serviceCases.cancel.mockResolvedValue({ id: caseId, status: 'CANCELLED' });
  });

  it('requires manage_costs when create payload includes estimatedCostCents', async () => {
    await controller.create(orgId, { user } as never, {
      title: 'Service',
      category: 'SERVICE',
      vehicleId: 'v1',
      estimatedCostCents: 12000,
    } as never);

    expect(serviceCasePermissionService.assert).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      orgId,
      'service_cases.manage_costs',
    );
    expect(serviceCases.create).toHaveBeenCalledWith(orgId, expect.any(Object), user.id);
  });

  it('requires schedule permission when update changes scheduledAt', async () => {
    await controller.update(orgId, caseId, { user } as never, {
      scheduledAt: '2026-06-12T10:00:00.000Z',
    } as never);

    expect(serviceCasePermissionService.assert).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      orgId,
      'service_cases.schedule',
    );
    expect(serviceCases.update).toHaveBeenCalled();
  });

  it('rejects terminal status via generic update before service call', async () => {
    await expect(
      controller.update(orgId, caseId, { user } as never, { status: 'COMPLETED' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceCases.update).not.toHaveBeenCalled();
  });

  it('rejects update cost fields without manage_costs', async () => {
    serviceCasePermissionService.assert.mockReset();
    serviceCasePermissionService.assert.mockRejectedValue(
      new ForbiddenException('Missing permission: service_cases.manage_costs'),
    );

    await expect(
      controller.update(orgId, caseId, { user } as never, { actualCostCents: 500 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(serviceCases.update).not.toHaveBeenCalled();
  });

  it('requires manage_costs for actualCostCents on complete', async () => {
    serviceCasePermissionService.assert.mockReset();
    serviceCasePermissionService.assert.mockResolvedValue(undefined);

    await controller.complete(orgId, caseId, { user } as never, { actualCostCents: 9900 } as never);

    expect(serviceCasePermissionService.assert).toHaveBeenCalledWith(
      expect.objectContaining({ id: user.id }),
      orgId,
      'service_cases.manage_costs',
    );
    expect(serviceCases.complete).toHaveBeenCalledWith(
      orgId,
      caseId,
      expect.objectContaining({ actualCostCents: 9900 }),
      user.id,
    );
  });

  it('passes actor user id from session to cancel', async () => {
    await controller.cancel(orgId, caseId, { user } as never);
    expect(serviceCases.cancel).toHaveBeenCalledWith(orgId, caseId, user.id);
  });
});

describe('ServiceCasesController lifecycle guard metadata', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = { organizationMembership: { findFirst: jest.fn() } };
  let permissionsGuard: PermissionsGuard;

  beforeEach(() => {
    permissionsGuard = new PermissionsGuard(reflector, prisma as never);
    jest.clearAllMocks();
  });

  it('denies complete for read-only vendor-management membership', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(
      SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.complete'],
    );
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { 'vendor-management': { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-1', organizationId: 'org1' },
            params: { orgId: 'org1' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: vendor-management.write', statusCode: 403 },
    });
  });
});
