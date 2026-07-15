/**
 * Task Domain V2 — Resolution-required task types (C extension)
 */
import { BadRequestException } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { RESOLUTION_REQUIRED_TYPES } from '../task-resolution.constants';
import { baseTask, createTasksServiceHarness } from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — Resolution-required types', () => {
  it.each(RESOLUTION_REQUIRED_TYPES)(
    'completeTask on %s requires resolutionNote',
    async (type: TaskType) => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type }));
      prisma.taskChecklistItem.findMany.mockResolvedValue([]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });

      await expect(svc.completeTask('org1', 't1', {}, { id: 'u1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.orgTask.update).not.toHaveBeenCalled();
    },
  );

  it.each(RESOLUTION_REQUIRED_TYPES)(
    'completeTask on %s succeeds with resolutionNote',
    async (type: TaskType) => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type }))
        .mockResolvedValue({
          ...baseTask({ status: 'DONE', type, resolutionNote: 'OK' }),
          checklistItems: [],
          comments: [],
          attachments: [],
          events: [],
        });
      prisma.taskChecklistItem.findMany.mockResolvedValue([]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE', type }));

      await svc.completeTask('org1', 't1', { resolutionNote: 'OK' }, { id: 'u1' });
      expect(prisma.orgTask.update).toHaveBeenCalled();
    },
  );
});
