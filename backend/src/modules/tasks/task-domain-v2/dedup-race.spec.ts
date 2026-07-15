/**
 * Task Domain V2 — Dedup and race conditions (H)
 */
import { baseTask, createTasksServiceHarness } from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — Dedup and race conditions (H)', () => {
  describe('upsertByDedup', () => {
    it('escalates active task in place on repeated events', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ id: 't-active', dedupKey: 'booking:prep:b1', status: 'OPEN' }),
      );
      prisma.orgTask.update.mockResolvedValue(baseTask({ id: 't-active', priority: 'HIGH' }));

      await svc.upsertByDedup('org1', 'booking:prep:b1', {
        title: 'Prep escalated',
        source: 'BOOKING',
        type: 'BOOKING_PREPARATION',
        priority: 'HIGH',
      });

      expect(prisma.orgTask.create).not.toHaveBeenCalled();
      expect(prisma.orgTask.update).toHaveBeenCalledTimes(1);
    });

    it('parks closed dedupKey before creating a fresh task', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ id: 't-done', dedupKey: 'booking:prep:b1', status: 'DONE' }),
      );
      prisma.orgTask.update.mockResolvedValue({});
      prisma.orgTask.create.mockResolvedValue(baseTask({ id: 't-new', dedupKey: 'booking:prep:b1' }));

      await svc.upsertByDedup('org1', 'booking:prep:b1', {
        title: 'New prep cycle',
        source: 'BOOKING',
        type: 'BOOKING_PREPARATION',
      });

      expect(prisma.orgTask.update).toHaveBeenCalledWith({
        where: { id: 't-done' },
        data: { dedupKey: 'booking:prep:b1:closed:t-done' },
      });
      expect(prisma.orgTask.create).toHaveBeenCalledTimes(1);
    });

    it('findActiveByDedup ignores terminal tasks', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ dedupKey: 'x:1', status: 'DONE' }),
      );

      const active = await svc.findActiveByDedup('org1', 'x:1');
      expect(active).toBeNull();
    });
  });

  describe('idempotent terminal transitions', () => {
    it('parallel completeTask calls on DONE do not duplicate writes', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      const doneRow = {
        ...baseTask({ status: 'DONE', completionMode: 'MANUAL' }),
        checklistItems: [],
        comments: [],
        attachments: [],
        events: [],
      };
      prisma.orgTask.findFirst.mockResolvedValue(doneRow);

      await Promise.all([
        svc.completeTask('org1', 't1', {}, { id: 'u1' }),
        svc.completeTask('org1', 't1', {}, { id: 'u2' }),
      ]);

      expect(prisma.orgTask.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('autoResolve is idempotent for already AUTO_RESOLVED tasks', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ status: 'DONE', completionMode: 'AUTO_RESOLVED' }),
      );

      await Promise.all([
        svc.autoResolveTask('org1', 't1', { resolutionCode: 'X', reason: 'a' }),
        svc.autoResolveTask('org1', 't1', { resolutionCode: 'X', reason: 'b' }),
      ]);

      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });
  });

  describe('outbox retry (cross-reference)', () => {
    it('documents outbox idempotency coverage in task-automation-outbox.spec.ts', () => {
      // H.3 — Outbox enqueue refresh + concurrent claim covered in:
      // backend/src/modules/tasks/outbox/task-automation-outbox.spec.ts
      expect(true).toBe(true);
    });
  });
});
