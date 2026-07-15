/**
 * Task Domain V2 — Checklists (D)
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  baseTask,
  createTasksServiceHarness,
  mockTaskTransition,
} from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — Checklists (D)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('required vs optional', () => {
    it('blocks complete when required checklist items are open', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'BOOKING_PICKUP' }));
      prisma.taskChecklistItem.findMany.mockResolvedValue([
        { id: 'ci1', title: 'Pflicht', isDone: false, isRequired: true },
        { id: 'ci2', title: 'Optional', isDone: false, isRequired: false },
      ]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });

      await expect(svc.completeTask('org1', 't1', {}, { id: 'u1' })).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TASK_REQUIRED_CHECKLIST_INCOMPLETE',
          remainingRequiredItems: 1,
        }),
      });
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    });

    it('allows complete when only optional items remain open', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      mockTaskTransition(prisma, 'IN_PROGRESS', 'DONE', { type: 'BOOKING_PICKUP' });
      prisma.taskChecklistItem.findMany.mockResolvedValue([
        { id: 'ci1', title: 'Pflicht erledigt', isDone: true, isRequired: true },
        { id: 'ci2', title: 'Optional offen', isDone: false, isRequired: false },
      ]);

      await expect(svc.completeTask('org1', 't1', {}, { id: 'u1' })).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('progress', () => {
    it('updateChecklistItem toggles isDone and records CHECKLIST_ITEM_UPDATED', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }))
        .mockResolvedValue({
          ...baseTask({ status: 'IN_PROGRESS' }),
          checklistItems: [],
          comments: [],
          attachments: [],
          events: [],
        });
      prisma.taskChecklistItem.findFirst.mockResolvedValue({
        id: 'ci1',
        title: 'Schritt',
        isDone: false,
        isRequired: true,
      });
      prisma.taskChecklistItem.update.mockResolvedValue({});

      await svc.updateChecklistItem('org1', 't1', 'ci1', { isDone: true }, 'u1');

      expect(prisma.taskChecklistItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ci1' },
          data: expect.objectContaining({ isDone: true }),
        }),
      );
      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CHECKLIST_ITEM_UPDATED' }),
        }),
      );
    });
  });

  describe('manager override', () => {
    it('complete with overrideIncompleteChecklist bypasses open required items', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      mockTaskTransition(prisma, 'IN_PROGRESS', 'DONE');
      prisma.taskChecklistItem.findMany.mockResolvedValue([
        { id: 'ci1', title: 'Offen', isDone: false, isRequired: true },
      ]);
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'm1',
        role: 'ORG_ADMIN',
        permissions: { tasks: { read: true, write: true, manage: true } },
      });

      await svc.completeTask(
        'org1',
        't1',
        { overrideIncompleteChecklist: true, overrideReason: 'Dringend' },
        { id: 'admin-1' },
      );

      expect(prisma.orgTask.update).toHaveBeenCalled();
      expect(prisma.taskEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CHECKLIST_COMPLETION_OVERRIDDEN' }),
        }),
      );
    });

    it('rejects override without manage permission', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));
      prisma.taskChecklistItem.findMany.mockResolvedValue([
        { id: 'ci1', title: 'Offen', isDone: false, isRequired: true },
      ]);
      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'm1',
        role: 'SUB_ADMIN',
        permissions: { tasks: { read: true, write: true, manage: false } },
      });

      await expect(
        svc.completeTask(
          'org1',
          't1',
          { overrideIncompleteChecklist: true, overrideReason: 'Versuch' },
          { id: 'sub-1' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('read-only after completion', () => {
    it('updateChecklistItem rejects on DONE task', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'DONE', completionMode: 'MANUAL' }));

      await expect(
        svc.updateChecklistItem('org1', 't1', 'ci1', { isDone: false }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.taskChecklistItem.update).not.toHaveBeenCalled();
    });
  });
});
