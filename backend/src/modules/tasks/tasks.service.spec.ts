import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

// Minimal OrgTask row factory for the prisma mock.
function baseTask(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    organizationId: 'org1',
    title: 'Task',
    description: null,
    category: null,
    type: 'CUSTOM',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    assignedUserId: null,
    createdByUserId: null,
    updatedByUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function makePrisma() {
  return {
    orgTask: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    taskEvent: { create: jest.fn().mockResolvedValue({}) },
    taskComment: { create: jest.fn() },
    taskChecklistItem: { create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    taskAttachment: { create: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    dashboardInsight: { findFirst: jest.fn() },
    fine: { findFirst: jest.fn() },
    orgInvoice: { findFirst: jest.fn() },
    vehicleDocumentExtraction: { findUnique: jest.fn() },
    serviceCase: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
}

describe('TasksService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: TasksService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new TasksService(prisma as any);
  });

  it('creates a manual task with defaults and records a CREATED event', async () => {
    prisma.orgTask.create.mockResolvedValue(baseTask());
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());

    const res = await svc.createManualTask('org1', { title: 'Task', type: 'CUSTOM' }, 'u1');

    expect(prisma.orgTask.create).toHaveBeenCalledTimes(1);
    const data = prisma.orgTask.create.mock.calls[0][0].data;
    expect(data.organizationId).toBe('org1');
    expect(data.type).toBe('CUSTOM');
    expect(data.priority).toBe('NORMAL');
    expect(data.sourceType).toBe('MANUAL');
    expect(prisma.taskEvent.create).toHaveBeenCalled();
    expect(res.id).toBe('t1');
    expect(res.isOverdue).toBe(false);
    expect(prisma.orgTask.create.mock.calls[0][0].data.createdByUserId).toBe('u1');
  });

  it('serializes createdByUserId on list and get responses', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({ id: 't-list', createdByUserId: 'creator-1', assignedUserId: 'assignee-1' }),
    ]);
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({ id: 't-detail', createdByUserId: 'creator-1', updatedByUserId: 'editor-1' }),
    );

    const list = await svc.listTasks('org1', {});
    expect(list[0].createdByUserId).toBe('creator-1');
    expect(list[0].assignedUserId).toBe('assignee-1');

    const detail = await svc.getTaskById('t-detail', 'org1');
    expect(detail.createdByUserId).toBe('creator-1');
    expect(detail.updatedByUserId).toBe('editor-1');
  });

  it('sets updatedByUserId on update while preserving createdByUserId', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ createdByUserId: 'creator-1' }))
      .mockResolvedValueOnce(baseTask({ createdByUserId: 'creator-1', updatedByUserId: 'editor-1', title: 'Updated' }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ title: 'Updated' }));

    const res = await svc.updateTask('org1', 't1', { title: 'Updated' }, 'editor-1');

    expect(prisma.orgTask.update.mock.calls[0][0].data.updatedByUserId).toBe('editor-1');
    expect(res.createdByUserId).toBe('creator-1');
    expect(res.updatedByUserId).toBe('editor-1');
  });

  it('serializes system tasks without createdByUserId', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({
        id: 'sys-1',
        sourceType: 'SYSTEM',
        source: 'INSIGHT_HEALTH',
        createdByUserId: null,
      }),
    ]);

    const list = await svc.listTasks('org1', {});
    expect(list[0].createdByUserId).toBeNull();
    expect(list[0].sourceType).toBe('SYSTEM');
  });

  it('rejects a manual task whose vehicle belongs to another org (tenant scoping)', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null); // not found in this org

    await expect(
      svc.createManualTask('org1', { title: 'X', type: 'CUSTOM', vehicleId: 'veh-other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.create).not.toHaveBeenCalled();
  });

  it('does not duplicate a system task with an active dedupKey — it escalates in place', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ id: 'tX', dedupKey: 'health:brake:v1', status: 'OPEN' }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ id: 'tX', priority: 'CRITICAL' }));

    await svc.upsertByDedup('org1', 'health:brake:v1', {
      title: 'Brake critical',
      source: 'INSIGHT_HEALTH',
      type: 'BRAKE_CHECK',
      sourceType: 'HEALTH',
      priority: 'CRITICAL',
    });

    expect(prisma.orgTask.update).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.create).not.toHaveBeenCalled();
  });

  it('creates a fresh system task when no active dedup row exists', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(null);
    prisma.orgTask.create.mockResolvedValue(baseTask({ dedupKey: 'booking:pickup:b1', sourceType: 'BOOKING' }));

    await svc.upsertByDedup('org1', 'booking:pickup:b1', {
      title: 'Pickup',
      source: 'BOOKING',
      type: 'BOOKING_PICKUP',
      sourceType: 'BOOKING',
    });

    expect(prisma.orgTask.create).toHaveBeenCalledTimes(1);
  });

  it('assigns a task to a member of the org and records an ASSIGNED event', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask()) // loadTaskOrThrow
      .mockResolvedValueOnce(baseTask({ assignedUserId: 'u2' })); // getTaskById
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.orgTask.update.mockResolvedValue(baseTask({ assignedUserId: 'u2' }));

    const res = await svc.assignTask('org1', 't1', 'u2', 'actor');

    expect(prisma.organizationMembership.findFirst).toHaveBeenCalled();
    expect(prisma.orgTask.update).toHaveBeenCalled();
    expect(prisma.taskEvent.create).toHaveBeenCalled();
    expect(res.assignedUserId).toBe('u2');
  });

  it('addComment creates a comment with userId and returns updated task detail', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask())
      .mockResolvedValueOnce(
        baseTask({
          comments: [{ id: 'c1', taskId: 't1', body: 'Notiz', userId: 'u1', createdAt: new Date() }],
        }),
      );
    prisma.taskComment.create.mockResolvedValue({ id: 'c1' });

    const res = await svc.addComment('org1', 't1', 'Notiz', 'u1');

    expect(prisma.taskComment.create).toHaveBeenCalledWith({
      data: { taskId: 't1', body: 'Notiz', userId: 'u1' },
    });
    expect(prisma.taskEvent.create).toHaveBeenCalled();
    expect(res.comments?.[0]?.body).toBe('Notiz');
    expect(res.comments?.[0]?.userId).toBe('u1');
  });

  it('rejects assignTask for users outside the org', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(svc.assignTask('org1', 't1', 'u-outside', 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('rejects assignTask on completed or cancelled tasks', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'DONE' }));

    await expect(svc.assignTask('org1', 't1', 'u2', 'actor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('getTaskById returns comments and timeline when included', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        comments: [{ id: 'c1', taskId: 't1', body: 'Hi', userId: 'u1', createdAt: new Date() }],
        events: [
          {
            id: 'e1',
            taskId: 't1',
            type: 'CREATED',
            actorUserId: null,
            oldValue: null,
            newValue: 'OPEN',
            createdAt: new Date(),
          },
        ],
      }),
    );

    const detail = await svc.getTaskById('t1', 'org1');
    expect(detail.comments?.[0]?.body).toBe('Hi');
    expect(detail.timeline?.[0]?.type).toBe('CREATED');
    expect(detail.createdByUserId).toBeNull();
  });

  it('allows a valid status transition OPEN → IN_PROGRESS and stamps startedAt', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'OPEN' }))
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', startedAt: new Date() }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));

    const res = await svc.startTask('org1', 't1', 'u1');

    expect(res.status).toBe('IN_PROGRESS');
    const update = prisma.orgTask.update.mock.calls[0][0].data;
    expect(update.status).toBe('IN_PROGRESS');
    expect(update.startedAt).toBeInstanceOf(Date);
  });

  it('rejects an invalid status transition DONE → IN_PROGRESS', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'DONE' }));

    await expect(svc.startTask('org1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('requires a resolution note to complete a BRAKE_CHECK', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'BRAKE_CHECK' }));

    await expect(svc.completeTask('org1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('completes a BRAKE_CHECK when a resolution note is given', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'BRAKE_CHECK' }))
      .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'BRAKE_CHECK', resolutionNote: 'pads ok' }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

    const res = await svc.completeTask('org1', 't1', { resolutionNote: 'pads ok' }, 'u1');

    expect(res.status).toBe('DONE');
    const update = prisma.orgTask.update.mock.calls[0][0].data;
    expect(update.completedAt).toBeInstanceOf(Date);
    expect(update.resolutionNote).toBe('pads ok');
  });

  it('completes a CUSTOM task without requiring a resolution note', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'CUSTOM' }))
      .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'CUSTOM' }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

    const res = await svc.completeTask('org1', 't1');
    expect(res.status).toBe('DONE');
  });

  it('derives isOverdue from dueDate + status (active overdue=true, terminal=false)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({ id: 'a', dueDate: past, status: 'OPEN' }),
      baseTask({ id: 'b', dueDate: past, status: 'DONE' }),
    ]);

    const list = await svc.listTasks('org1', {});
    expect(list.find((t) => t.id === 'a')!.isOverdue).toBe(true);
    expect(list.find((t) => t.id === 'b')!.isOverdue).toBe(false);
  });

  it('throws NotFound when cancelling a task that is not in the caller org', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(null);
    await expect(svc.cancelTask('orgX', 't1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects vendor task lookup when vendor is not in org', async () => {
    prisma.vendor.findFirst.mockResolvedValue(null);
    await expect(svc.getTasksForVendor('org1', 'vendor-other')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.findMany).not.toHaveBeenCalled();
  });

  it('rejects vehicle task lookup when vehicle is not in org', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(svc.getTasksForVehicle('org1', 'veh-other')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.findMany).not.toHaveBeenCalled();
  });

  it('aggregates a dashboard summary from grouped counts', async () => {
    prisma.orgTask.groupBy
      .mockResolvedValueOnce([
        { status: 'OPEN', _count: { _all: 3 } },
        { status: 'IN_PROGRESS', _count: { _all: 1 } },
        { status: 'DONE', _count: { _all: 2 } },
      ])
      .mockResolvedValueOnce([{ priority: 'CRITICAL', _count: { _all: 1 } }]);
    prisma.orgTask.count
      .mockResolvedValueOnce(3) // open
      .mockResolvedValueOnce(2) // overdue
      .mockResolvedValueOnce(1) // dueToday
      .mockResolvedValueOnce(1); // critical

    const summary = await svc.getDashboardSummary('org1');

    expect(summary.open).toBe(3);
    expect(summary.overdue).toBe(2);
    expect(summary.dueToday).toBe(1);
    expect(summary.critical).toBe(1);
    expect(summary.active).toBe(4); // OPEN + IN_PROGRESS + WAITING
    expect(summary.byStatus.DONE).toBe(2);
    expect(summary.assignedToMe).toBe(0); // no currentUserId provided
  });
});
