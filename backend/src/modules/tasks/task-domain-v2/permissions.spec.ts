/**
 * Task Domain V2 — Permissions (I)
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { baseTask, createTasksServiceHarness } from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — Permissions (I)', () => {
  const openRequired = [{ id: 'ci1', title: 'Pflicht', isDone: false, isRequired: true }];

  describe('checklist manager override', () => {
    it('allows ORG_ADMIN override', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }))
        .mockResolvedValue({
          ...baseTask({ status: 'DONE' }),
          checklistItems: [],
          comments: [],
          attachments: [],
          events: [],
        });
      prisma.taskChecklistItem.findMany.mockResolvedValue(openRequired);
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'ORG_ADMIN',
        permissions: { tasks: { read: true, write: true, manage: false } },
      });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask(
        'org1',
        't1',
        { overrideIncompleteChecklist: true, overrideReason: 'Admin override' },
        { id: 'admin-1' },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('allows SUB_ADMIN with tasks.manage permission', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS' }))
        .mockResolvedValue({
          ...baseTask({ status: 'DONE' }),
          checklistItems: [],
          comments: [],
          attachments: [],
          events: [],
        });
      prisma.taskChecklistItem.findMany.mockResolvedValue(openRequired);
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: 'SUB_ADMIN',
        permissions: { tasks: { read: true, write: true, manage: true } },
      });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE' }));

      await svc.completeTask(
        'org1',
        't1',
        { overrideIncompleteChecklist: true, overrideReason: 'Sub-admin override' },
        { id: 'sub-1' },
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects SUB_ADMIN without tasks.manage', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));
      prisma.taskChecklistItem.findMany.mockResolvedValue(openRequired);
      prisma.organizationMembership.findFirst.mockResolvedValue({
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
    });

    it('rejects WORKER override attempts', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS' }));
      prisma.taskChecklistItem.findMany.mockResolvedValue(openRequired);
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
        response: { code: 'TASK_CHECKLIST_OVERRIDE_FORBIDDEN' },
      });
    });
  });

  describe('tenant scoping', () => {
    it('rejects assign to user outside organization', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask());
      prisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(svc.assignTask('org1', 't1', 'foreign-user', 'actor')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not load tasks from foreign organization', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(null);

      await expect(svc.getTaskById('t1', 'org-foreign')).rejects.toThrow('Task not found');
    });
  });
});
