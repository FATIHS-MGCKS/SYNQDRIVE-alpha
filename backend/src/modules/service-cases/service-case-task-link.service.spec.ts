import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceCaseTaskLinkService } from './service-case-task-link.service';

function makePrisma() {
  return {
    serviceCase: { findFirst: jest.fn() },
    orgTask: { findFirst: jest.fn(), update: jest.fn() },
    serviceCaseComment: { create: jest.fn() },
    taskEvent: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        orgTask: { update: jest.fn() },
        taskEvent: { create: jest.fn() },
        serviceCaseComment: { create: jest.fn() },
      }),
    ),
  };
}

describe('ServiceCaseTaskLinkService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let tasksService: { createManualTask: jest.Mock; getTaskById: jest.Mock };
  let svc: ServiceCaseTaskLinkService;

  const openCase = {
    id: 'sc-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: 'vendor-1',
    status: 'OPEN',
    title: 'Bremsenfall',
  };

  const openTask = {
    id: 'task-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vendorId: 'vendor-1',
    serviceCaseId: null,
    title: 'Bremsen prüfen',
    status: 'OPEN',
  };

  beforeEach(() => {
    prisma = makePrisma();
    tasksService = {
      createManualTask: jest.fn(),
      getTaskById: jest.fn(),
    };
    svc = new ServiceCaseTaskLinkService(prisma as never, tasksService as never);
    jest.clearAllMocks();
  });

  it('links a task when vehicle and org match', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(openCase);
    prisma.orgTask.findFirst.mockResolvedValue(openTask);
    tasksService.getTaskById.mockResolvedValue({ id: 'task-1', serviceCaseId: 'sc-1' });

    await svc.linkTask('org-1', 'sc-1', 'task-1', 'user-1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tasksService.getTaskById).toHaveBeenCalledWith('task-1', 'org-1');
  });

  it('rejects link when task vehicle differs from case', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(openCase);
    prisma.orgTask.findFirst.mockResolvedValue({ ...openTask, vehicleId: 'veh-2' });

    await expect(svc.linkTask('org-1', 'sc-1', 'task-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects link to completed case', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue({ ...openCase, status: 'COMPLETED' });
    prisma.orgTask.findFirst.mockResolvedValue(openTask);

    await expect(svc.linkTask('org-1', 'sc-1', 'task-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects link when task already linked elsewhere', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(openCase);
    prisma.orgTask.findFirst.mockResolvedValue({ ...openTask, serviceCaseId: 'sc-other' });

    await expect(svc.linkTask('org-1', 'sc-1', 'task-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('unlinks a task even when case is completed', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue({ ...openCase, status: 'COMPLETED' });
    prisma.orgTask.findFirst.mockResolvedValue({ ...openTask, serviceCaseId: 'sc-1' });
    tasksService.getTaskById.mockResolvedValue({ id: 'task-1', serviceCaseId: null });

    await svc.unlinkTask('org-1', 'sc-1', 'task-1', 'user-1');

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects unlink when task is not linked to case', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(openCase);
    prisma.orgTask.findFirst.mockResolvedValue(openTask);

    await expect(svc.unlinkTask('org-1', 'sc-1', 'task-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates task from case with inherited vehicle', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(openCase);
    tasksService.createManualTask.mockResolvedValue({ id: 'task-new', title: 'Diagnose' });
    prisma.serviceCaseComment.create.mockResolvedValue({});

    await svc.createTask('org-1', 'sc-1', { title: 'Diagnose' }, 'user-1');

    expect(tasksService.createManualTask).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        title: 'Diagnose',
        vehicleId: 'veh-1',
        serviceCaseId: 'sc-1',
        vendorId: 'vendor-1',
      }),
      'user-1',
    );
    expect(prisma.serviceCaseComment.create).toHaveBeenCalled();
  });

  it('throws when case not found in org', async () => {
    prisma.serviceCase.findFirst.mockResolvedValue(null);

    await expect(svc.linkTask('org-1', 'sc-1', 'task-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('counts open tasks excluding done and cancelled', () => {
    expect(
      svc.countOpenTasks([
        { status: 'OPEN' },
        { status: 'DONE' },
        { status: 'IN_PROGRESS' },
        { status: 'CANCELLED' },
      ]),
    ).toBe(2);
  });
});
