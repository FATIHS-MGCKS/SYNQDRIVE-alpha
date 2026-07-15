/**
 * Task Domain V2 — Completion modes (C)
 */
import { BadRequestException } from '@nestjs/common';
import { TaskCompletionMode, TaskStatus } from '@prisma/client';
import {
  baseTask,
  createTasksServiceHarness,
  mockTaskTransition,
} from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — Completion modes (C)', () => {
  describe('MANUAL', () => {
    it('completeTask sets completionMode MANUAL and completedAt', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      mockTaskTransition(prisma, TaskStatus.IN_PROGRESS, TaskStatus.DONE);

      await svc.completeTask('org1', 't1', { resolutionNote: 'done' }, { id: 'u1' });

      expect(prisma.orgTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completionMode: TaskCompletionMode.MANUAL,
            completedAt: expect.any(Date),
            completedByUserId: 'u1',
          }),
        }),
      );
    });
  });

  describe('AUTO_RESOLVED', () => {
    it('autoResolveTask sets AUTO_RESOLVED and emits AUTO_RESOLVED event', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: TaskStatus.OPEN, type: 'INVOICE_REQUIRED' }))
        .mockResolvedValue(
          baseTask({
            status: TaskStatus.DONE,
            completionMode: TaskCompletionMode.AUTO_RESOLVED,
            resolutionCode: 'PAYMENT_RECEIVED',
          }),
        );

      await svc.autoResolveTask('org1', 't1', {
        resolutionCode: 'PAYMENT_RECEIVED',
        reason: 'Zahlung verbucht',
      });

      expect(prisma.orgTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completionMode: TaskCompletionMode.AUTO_RESOLVED,
            completedByUserId: null,
          }),
        }),
      );
      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'AUTO_RESOLVED',
            metadata: expect.objectContaining({
              resolutionKind: TaskCompletionMode.AUTO_RESOLVED,
              resolutionCode: 'PAYMENT_RECEIVED',
            }),
          }),
        }),
      );
    });

    it('is idempotent when already AUTO_RESOLVED', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({
          status: TaskStatus.DONE,
          completionMode: TaskCompletionMode.AUTO_RESOLVED,
        }),
      );

      await svc.autoResolveTask('org1', 't1', {
        resolutionCode: 'PAYMENT_RECEIVED',
        reason: 'repeat',
      });

      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });

    it('rejects autoResolve on terminal MANUAL task', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({ status: TaskStatus.DONE, completionMode: TaskCompletionMode.MANUAL }),
      );

      await expect(
        svc.autoResolveTask('org1', 't1', { resolutionCode: 'X', reason: 'late' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('SUPERSEDED', () => {
    it('supersedeTask sets SUPERSEDED and emits SUPERSEDED event', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ id: 't-old', status: TaskStatus.OPEN }))
        .mockResolvedValueOnce(baseTask({ id: 't-new', organizationId: 'org1' }))
        .mockResolvedValue(
          baseTask({
            id: 't-old',
            status: TaskStatus.DONE,
            completionMode: TaskCompletionMode.SUPERSEDED,
            supersededByTaskId: 't-new',
          }),
        );

      await svc.supersedeTask('org1', 't-old', {
        resolutionCode: 'BOOKING_PHASE',
        reason: 'replaced',
        supersededByTaskId: 't-new',
      });

      expect(prisma.orgTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completionMode: TaskCompletionMode.SUPERSEDED,
            status: TaskStatus.DONE,
            supersededByTaskId: 't-new',
          }),
        }),
      );
      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'SUPERSEDED',
            metadata: expect.objectContaining({
              resolutionKind: TaskCompletionMode.SUPERSEDED,
              supersededByTaskId: 't-new',
            }),
          }),
        }),
      );
    });
  });

  describe('no reclassification', () => {
    it('completeTask on DONE is idempotent without changing completionMode', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(
        baseTask({
          status: TaskStatus.DONE,
          completionMode: TaskCompletionMode.AUTO_RESOLVED,
          completedAt: new Date('2026-01-01'),
          checklistItems: [],
          comments: [],
          attachments: [],
          events: [],
        }),
      );

      const result = await svc.completeTask('org1', 't1', {}, { id: 'u1' });
      expect(result.status).toBe(TaskStatus.DONE);
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });
  });
});
