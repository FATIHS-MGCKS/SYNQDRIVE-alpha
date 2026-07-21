import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
    activatesAt: null,
    completionMode: null,
    resolutionCode: null,
    completedByUserId: null,
    supersededByTaskId: null,
    estimatedDurationMinutes: null,
    serviceCaseId: null,
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
    taskChecklistItem: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    taskAttachment: { create: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Berlin' }) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    vendor: { findFirst: jest.fn() },
    dashboardInsight: { findFirst: jest.fn() },
    fine: { findFirst: jest.fn() },
    orgInvoice: { findFirst: jest.fn() },
    vehicleDocumentExtraction: { findUnique: jest.fn() },
    serviceCase: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
}

describe('TasksService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let activityLog: { log: jest.Mock };
  let linkedObjectResolver: { resolveForTask: jest.Mock };
  let svc: TasksService;

  beforeEach(() => {
    prisma = makePrisma();
    activityLog = { log: jest.fn().mockResolvedValue({}) };
    linkedObjectResolver = { resolveForTask: jest.fn().mockResolvedValue([]) };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    svc = new TasksService(prisma as any, activityLog as any, linkedObjectResolver as any);
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

    const { data: list } = await svc.listTasks('org1', {});
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

    const { data: list } = await svc.listTasks('org1', {});
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

  it('rejects a manual task whose station belongs to another org (tenant scoping)', async () => {
    prisma.station.findFirst.mockResolvedValue(null);

    await expect(
      svc.createManualTask('org1', {
        title: 'X',
        type: 'CUSTOM',
        metadata: { stationId: 'station-other' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.create).not.toHaveBeenCalled();
  });

  it('rejects a manual task whose assignee is outside the org', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      svc.createManualTask('org1', { title: 'X', type: 'CUSTOM', assignedUserId: 'u-outside' }),
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

  it('getTaskById attaches resolved linkedObjects from the central resolver', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({ vehicleId: 'veh-1', bookingId: 'book-1', customerId: null }),
    );
    linkedObjectResolver.resolveForTask.mockResolvedValue([
      {
        type: 'VEHICLE',
        id: 'veh-1',
        primaryLabel: 'B-SY 100',
        iconKey: 'vehicle',
        action: { type: 'OPEN_VEHICLE', vehicleId: 'veh-1' },
        isAvailable: true,
      },
    ]);

    const detail = await svc.getTaskById('t1', 'org1');

    expect(linkedObjectResolver.resolveForTask).toHaveBeenCalledWith('org1', {
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      customerId: null,
      vendorId: null,
      alertId: null,
      documentId: null,
      fineId: null,
      invoiceId: null,
      serviceCaseId: null,
    });
    expect(detail.linkedObjects).toHaveLength(1);
    expect(detail.linkedObjects?.[0]?.primaryLabel).toBe('B-SY 100');
  });

  it('getTaskById returns normalized detail sections while preserving legacy top-level fields', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        type: 'VEHICLE_SERVICE',
        sourceType: 'SYSTEM',
        source: 'INSIGHT_SERVICE',
        assignedUserId: 'u-assign',
        createdByUserId: 'u-creator',
        metadata: {
          automation: { ruleId: 'insight.compliance.tuv_overdue' },
          detectedAt: '2026-07-14T08:00:00.000Z',
        },
        checklistItems: [{ id: 'ci1', title: 'Prüfen', isDone: false, isRequired: true, sortOrder: 0 }],
      }),
    );
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u-assign',
        name: 'Max Mustermann',
        firstName: null,
        lastName: null,
        email: 'max@example.com',
      },
      {
        id: 'u-creator',
        name: null,
        firstName: 'Anna',
        lastName: 'Schmidt',
        email: 'anna@example.com',
      },
    ]);

    const detail = await svc.getTaskById('t1', 'org1');

    expect(detail.id).toBe('t1');
    expect(detail.title).toBe('Task');
    expect(detail.summary).toMatchObject({
      id: 't1',
      type: 'VEHICLE_SERVICE',
      humanReadableSource: 'Service / Compliance',
    });
    expect(detail.reason.basis).toContain('insight.compliance.tuv_overdue');
    expect(detail.assignment.assignedUser?.displayName).toBe('Max Mustermann');
    expect(detail.assignment.createdBy?.displayName).toBe('Anna Schmidt');
    expect(detail.checklistProgress.requiredItems).toBe(1);
    expect(detail.availableActions.comment.enabled).toBe(true);
  });

  it('getTaskById exposes overrideCompletion when actor has manage permission', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        status: 'IN_PROGRESS',
        assignedUserId: 'u1',
        type: 'BOOKING_PICKUP',
        checklistItems: [
          {
            id: 'ci1',
            title: 'Kunde identifizieren',
            isDone: false,
            isRequired: true,
            sortOrder: 0,
          },
        ],
      }),
    );
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: { tasks: { read: true, write: true, manage: true } },
    });

    const detail = await svc.getTaskById('t1', 'org1', {
      id: 'manager-1',
      platformRole: 'USER',
    });

    expect(detail.availableActions.overrideCompletion.enabled).toBe(true);
    expect(detail.availableActions.complete.enabled).toBe(true);
  });

  it('getTaskById hides overrideCompletion without permission even when checklist is open', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        status: 'IN_PROGRESS',
        assignedUserId: 'u1',
        type: 'BOOKING_PICKUP',
        checklistItems: [
          {
            id: 'ci1',
            title: 'Kunde identifizieren',
            isDone: false,
            isRequired: true,
            sortOrder: 0,
          },
        ],
      }),
    );
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: true } },
    });

    const detail = await svc.getTaskById('t1', 'org1', {
      id: 'worker-1',
      platformRole: 'USER',
    });

    expect(detail.availableActions.overrideCompletion.enabled).toBe(false);
    expect(detail.availableActions.complete.enabled).toBe(false);
  });

  it('allows a valid status transition OPEN → IN_PROGRESS and stamps startedAt', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'OPEN' }))
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', startedAt: new Date() }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));

    const res = await svc.startTask('org1', 't1', 'u1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('IN_PROGRESS');
    const update = prisma.orgTask.update.mock.calls[0][0].data;
    expect(update.status).toBe('IN_PROGRESS');
    expect(update.startedAt).toBeInstanceOf(Date);
    expect(update.updatedByUserId).toBe('u1');
    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        type: 'STATUS_CHANGED',
        actorUserId: 'u1',
        oldValue: 'OPEN',
        newValue: 'IN_PROGRESS',
        metadata: { transition: 'IN_PROGRESS' },
      },
    });
  });

  it('does not overwrite startedAt on a repeated IN_PROGRESS transition', async () => {
    const existingStarted = new Date('2026-01-10T10:00:00Z');
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', startedAt: existingStarted }));

    await svc.startTask('org1', 't1', 'u1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('persists status change and STATUS_CHANGED atomically in one transaction', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'OPEN' }))
      .mockResolvedValueOnce(baseTask({ status: 'WAITING' }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'WAITING' }));

    await svc.moveTaskToWaiting('org1', 't1', 'u-wait');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.update).toHaveBeenCalledTimes(1);
    expect(prisma.taskEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rolls back the status change when STATUS_CHANGED event creation fails', async () => {
    prisma.orgTask.findFirst.mockResolvedValueOnce(baseTask({ status: 'OPEN' }));
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));
    prisma.taskEvent.create.mockRejectedValueOnce(new Error('event insert failed'));

    await expect(svc.startTask('org1', 't1', 'u1')).rejects.toThrow('event insert failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the current task without update or event on idempotent status request', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'DONE', completedAt: new Date() }))
      .mockResolvedValueOnce(baseTask({ status: 'DONE', completedAt: new Date() }));

    const res = await svc.completeTask('org1', 't1', { resolutionNote: 'again' }, { id: 'u1' });

    expect(res.status).toBe('DONE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid status transition DONE → IN_PROGRESS', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'DONE' }));

    await expect(svc.startTask('org1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('requires a resolution note to complete a BRAKE_CHECK', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'BRAKE_CHECK' }));

    await expect(svc.completeTask('org1', 't1', {}, { id: 'u1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('completes a BRAKE_CHECK when a resolution note is given', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'BRAKE_CHECK' }))
      .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'BRAKE_CHECK', resolutionNote: 'pads ok' }));
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

    const res = await svc.completeTask(
      'org1',
      't1',
      { resolutionNote: 'pads ok', resolutionCode: 'BRAKE_MEASURED_OK' },
      { id: 'u1' },
    );

    expect(res.status).toBe('DONE');
    const update = prisma.orgTask.update.mock.calls[0][0].data;
    expect(update.completedAt).toBeInstanceOf(Date);
    expect(update.completionMode).toBe('MANUAL');
    expect(update.completedByUserId).toBe('u1');
    expect(update.updatedByUserId).toBe('u1');
    expect(update.resolutionNote).toBe('pads ok');
    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STATUS_CHANGED',
        actorUserId: 'u1',
        oldValue: 'IN_PROGRESS',
        newValue: 'DONE',
        metadata: { completionMode: 'MANUAL', resolutionKind: 'MANUAL' },
      }),
    });
  });

  it('completes a CUSTOM task without requiring a resolution note', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'CUSTOM' }))
      .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'CUSTOM' }));
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

    const res = await svc.completeTask('org1', 't1', {}, { id: 'u1' });
    expect(res.status).toBe('DONE');
  });

  it('requires an authenticated actor to complete a task', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'CUSTOM' }));

    await expect(svc.completeTask('org1', 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('rejects completion before activatesAt (CB4)', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        status: 'OPEN',
        type: 'CUSTOM',
        activatesAt: new Date('2099-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    await expect(
      svc.completeTask('org1', 't1', {}, { id: 'u1' }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('activation time'),
    });
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });

  it('derives isOverdue from dueDate + status (active overdue=true, terminal=false)', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({ id: 'a', dueDate: past, status: 'OPEN' }),
      baseTask({ id: 'b', dueDate: past, status: 'DONE' }),
    ]);

    const { data: list } = await svc.listTasks('org1', {});
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

  it('seeds template checklist with isRequired flags when type has a template', async () => {
    prisma.orgTask.create.mockResolvedValue(baseTask());
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());

    await svc.createManualTask('org1', { title: 'Bremsen', type: 'BRAKE_CHECK' }, 'u1');

    const checklistCreate = prisma.orgTask.create.mock.calls[0][0].data.checklistItems.create;
    expect(checklistCreate).toHaveLength(5);
    expect(checklistCreate.find((i: { title: string }) => i.title === 'Messwerte eintragen').isRequired).toBe(true);
    expect(checklistCreate.find((i: { title: string }) => i.title === 'Ergebnis dokumentieren').isRequired).toBe(
      false,
    );
  });

  it('prefers an explicitly provided checklist over the type template', async () => {
    prisma.orgTask.create.mockResolvedValue(baseTask());
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());

    await svc.createManualTask(
      'org1',
      {
        title: 'Bremsen',
        type: 'BRAKE_CHECK',
        checklist: [{ title: 'Nur eigener Punkt', isRequired: true }],
      },
      'u1',
    );

    const checklistCreate = prisma.orgTask.create.mock.calls[0][0].data.checklistItems.create;
    expect(checklistCreate).toEqual([
      { title: 'Nur eigener Punkt', description: undefined, sortOrder: 0, isRequired: true },
    ]);
  });

  it('creates CUSTOM tasks without checklist items when no checklist is provided', async () => {
    prisma.orgTask.create.mockResolvedValue(baseTask());
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());

    await svc.createManualTask('org1', { title: 'Freie Aufgabe', type: 'CUSTOM' }, 'u1');

    expect(prisma.orgTask.create.mock.calls[0][0].data.checklistItems).toBeUndefined();
  });

  it('creates checklist items with isRequired when provided on manual task create', async () => {
    prisma.orgTask.create.mockResolvedValue(baseTask());
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());

    await svc.createManualTask(
      'org1',
      {
        title: 'Task',
        type: 'BRAKE_CHECK',
        checklist: [
          { title: 'Pflichtpunkt', isRequired: true },
          { title: 'Optionaler Punkt' },
        ],
      },
      'u1',
    );

    const checklistCreate = prisma.orgTask.create.mock.calls[0][0].data.checklistItems.create;
    expect(checklistCreate).toEqual([
      { title: 'Pflichtpunkt', description: undefined, sortOrder: 0, isRequired: true },
      { title: 'Optionaler Punkt', description: undefined, sortOrder: 1, isRequired: false },
    ]);
  });

  it('serializes isRequired on checklist items in task detail', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        checklistItems: [
          {
            id: 'ci1',
            taskId: 't1',
            title: 'Check brake pads',
            description: null,
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'ci2',
            taskId: 't1',
            title: 'Optional photo',
            description: null,
            sortOrder: 1,
            isDone: false,
            isRequired: false,
            completedAt: null,
            completedByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );

    const detail = await svc.getTaskById('t1', 'org1');
    expect(detail.checklist?.[0]?.isRequired).toBe(true);
    expect(detail.checklist?.[1]?.isRequired).toBe(false);
    expect(detail.checklistProgress).toEqual({
      totalItems: 2,
      completedItems: 0,
      requiredItems: 1,
      completedRequiredItems: 0,
      remainingRequiredItems: 1,
      progressPercent: 0,
      hasChecklist: true,
      areRequiredItemsComplete: false,
      canCompleteByChecklist: false,
      completionBlockers: ['REQUIRED_CHECKLIST_ITEMS_OPEN'],
    });
  });

  it('serializes checklistProgress on list responses from a batched aggregate query', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({ id: 't-open' }),
      baseTask({ id: 't-empty', type: 'CUSTOM' }),
    ]);
    prisma.taskChecklistItem.findMany.mockResolvedValue([
      { taskId: 't-open', isDone: true, isRequired: true },
      { taskId: 't-open', isDone: false, isRequired: true },
      { taskId: 't-open', isDone: false, isRequired: false },
    ]);

    const { data: list } = await svc.listTasks('org1', {});

    expect(prisma.taskChecklistItem.findMany).toHaveBeenCalledWith({
      where: { taskId: { in: ['t-open', 't-empty'] } },
      select: { taskId: true, isDone: true, isRequired: true },
    });
    expect(list[0].checklist).toBeUndefined();
    expect(list[0].checklistProgress).toMatchObject({
      totalItems: 3,
      requiredItems: 2,
      completedRequiredItems: 1,
      progressPercent: 50,
      canCompleteByChecklist: false,
      completionBlockers: ['REQUIRED_CHECKLIST_ITEMS_OPEN'],
    });
    expect(list[1].checklistProgress).toMatchObject({
      hasChecklist: false,
      progressPercent: null,
      canCompleteByChecklist: true,
      completionBlockers: [],
    });
  });

  it('suppresses checklist blockers on terminal legacy tasks in detail responses', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        status: 'DONE',
        checklistItems: [
          {
            id: 'ci1',
            taskId: 't1',
            title: 'Open required legacy step',
            description: null,
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );

    const detail = await svc.getTaskById('t1', 'org1');

    expect(detail.checklistProgress).toMatchObject({
      remainingRequiredItems: 1,
      canCompleteByChecklist: true,
      completionBlockers: [],
    });
  });

  it('addChecklistItem persists isRequired defaulting to false', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask())
      .mockResolvedValueOnce(baseTask({ checklistItems: [] }));
    prisma.taskChecklistItem.count.mockResolvedValue(0);
    prisma.taskChecklistItem.create.mockResolvedValue({ id: 'ci-new' });

    await svc.addChecklistItem('org1', 't1', { title: 'New item' }, 'u1');

    expect(prisma.taskChecklistItem.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        title: 'New item',
        description: undefined,
        sortOrder: 0,
        isRequired: false,
      },
    });
  });

  it('rejects checklist checkbox updates on completed tasks', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'DONE' }));

    await expect(svc.updateChecklistItem('org1', 't1', 'ci1', { isDone: true }, 'u1')).rejects.toMatchObject({
      response: {
        message: 'Checklistenpunkte können nach Abschluss oder Stornierung nicht mehr geändert werden.',
      },
    });
    expect(prisma.taskChecklistItem.update).not.toHaveBeenCalled();
  });

  it('records CHECKLIST_ITEM_UPDATED when toggling checklist completion', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));
    prisma.taskChecklistItem.findFirst.mockResolvedValue({
      id: 'ci1',
      title: 'Reifen prüfen',
      isDone: false,
      isRequired: true,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma));

    await svc.updateChecklistItem('org1', 't1', 'ci1', { isDone: true }, 'u1');

    expect(prisma.taskChecklistItem.update).toHaveBeenCalled();
    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 't1',
        type: 'CHECKLIST_ITEM_UPDATED',
        actorUserId: 'u1',
        oldValue: 'false',
        newValue: 'true',
        metadata: expect.objectContaining({
          itemId: 'ci1',
          title: 'Reifen prüfen',
          field: 'isDone',
        }),
      }),
    });
  });

  it('rejects adding checklist items to cancelled tasks', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'CANCELLED' }));

    await expect(
      svc.addChecklistItem('org1', 't1', { title: 'Später hinzugefügt' }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.taskChecklistItem.create).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce(1) // critical
      .mockResolvedValueOnce(0) // NOW
      .mockResolvedValueOnce(1) // TODAY
      .mockResolvedValueOnce(0) // UPCOMING
      .mockResolvedValueOnce(0) // PLANNED
      .mockResolvedValueOnce(2) // OVERDUE
      .mockResolvedValueOnce(0) // UNASSIGNED
      .mockResolvedValueOnce(4) // ALL_OPEN
      .mockResolvedValueOnce(2); // COMPLETED

    const summary = await svc.getDashboardSummary('org1');

    expect(summary.open).toBe(3);
    expect(summary.overdue).toBe(2);
    expect(summary.dueToday).toBe(1);
    expect(summary.critical).toBe(1);
    expect(summary.active).toBe(4); // OPEN + IN_PROGRESS + WAITING
    expect(summary.byStatus.DONE).toBe(2);
    expect(summary.assignedToMe).toBe(0);
    expect(summary.buckets.OVERDUE).toBe(2);
    expect(summary.buckets.TODAY).toBe(1);
    expect(summary.timezone).toBe('Europe/Berlin');
  });

  it('listTasks applies bucket filter and returns primary bucket per row', async () => {
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({
        id: 't-overdue',
        dueDate: new Date('2026-01-01T00:00:00Z'),
        activatesAt: null,
      }),
    ]);

    const { data: list } = await svc.listTasks('org1', { bucket: 'OVERDUE' });

    expect(prisma.orgTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ organizationId: 'org1' }),
            expect.any(Object),
          ]),
        }),
      }),
    );
    expect(list[0]?.bucket).toBe('OVERDUE');
    expect(list[0]?.isActivated).toBe(true);
  });

  it('does not mark tasks overdue before activatesAt', async () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({
        dueDate: new Date('2026-07-10T00:00:00.000Z'),
        activatesAt: new Date('2026-07-20T00:00:00.000Z'),
      }),
    ]);

    const { data: list } = await svc.listTasks('org1', {});
    expect(list[0]?.isOverdue).toBe(false);
    expect(list[0]?.bucket).toBe('PLANNED');
    jest.useRealTimers();
  });

  it('serializes V2 completion fields with activatesAt fallback to createdAt', async () => {
    prisma.orgTask.findFirst.mockResolvedValue(
      baseTask({
        activatesAt: null,
        completionMode: 'MANUAL',
        resolutionCode: 'BRAKE_MEASURED_OK',
        completedByUserId: 'u-done',
        supersededByTaskId: null,
        estimatedDurationMinutes: 45,
        createdAt: new Date('2026-01-01T08:00:00Z'),
      }),
    );

    const detail = await svc.getTaskById('t1', 'org1');
    expect(detail.activatesAt).toBe('2026-01-01T08:00:00.000Z');
    expect(detail.completionMode).toBe('MANUAL');
    expect(detail.resolutionCode).toBe('BRAKE_MEASURED_OK');
    expect(detail.completedByUserId).toBe('u-done');
    expect(detail.estimatedDurationMinutes).toBe(45);
  });

  it('sets completionMode MANUAL and completedByUserId when completing a task', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'CUSTOM' }))
      .mockResolvedValueOnce(
        baseTask({
          status: 'DONE',
          completionMode: 'MANUAL',
          completedByUserId: 'u1',
        }),
      );
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

    await svc.completeTask('org1', 't1', { resolutionCode: 'OTHER' }, { id: 'u1' });

    const update = prisma.orgTask.update.mock.calls[0][0].data;
    expect(update.completionMode).toBe('MANUAL');
    expect(update.completedByUserId).toBe('u1');
    expect(update.resolutionCode).toBe('OTHER');
    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STATUS_CHANGED',
        metadata: { completionMode: 'MANUAL', resolutionKind: 'MANUAL' },
      }),
    });
  });

  it('sets cancelledAt when cancelling a task without completionMode', async () => {
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'OPEN' }))
      .mockResolvedValueOnce(baseTask({ status: 'CANCELLED', completionMode: null }));
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'CANCELLED' }));

    await svc.cancelTask('org1', 't1', 'u1');

    const update = prisma.orgTask.update.mock.calls[0][0].data;
    expect(update.cancelledAt).toBeInstanceOf(Date);
    expect(update.completionMode).toBeUndefined();
    expect(update.completedByUserId).toBe('u1');
    expect(update.updatedByUserId).toBe('u1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not mark a task overdue before activatesAt even when dueDate is past', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    prisma.orgTask.findMany.mockResolvedValue([
      baseTask({
        id: 'future-active',
        dueDate: past,
        status: 'OPEN',
        activatesAt: future,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ]);

    const { data: list } = await svc.listTasks('org1', {});
    expect(list.find((t) => t.id === 'future-active')!.isOverdue).toBe(false);
  });

  it('persists activatesAt and estimatedDurationMinutes on manual task create', async () => {
    prisma.orgTask.create.mockResolvedValue(baseTask());
    prisma.orgTask.findFirst.mockResolvedValue(baseTask());

    await svc.createManualTask(
      'org1',
      {
        title: 'Planned task',
        type: 'CUSTOM',
        activatesAt: '2026-08-01T10:00:00.000Z',
        estimatedDurationMinutes: 90,
      },
      'u1',
    );

    const createData = prisma.orgTask.create.mock.calls[0][0].data;
    expect(createData.activatesAt).toEqual(new Date('2026-08-01T10:00:00.000Z'));
    expect(createData.estimatedDurationMinutes).toBe(90);
  });

  describe('manual completion checklist validation', () => {
    beforeEach(() => {
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
    });

    it('blocks manual completion when required checklist items are open', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'BOOKING_PICKUP' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce([
        { id: 'ci1', title: 'Kunde identifizieren', isDone: false, isRequired: true },
        { id: 'ci2', title: 'Fotos (optional)', isDone: false, isRequired: false },
      ]);

      await expect(svc.completeTask('org1', 't1', {}, { id: 'u1' })).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: 'TASK_REQUIRED_CHECKLIST_INCOMPLETE',
          message:
            'Die Aufgabe kann noch nicht abgeschlossen werden. 1 erforderlicher Schritt ist offen.',
          remainingRequiredItems: 1,
          openRequiredItems: [{ id: 'ci1', title: 'Kunde identifizieren' }],
        },
      });
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows manual completion when only optional checklist items remain open', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'BOOKING_PICKUP' }))
        .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'BOOKING_PICKUP' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce([
        { id: 'ci1', title: 'Pflicht erledigt', isDone: true, isRequired: true },
        { id: 'ci2', title: 'Optional offen', isDone: false, isRequired: false },
      ]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      const res = await svc.completeTask('org1', 't1', {}, { id: 'u1' });

      expect(res.status).toBe('DONE');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('allows manual completion when all required checklist items are done', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'CUSTOM' }))
        .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'CUSTOM' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce([
        { id: 'ci1', title: 'Schritt A', isDone: true, isRequired: true },
        { id: 'ci2', title: 'Schritt B', isDone: true, isRequired: true },
      ]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask('org1', 't1', {}, { id: 'u1' });

      expect(prisma.orgTask.update).toHaveBeenCalled();
    });

    it('loads checklist items tenant-scoped before validating completion', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }))
        .mockResolvedValueOnce(baseTask({ status: 'DONE' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce([]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask('org1', 't1', {}, { id: 'u1' });

      expect(prisma.taskChecklistItem.findMany).toHaveBeenCalledWith({
        where: { taskId: 't1', task: { id: 't1', organizationId: 'org1' } },
        select: { id: true, title: true, isDone: true, isRequired: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('manager checklist completion override', () => {
    const openRequired = [{ id: 'ci1', title: 'Kunde identifizieren', isDone: false, isRequired: true }];

    beforeEach(() => {
      prisma.organizationMembership.findFirst.mockImplementation(async (args: any) => {
        if (args?.select?.role) {
          return { role: 'ORG_ADMIN', permissions: { tasks: { read: true, write: true, manage: true } } };
        }
        return { id: 'm1' };
      });
    });

    it('allows ORG_ADMIN to complete with override and records audit events', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'BOOKING_PICKUP' }))
        .mockResolvedValueOnce(baseTask({ status: 'DONE', type: 'BOOKING_PICKUP' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce(openRequired);
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask(
        'org1',
        't1',
        {
          overrideIncompleteChecklist: true,
          overrideReason: 'Dringende Übergabe vor Ort',
        },
        { id: 'admin-1' },
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.taskEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'STATUS_CHANGED',
          metadata: expect.objectContaining({
            resolutionKind: 'MANUAL',
            checklistOverride: true,
            overriddenBlockers: ['CHECKLIST'],
          }),
        }),
      });
      expect(prisma.taskEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'CHECKLIST_COMPLETION_OVERRIDDEN',
          actorUserId: 'admin-1',
          metadata: expect.objectContaining({
            reason: 'Dringende Übergabe vor Ort',
            openRequiredItems: [{ id: 'ci1', title: 'Kunde identifizieren' }],
            remainingRequiredItems: 1,
          }),
        }),
      });
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org1',
          userId: 'admin-1',
          entity: 'TASK',
          entityId: 't1',
          metaJson: expect.objectContaining({
            kind: 'TASK_CHECKLIST_COMPLETION_OVERRIDE',
            reason: 'Dringende Übergabe vor Ort',
          }),
        }),
      );
    });

    it('rejects unauthorized workers attempting override with Forbidden', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'BOOKING_PICKUP' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce(openRequired);
      prisma.organizationMembership.findFirst.mockReset();
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'WORKER',
        permissions: { tasks: { read: true, write: true, manage: false } },
      });

      await expect(
        svc.completeTask(
          'org1',
          't1',
          { overrideIncompleteChecklist: true, overrideReason: 'Versuch' },
          { id: 'worker-1' },
        ),
      ).rejects.toMatchObject({
        response: {
          statusCode: 403,
          code: 'TASK_CHECKLIST_OVERRIDE_FORBIDDEN',
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects override without a reason when required items are open', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce(openRequired);

      await expect(
        svc.completeTask('org1', 't1', { overrideIncompleteChecklist: true }, { id: 'admin-1' }),
      ).rejects.toMatchObject({
        response: {
          code: 'TASK_OVERRIDE_REASON_REQUIRED',
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not require override when all required checklist items are complete', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }))
        .mockResolvedValueOnce(baseTask({ status: 'DONE' }));
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce([
        { id: 'ci1', title: 'Erledigt', isDone: true, isRequired: true },
      ]);
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask('org1', 't1', {}, { id: 'admin-1' });

      expect(prisma.taskEvent.create).not.toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'CHECKLIST_COMPLETION_OVERRIDDEN' }),
      });
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('includes override details in task detail timeline', async () => {
      const doneWithTimeline = baseTask({
        status: 'DONE',
        events: [
          {
            id: 'ev-status',
            taskId: 't1',
            type: 'STATUS_CHANGED',
            actorUserId: 'admin-1',
            oldValue: 'IN_PROGRESS',
            newValue: 'DONE',
            metadata: { resolutionKind: 'MANUAL', checklistOverride: true, overriddenBlockers: ['CHECKLIST'] },
            createdAt: new Date('2026-07-15T12:00:00Z'),
          },
          {
            id: 'ev-override',
            taskId: 't1',
            type: 'CHECKLIST_COMPLETION_OVERRIDDEN',
            actorUserId: 'admin-1',
            oldValue: 'IN_PROGRESS',
            newValue: 'DONE',
            metadata: {
              reason: 'Dringende Übergabe vor Ort',
              openRequiredItems: [{ id: 'ci1', title: 'Kunde identifizieren' }],
              remainingRequiredItems: 1,
            },
            createdAt: new Date('2026-07-15T12:00:01Z'),
          },
        ],
      });
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }))
        .mockResolvedValueOnce(doneWithTimeline)
        .mockResolvedValueOnce(doneWithTimeline);
      prisma.taskChecklistItem.findMany.mockResolvedValueOnce(openRequired);
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask(
        'org1',
        't1',
        { overrideIncompleteChecklist: true, overrideReason: 'Dringende Übergabe vor Ort' },
        { id: 'admin-1' },
      );

      const detail = await svc.getTaskById('t1', 'org1');
      expect(detail.timeline?.some((e) => e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN')).toBe(true);
      const overrideEvent = detail.timeline?.find((e) => e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN');
      expect(overrideEvent?.metadata).toMatchObject({
        reason: 'Dringende Übergabe vor Ort',
        openRequiredItems: [{ id: 'ci1', title: 'Kunde identifizieren' }],
      });
    });

    it('rejects override completion for tasks outside the tenant', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(null);

      await expect(
        svc.completeTask(
          'org-other',
          't1',
          { overrideIncompleteChecklist: true, overrideReason: 'X' },
          { id: 'admin-1' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('autoResolveTask', () => {
    const autoInput = {
      resolutionCode: 'PAYMENT_RECEIVED',
      reason: 'Invoice fully paid',
      metadata: { ruleId: 'invoice.paid' },
    };

    it('auto-resolves an active task with atomic update and AUTO_RESOLVED event', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'OPEN' }))
        .mockResolvedValueOnce(
          baseTask({
            status: 'DONE',
            completionMode: 'AUTO_RESOLVED',
            resolutionCode: 'PAYMENT_RECEIVED',
            resolutionNote: '[Auto-resolved] Invoice fully paid',
            completedByUserId: null,
          }),
        );
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      const res = await svc.autoResolveTask('org1', 't1', autoInput);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.orgTask.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: {
          status: 'DONE',
          completionMode: 'AUTO_RESOLVED',
          resolutionCode: 'PAYMENT_RECEIVED',
          resolutionNote: '[Auto-resolved] Invoice fully paid',
          completedAt: expect.any(Date),
          completedByUserId: null,
        },
      });
      expect(prisma.taskEvent.create).toHaveBeenCalledWith({
        data: {
          taskId: 't1',
          type: 'AUTO_RESOLVED',
          actorUserId: null,
          oldValue: 'OPEN',
          newValue: 'DONE',
          metadata: {
            resolutionCode: 'PAYMENT_RECEIVED',
            reason: 'Invoice fully paid',
            completionMode: 'AUTO_RESOLVED',
            resolutionKind: 'AUTO_RESOLVED',
            ruleId: 'invoice.paid',
          },
        },
      });
      expect(res.status).toBe('DONE');
      expect(res.completionMode).toBe('AUTO_RESOLVED');
      expect(prisma.taskChecklistItem.findMany).not.toHaveBeenCalled();
    });

    it('auto-resolves even when required checklist items would block manual completion', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type: 'BOOKING_PICKUP' }))
        .mockResolvedValueOnce(
          baseTask({
            status: 'DONE',
            completionMode: 'AUTO_RESOLVED',
            resolutionCode: 'PAYMENT_RECEIVED',
          }),
        );
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.autoResolveTask('org1', 't1', autoInput);

      expect(prisma.taskChecklistItem.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rolls back when AUTO_RESOLVED event creation fails', async () => {
      prisma.orgTask.findFirst.mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }));
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));
      prisma.taskEvent.create.mockRejectedValueOnce(new Error('event failed'));

      await expect(svc.autoResolveTask('org1', 't1', autoInput)).rejects.toThrow('event failed');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('is idempotent when task is already DONE with AUTO_RESOLVED', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ status: 'DONE', completionMode: 'AUTO_RESOLVED', resolutionCode: 'PAYMENT_RECEIVED' }),
      );

      const res = await svc.autoResolveTask('org1', 't1', autoInput);

      expect(res.status).toBe('DONE');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
      expect(prisma.taskEvent.create).not.toHaveBeenCalled();
    });

    it('rejects reclassifying a manually completed task', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ status: 'DONE', completionMode: 'MANUAL', completedByUserId: 'u1' }),
      );

      await expect(svc.autoResolveTask('org1', 't1', autoInput)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects tasks outside the caller organization', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(null);

      await expect(svc.autoResolveTask('org-other', 't1', autoInput)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('requires resolutionCode and reason', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'OPEN' }));

      await expect(svc.autoResolveTask('org1', 't1', { resolutionCode: '', reason: 'x' })).rejects.toThrow(
        'resolutionCode is required',
      );
      await expect(svc.autoResolveTask('org1', 't1', { resolutionCode: 'X', reason: '  ' })).rejects.toThrow(
        'reason is required',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('supersedeTask', () => {
    const supersedeInput = {
      resolutionCode: 'BOOKING_PHASE_ADVANCED',
      reason: 'Booking moved to next lifecycle phase',
      supersededByTaskId: 't-successor',
      metadata: { bookingId: 'b1' },
    };

    it('supersedes an active task atomically with SUPERSEDED event', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'OPEN', id: 't-old' }))
        .mockResolvedValueOnce(baseTask({ id: 't-successor', organizationId: 'org1' }))
        .mockResolvedValueOnce({ supersededByTaskId: null })
        .mockResolvedValueOnce(
          baseTask({
            id: 't-old',
            status: 'DONE',
            completionMode: 'SUPERSEDED',
            supersededByTaskId: 't-successor',
            resolutionCode: 'BOOKING_PHASE_ADVANCED',
          }),
        );
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      const res = await svc.supersedeTask('org1', 't-old', supersedeInput);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.orgTask.update).toHaveBeenCalledWith({
        where: { id: 't-old' },
        data: {
          status: 'DONE',
          completionMode: 'SUPERSEDED',
          resolutionCode: 'BOOKING_PHASE_ADVANCED',
          resolutionNote: '[Superseded] Booking moved to next lifecycle phase',
          completedAt: expect.any(Date),
          completedByUserId: null,
          supersededByTaskId: 't-successor',
        },
      });
      expect(prisma.taskEvent.create).toHaveBeenCalledWith({
        data: {
          taskId: 't-old',
          type: 'SUPERSEDED',
          actorUserId: null,
          oldValue: 'OPEN',
          newValue: 'DONE',
          metadata: {
            resolutionCode: 'BOOKING_PHASE_ADVANCED',
            reason: 'Booking moved to next lifecycle phase',
            completionMode: 'SUPERSEDED',
            resolutionKind: 'SUPERSEDED',
            supersededByTaskId: 't-successor',
            bookingId: 'b1',
          },
        },
      });
      expect(res.completionMode).toBe('SUPERSEDED');
      expect(res.supersededByTaskId).toBe('t-successor');
    });

    it('requires the successor task to belong to the same organization', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'OPEN', id: 't-old' }))
        .mockResolvedValueOnce(null);

      await expect(svc.supersedeTask('org1', 't-old', supersedeInput)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects self-supersede', async () => {
      prisma.orgTask.findFirst.mockResolvedValueOnce(baseTask({ status: 'OPEN', id: 't1' }));

      await expect(
        svc.supersedeTask('org1', 't1', { ...supersedeInput, supersededByTaskId: 't1' }),
      ).rejects.toThrow('cannot supersede itself');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects supersede cycles via successor chain', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'OPEN', id: 't-a' }))
        .mockResolvedValueOnce(baseTask({ id: 't-b', organizationId: 'org1' }))
        .mockResolvedValueOnce({ supersededByTaskId: 't-a' });

      await expect(
        svc.supersedeTask('org1', 't-a', { ...supersedeInput, supersededByTaskId: 't-b' }),
      ).rejects.toThrow('supersede cycle');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('is idempotent when already SUPERSEDED with the same successor', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({
          status: 'DONE',
          completionMode: 'SUPERSEDED',
          supersededByTaskId: 't-successor',
        }),
      );

      const res = await svc.supersedeTask('org1', 't1', supersedeInput);

      expect(res.status).toBe('DONE');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
      expect(prisma.taskEvent.create).not.toHaveBeenCalled();
    });

    it('rejects reclassifying a manually completed task', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ status: 'DONE', completionMode: 'MANUAL', completedByUserId: 'u1' }),
      );

      await expect(svc.supersedeTask('org1', 't1', supersedeInput)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rolls back when SUPERSEDED event creation fails', async () => {
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'WAITING', id: 't-old' }))
        .mockResolvedValueOnce(baseTask({ id: 't-successor', organizationId: 'org1' }))
        .mockResolvedValueOnce({ supersededByTaskId: null });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));
      prisma.taskEvent.create.mockRejectedValueOnce(new Error('supersede event failed'));

      await expect(svc.supersedeTask('org1', 't-old', supersedeInput)).rejects.toThrow('supersede event failed');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('bulk terminal paths', () => {
    it('closeStaleInsightTasks auto-resolves each stale insight task', async () => {
      prisma.orgTask.findMany.mockResolvedValue([
        { id: 't1', source: 'INSIGHT_SERVICE', dedupKey: 'svc:1' },
        { id: 't2', source: 'INSIGHT_COMPLIANCE', dedupKey: 'cmp:1' },
      ]);
      const autoResolve = jest.spyOn(svc, 'autoResolveTask').mockResolvedValue({} as any);

      const count = await svc.closeStaleInsightTasks('org1', ['active:key'], ['INSIGHT_SERVICE']);

      expect(count).toBe(2);
      expect(autoResolve).toHaveBeenCalledTimes(2);
      expect(autoResolve).toHaveBeenCalledWith('org1', 't1', expect.objectContaining({
        resolutionCode: 'INSIGHT_CLEARED',
        metadata: expect.objectContaining({ ruleId: 'insight.stale_close' }),
      }));
      autoResolve.mockRestore();
    });

    it('closeStaleBookingLifecycleTasks supersedes each obsolete booking task', async () => {
      prisma.orgTask.findMany.mockResolvedValue([
        { id: 't-old', dedupKey: 'booking:prep:b1' },
      ]);
      const supersede = jest.spyOn(svc, 'supersedeTask').mockResolvedValue({} as any);

      const count = await svc.closeStaleBookingLifecycleTasks('org1', 'b1', ['booking:pickup:b1']);

      expect(count).toBe(1);
      expect(supersede).toHaveBeenCalledWith('org1', 't-old', expect.objectContaining({
        resolutionCode: 'BOOKING_PHASE_SUPERSEDED',
        metadata: expect.objectContaining({ bookingId: 'b1', ruleId: 'booking.lifecycle_supersede' }),
      }));
      supersede.mockRestore();
    });

    it('closeInvoiceLinkedTasks auto-resolves active invoice-linked tasks', async () => {
      const autoResolve = jest
        .spyOn(svc, 'autoResolveInvoicePaymentCheckTasks')
        .mockResolvedValue(1);

      const count = await svc.closeInvoiceLinkedTasks('org1', 'inv-1');

      expect(count).toBe(1);
      expect(autoResolve).toHaveBeenCalledWith(
        'org1',
        'inv-1',
        expect.objectContaining({
          resolutionCode: 'PAYMENT_RECEIVED',
          metadata: expect.objectContaining({ invoiceId: 'inv-1' }),
        }),
      );
      autoResolve.mockRestore();
    });

    it('updateTaskTiming records TIMING_CHANGED for active tasks', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({
          id: 't-prep',
          status: 'OPEN',
          activatesAt: new Date('2026-07-23T10:00:00.000Z'),
          dueDate: new Date('2026-07-25T08:00:00.000Z'),
        }),
      );
      prisma.orgTask.update.mockResolvedValue(baseTask({ id: 't-prep' }));

      await svc.updateTaskTiming(
        'org1',
        't-prep',
        {
          activatesAt: new Date('2026-07-26T10:00:00.000Z'),
          dueDate: new Date('2026-07-28T08:00:00.000Z'),
        },
        { ruleId: 'booking.lifecycle.confirmed.prep', bookingId: 'b1' },
      );

      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TIMING_CHANGED',
            taskId: 't-prep',
          }),
        }),
      );
    });

    it('updateTaskTiming does not reopen completed preparation tasks', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ id: 't-done', status: 'DONE' }));
      const updateSpy = jest.spyOn(prisma.orgTask, 'update');

      await svc.updateTaskTiming('org1', 't-done', {
        activatesAt: new Date('2026-07-26T10:00:00.000Z'),
        dueDate: new Date('2026-07-28T08:00:00.000Z'),
      });

      expect(updateSpy).not.toHaveBeenCalled();
      expect(prisma.taskEvent.create).not.toHaveBeenCalled();
    });

    it('supersedeActiveBookingPreparationTasks supersedes open preparation rows', async () => {
      prisma.orgTask.findMany.mockResolvedValue([{ id: 't-prep', dedupKey: 'booking:prep:b1' }]);
      const supersede = jest.spyOn(svc, 'supersedeTask').mockResolvedValue({} as any);

      const count = await svc.supersedeActiveBookingPreparationTasks('org1', 'b1');

      expect(count).toBe(1);
      expect(supersede).toHaveBeenCalledWith(
        'org1',
        't-prep',
        expect.objectContaining({ resolutionCode: 'BOOKING_CANCELLED' }),
      );
      supersede.mockRestore();
    });

    it('autoResolveActiveBookingHandoverTask auto-resolves active pickup/return rows', async () => {
      prisma.orgTask.findMany.mockResolvedValue([{ id: 't-pickup', dedupKey: 'booking:pickup:b1' }]);
      const autoResolve = jest.spyOn(svc, 'autoResolveTask').mockResolvedValue({} as any);

      const count = await svc.autoResolveActiveBookingHandoverTask('org1', 'b1', 'BOOKING_PICKUP', {
        resolutionCode: 'HANDOVER_PICKUP_COMPLETED',
        reason: 'Pickup done',
        ruleId: 'booking.handover.pickup.completed',
        handoverKind: 'PICKUP',
      });

      expect(count).toBe(1);
      expect(autoResolve).toHaveBeenCalledWith(
        'org1',
        't-pickup',
        expect.objectContaining({
          resolutionCode: 'HANDOVER_PICKUP_COMPLETED',
          metadata: expect.objectContaining({ handoverKind: 'PICKUP' }),
        }),
      );
      autoResolve.mockRestore();
    });

    it('supersedeActiveBookingLifecycleTasks supersedes prep, pickup and return rows', async () => {
      prisma.orgTask.findMany.mockResolvedValue([
        { id: 't-prep', dedupKey: 'booking:prep:b1' },
        { id: 't-pickup', dedupKey: 'booking:pickup:b1' },
      ]);
      const supersede = jest.spyOn(svc, 'supersedeTask').mockResolvedValue({} as any);

      const count = await svc.supersedeActiveBookingLifecycleTasks('org1', 'b1', {
        resolutionCode: 'BOOKING_CANCELLED',
        reason: 'Cancelled',
        ruleId: 'booking.lifecycle.cancelled',
      });

      expect(count).toBe(2);
      expect(supersede).toHaveBeenCalledTimes(2);
      supersede.mockRestore();
    });

    it('updateTaskTiming updates priority when provided', async () => {
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({
          id: 't-pickup',
          status: 'OPEN',
          priority: 'NORMAL',
          activatesAt: new Date('2026-07-25T08:00:00.000Z'),
          dueDate: new Date('2026-07-25T10:00:00.000Z'),
        }),
      );
      prisma.orgTask.update.mockResolvedValue(baseTask({ id: 't-pickup', priority: 'HIGH' }));

      await svc.updateTaskTiming(
        'org1',
        't-pickup',
        {
          activatesAt: new Date('2026-07-25T08:00:00.000Z'),
          dueDate: new Date('2026-07-25T10:00:00.000Z'),
          priority: 'HIGH',
        },
        { ruleId: 'booking.lifecycle.confirmed.pickup' },
      );

      expect(prisma.orgTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 'HIGH' }),
        }),
      );
    });
  });

  it('listTasks applies invoice, station and activation filters', async () => {
    prisma.orgTask.findMany.mockResolvedValue([]);

    await svc.listTasks('org1', {
      invoiceId: 'inv-1',
      stationId: 'station-1',
      activatesFrom: '2026-07-01T00:00:00.000Z',
      activatesTo: '2026-07-31T23:59:59.000Z',
    });

    expect(prisma.orgTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ organizationId: 'org1', invoiceId: 'inv-1' }),
            expect.objectContaining({
              metadata: { path: ['stationId'], equals: 'station-1' },
            }),
            expect.objectContaining({
              activatesAt: {
                gte: new Date('2026-07-01T00:00:00.000Z'),
                lte: new Date('2026-07-31T23:59:59.000Z'),
              },
            }),
          ]),
        }),
      }),
    );
  });

  describe('bulkTaskActions', () => {
    it('returns partial results and reuses audited single-task services', async () => {
      const assignSpy = jest
        .spyOn(svc, 'assignTask')
        .mockResolvedValueOnce({ id: 't1' } as any)
        .mockRejectedValueOnce(new NotFoundException('Task not found'));
      const waitingSpy = jest.spyOn(svc, 'moveTaskToWaiting');

      const result = await svc.bulkTaskActions(
        'org1',
        { taskIds: ['t1', 't-missing'], action: 'assign', assignedUserId: 'u2' },
        'actor-1',
      );

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results).toEqual([
        { taskId: 't1', success: true },
        { taskId: 't-missing', success: false, error: 'Task not found' },
      ]);
      expect(assignSpy).toHaveBeenCalledTimes(2);
      expect(assignSpy).toHaveBeenCalledWith('org1', 't1', 'u2', 'actor-1');
      expect(waitingSpy).not.toHaveBeenCalled();

      assignSpy.mockRestore();
      waitingSpy.mockRestore();
    });

    it('does not use updateMany for bulk waiting transitions', async () => {
      const updateManySpy = jest.fn();
      const waitingSpy = jest
        .spyOn(svc, 'moveTaskToWaiting')
        .mockResolvedValue({ id: 't1' } as any);

      await svc.bulkTaskActions('org1', { taskIds: ['t1'], action: 'set_waiting' }, 'actor-1');

      expect(waitingSpy).toHaveBeenCalledWith('org1', 't1', 'actor-1');
      expect(updateManySpy).not.toHaveBeenCalled();

      waitingSpy.mockRestore();
    });

    it('isolates bulk actions per organization via loadTaskOrThrow', async () => {
      const cancelSpy = jest
        .spyOn(svc, 'cancelTask')
        .mockRejectedValueOnce(new NotFoundException('Task not found'));

      const result = await svc.bulkTaskActions(
        'org2',
        { taskIds: ['t-other-org'], action: 'cancel' },
        'actor-1',
      );

      expect(result.failed).toBe(1);
      expect(cancelSpy).toHaveBeenCalledWith('org2', 't-other-org', 'actor-1');

      cancelSpy.mockRestore();
    });
  });

  describe('createManualTask field persistence', () => {
    function mockCreatedTask(over: Record<string, unknown> = {}) {
      return baseTask({
        id: 'created-1',
        title: 'Vollständige Aufgabe',
        description: 'Beschreibung',
        type: 'VEHICLE_SERVICE',
        priority: 'HIGH',
        assignedUserId: 'u2',
        vehicleId: 'veh-1',
        bookingId: 'book-1',
        customerId: 'cust-1',
        invoiceId: 'inv-1',
        vendorId: 'ven-1',
        documentId: 'doc-1',
        serviceCaseId: 'sc-1',
        dueDate: new Date('2026-08-01T10:00:00.000Z'),
        activatesAt: new Date('2026-07-20T08:00:00.000Z'),
        estimatedDurationMinutes: 120,
        blocksVehicleAvailability: true,
        metadata: { stationId: 'station-1' },
        comments: [{ id: 'c1', userId: 'u1', body: 'Erste Notiz', createdAt: new Date() }],
        checklistItems: [
          { id: 'cl1', title: 'Pflicht', isDone: false, isRequired: true, sortOrder: 0, description: null, completedAt: null, completedByUserId: null },
        ],
        ...over,
      });
    }

    beforeEach(() => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      prisma.booking.findFirst.mockResolvedValue({ id: 'book-1' });
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
      prisma.orgInvoice.findFirst.mockResolvedValue({ id: 'inv-1' });
      prisma.vendor.findFirst.mockResolvedValue({ id: 'ven-1' });
      prisma.serviceCase.findFirst.mockResolvedValue({
        id: 'sc-1',
        vehicleId: 'veh-1',
        vendorId: 'ven-1',
        status: 'OPEN',
      });
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.station.findFirst.mockResolvedValue({ id: 'station-1' });
      prisma.orgTask.create.mockImplementation(async ({ data }: any) =>
        baseTask({
          id: 'created-1',
          title: data.title,
          description: data.description,
          type: data.type,
          priority: data.priority,
          assignedUserId: data.assignedUserId,
          vehicleId: data.vehicleId,
          bookingId: data.bookingId,
          customerId: data.customerId,
          invoiceId: data.invoiceId,
          vendorId: data.vendorId,
          documentId: data.documentId,
          serviceCaseId: data.serviceCaseId,
          dueDate: data.dueDate,
          activatesAt: data.activatesAt,
          estimatedDurationMinutes: data.estimatedDurationMinutes,
          blocksVehicleAvailability: data.blocksVehicleAvailability,
          metadata: data.metadata,
        }),
      );
      prisma.orgTask.findFirst.mockImplementation(async () => mockCreatedTask());
      prisma.taskComment.create.mockResolvedValue({ id: 'comment-1' });
    });

    it('persists all supported create fields and returns them on read', async () => {
      await svc.createManualTask(
        'org1',
        {
          title: 'Vollständige Aufgabe',
          description: 'Beschreibung',
          type: 'VEHICLE_SERVICE',
          priority: 'HIGH',
          assignedUserId: 'u2',
          vehicleId: 'veh-1',
          bookingId: 'book-1',
          customerId: 'cust-1',
          invoiceId: 'inv-1',
          vendorId: 'ven-1',
          documentId: 'doc-1',
          serviceCaseId: 'sc-1',
          dueDate: '2026-08-01T10:00:00.000Z',
          activatesAt: '2026-07-20T08:00:00.000Z',
          estimatedDurationMinutes: 120,
          blocksVehicleAvailability: true,
          metadata: { stationId: 'station-1' },
          checklist: [{ title: 'Pflicht', isRequired: true }],
        },
        'u1',
      );

      expect(prisma.orgTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Vollständige Aufgabe',
            description: 'Beschreibung',
            type: 'VEHICLE_SERVICE',
            priority: 'HIGH',
            assignedUserId: 'u2',
            vehicleId: 'veh-1',
            bookingId: 'book-1',
            customerId: 'cust-1',
            invoiceId: 'inv-1',
            vendorId: 'ven-1',
            documentId: 'doc-1',
            serviceCaseId: 'sc-1',
            estimatedDurationMinutes: 120,
            blocksVehicleAvailability: true,
            metadata: { stationId: 'station-1' },
            checklistItems: {
              create: [{ title: 'Pflicht', description: undefined, sortOrder: 0, isRequired: true }],
            },
          }),
        }),
      );
    });

    it('stores initialNote as comment with CREATED context in the same transaction', async () => {
      await svc.createManualTask(
        'org1',
        {
          title: 'Mit Notiz',
          type: 'CUSTOM',
          initialNote: 'Bitte vor Ort prüfen',
        },
        'u1',
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.taskComment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'created-1',
          body: 'Bitte vor Ort prüfen',
          userId: 'u1',
        },
      });
      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'COMMENT_ADDED',
            metadata: expect.objectContaining({
              context: 'CREATED',
              commentId: 'comment-1',
            }),
          }),
        }),
      );
    });

    it('rejects due date earlier than activation time', async () => {
      await expect(
        svc.createManualTask('org1', {
          title: 'Timing',
          type: 'CUSTOM',
          activatesAt: '2026-08-10T10:00:00.000Z',
          dueDate: '2026-08-01T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.orgTask.create).not.toHaveBeenCalled();
    });

    it('rejects checklist items without title', async () => {
      await expect(
        svc.createManualTask('org1', {
          title: 'Checklist',
          type: 'CUSTOM',
          checklist: [{ title: '   ' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects linking a completed service case', async () => {
      prisma.serviceCase.findFirst.mockResolvedValue({
        id: 'sc-done',
        vehicleId: 'veh-1',
        vendorId: null,
        status: 'COMPLETED',
      });

      await expect(
        svc.createManualTask('org1', {
          title: 'Service',
          type: 'CUSTOM',
          serviceCaseId: 'sc-done',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects vehicle from another organization', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(
        svc.createManualTask('org1', {
          title: 'Fremd',
          type: 'CUSTOM',
          vehicleId: 'veh-other',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
