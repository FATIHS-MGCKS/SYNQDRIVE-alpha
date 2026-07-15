/**
 * Task Domain V2 — B. Audit (status + event atomicity, actor, metadata).
 */
import { baseTask, createTasksServiceHarness, mockTaskTransition } from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — B. Audit', () => {
  it('persists status update and STATUS_CHANGED in a single transaction', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    mockTaskTransition(prisma, 'OPEN', 'IN_PROGRESS');

    await svc.startTask('org1', 't1', 'actor-42');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.orgTask.update).toHaveBeenCalledTimes(1);
    expect(prisma.taskEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rolls back when STATUS_CHANGED event creation fails', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'OPEN' }));
    prisma.taskEvent.create.mockRejectedValueOnce(new Error('event write failed'));

    await expect(svc.startTask('org1', 't1', 'actor-1')).rejects.toThrow('event write failed');
  });

  it('records actor user id on STATUS_CHANGED events', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    mockTaskTransition(prisma, 'OPEN', 'IN_PROGRESS');

    await svc.startTask('org1', 't1', 'actor-99');

    expect(prisma.taskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'actor-99',
          type: 'STATUS_CHANGED',
        }),
      }),
    );
  });

  it('records resolution metadata on manual completion', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    mockTaskTransition(prisma, 'OPEN', 'DONE', { type: 'CUSTOM' });

    await svc.completeTask(
      'org1',
      't1',
      { resolutionCode: 'OK', resolutionNote: 'Erledigt' },
      { id: 'actor-7' },
    );

    expect(prisma.orgTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completionMode: 'MANUAL',
          resolutionCode: 'OK',
          resolutionNote: 'Erledigt',
          completedByUserId: 'actor-7',
        }),
      }),
    );
  });

  it('records AUTO_RESOLVED metadata with resolutionKind in event payload', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ status: 'OPEN', type: 'INVOICE_REQUIRED' }))
      .mockResolvedValue(
        baseTask({
          status: 'DONE',
          completionMode: 'AUTO_RESOLVED',
          resolutionCode: 'PAYMENT_RECEIVED',
        }),
      );

    await svc.autoResolveTask('org1', 't1', {
      resolutionCode: 'PAYMENT_RECEIVED',
      reason: 'Zahlung verbucht',
    });

    expect(prisma.taskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'AUTO_RESOLVED',
          metadata: expect.objectContaining({
            resolutionKind: 'AUTO_RESOLVED',
            resolutionCode: 'PAYMENT_RECEIVED',
          }),
        }),
      }),
    );
  });

  it('records SUPERSEDED metadata with successor reference', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    prisma.orgTask.findFirst
      .mockResolvedValueOnce(baseTask({ id: 't-old', status: 'OPEN' }))
      .mockResolvedValueOnce(baseTask({ id: 't-new', organizationId: 'org1' }))
      .mockResolvedValue(
        baseTask({ id: 't-old', status: 'DONE', completionMode: 'SUPERSEDED', supersededByTaskId: 't-new' }),
      );

    await svc.supersedeTask('org1', 't-old', {
      resolutionCode: 'BOOKING_LIFECYCLE_SUPERSEDE',
      reason: 'BOOKING_LIFECYCLE_SUPERSEDE',
      supersededByTaskId: 't-new',
    });

    expect(prisma.taskEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SUPERSEDED',
          metadata: expect.objectContaining({
            resolutionKind: 'SUPERSEDED',
            supersededByTaskId: 't-new',
          }),
        }),
      }),
    );
  });
});
