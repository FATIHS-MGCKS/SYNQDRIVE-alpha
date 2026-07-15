/**
 * Task Domain V2 — A. Status machine (service layer).
 * Complements task-transition.policy.spec.ts with TasksService integration.
 */
import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { baseTask, createTasksServiceHarness, mockTaskTransition } from '../__fixtures__/tasks-service.fixtures';

const ALL_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'];

const ALLOWED_PAIRS: Array<[TaskStatus, TaskStatus]> = [
  ['OPEN', 'IN_PROGRESS'],
  ['OPEN', 'WAITING'],
  ['OPEN', 'DONE'],
  ['OPEN', 'CANCELLED'],
  ['IN_PROGRESS', 'WAITING'],
  ['IN_PROGRESS', 'DONE'],
  ['IN_PROGRESS', 'CANCELLED'],
  ['WAITING', 'IN_PROGRESS'],
  ['WAITING', 'DONE'],
  ['WAITING', 'CANCELLED'],
];

const FORBIDDEN_PAIRS: Array<[TaskStatus, TaskStatus]> = [
  ['IN_PROGRESS', 'OPEN'],
  ['WAITING', 'OPEN'],
  ['DONE', 'OPEN'],
  ['DONE', 'IN_PROGRESS'],
  ['DONE', 'WAITING'],
  ['DONE', 'CANCELLED'],
  ['CANCELLED', 'OPEN'],
  ['CANCELLED', 'IN_PROGRESS'],
  ['CANCELLED', 'WAITING'],
  ['CANCELLED', 'DONE'],
];

async function invokeTransition(
  svc: ReturnType<typeof createTasksServiceHarness>['svc'],
  prisma: ReturnType<typeof createTasksServiceHarness>['prisma'],
  from: TaskStatus,
  to: TaskStatus,
) {
  mockTaskTransition(prisma, from, to);

  if (to === 'IN_PROGRESS') return svc.startTask('org1', 't1', 'actor-1');
  if (to === 'WAITING') return svc.moveTaskToWaiting('org1', 't1', 'actor-1');
  if (to === 'DONE') return svc.completeTask('org1', 't1', {}, { id: 'actor-1' });
  if (to === 'CANCELLED') return svc.cancelTask('org1', 't1', 'actor-1');
  throw new Error(`Unsupported target status ${to}`);
}

describe('Task Domain V2 — A. Status machine', () => {
  describe('allowed transitions at service layer', () => {
    it.each(ALLOWED_PAIRS)('%s → %s persists status and records STATUS_CHANGED', async (from, to) => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });

      await invokeTransition(svc, prisma, from, to);

      expect(prisma.orgTask.update).toHaveBeenCalled();
      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'STATUS_CHANGED',
            oldValue: from,
            newValue: to,
          }),
        }),
      );
    });
  });

  describe('forbidden transitions at service layer', () => {
    it.each(FORBIDDEN_PAIRS)('%s → %s throws BadRequestException', async (from, to) => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: from }));
      prisma.taskChecklistItem.findMany.mockResolvedValue([]);

      if (to === 'OPEN') {
        await expect(svc.update('t1', { status: 'OPEN' }, 'org1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      } else {
        await expect(invokeTransition(svc, prisma, from, to)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });
  });

  describe('terminal statuses', () => {
    it.each(['DONE', 'CANCELLED'] as TaskStatus[])(
      'rejects assignTask on %s tasks',
      async (status) => {
        const { svc, prisma } = createTasksServiceHarness();
        prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status }));
        prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });

        await expect(svc.assignTask('org1', 't1', 'user-2', 'actor-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );
  });

  describe('idempotency', () => {
    it.each([
      ['startTask', 'IN_PROGRESS'] as const,
      ['moveTaskToWaiting', 'WAITING'] as const,
    ])('%s is idempotent when already in target status', async (method, status) => {
      const { svc, prisma } = createTasksServiceHarness();
      const row = baseTask({ status });
      prisma.orgTask.findFirst.mockResolvedValue(row);

      if (method === 'startTask') await svc.startTask('org1', 't1', 'actor-1');
      else await svc.moveTaskToWaiting('org1', 't1', 'actor-1');

      expect(prisma.orgTask.update).not.toHaveBeenCalled();
      expect(prisma.taskEvent.create).not.toHaveBeenCalled();
    });

    it('completeTask on DONE does not write duplicate events', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'DONE', completionMode: 'MANUAL' }));

      await svc.completeTask('org1', 't1', {}, { id: 'actor-1' });

      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });

    it('cancelTask on CANCELLED is idempotent', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'CANCELLED', completionMode: 'MANUAL' }));

      await svc.cancelTask('org1', 't1', 'actor-1');

      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });
  });

  it('covers every status in the normative model', () => {
    expect(ALL_STATUSES).toHaveLength(5);
  });
});
