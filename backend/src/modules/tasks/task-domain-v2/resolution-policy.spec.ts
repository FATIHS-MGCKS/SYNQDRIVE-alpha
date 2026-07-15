/**
 * Task Domain V2 — Resolution-required task types (C extension)
 */
import { BadRequestException } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { RESOLUTION_REQUIRED_TYPES } from '../task-resolution.constants';
import { baseTask, createTasksServiceHarness } from '../__fixtures__/tasks-service.fixtures';

const SAMPLE_RESOLUTION_CODE: Partial<Record<TaskType, string>> = {
  REPAIR: 'REPAIR_COMPLETED',
  BRAKE_CHECK: 'BRAKE_MEASURED_OK',
  TIRE_CHECK: 'TIRE_MEASURED_OK',
  BATTERY_CHECK: 'BATTERY_MEASURED_OK',
  VEHICLE_SERVICE: 'SERVICE_SCHEDULED',
  VEHICLE_INSPECTION: 'TUV_PASSED',
};

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
    'completeTask on %s succeeds with resolutionNote and resolutionCode when required',
    async (type: TaskType) => {
      const { svc, prisma } = createTasksServiceHarness();
      const resolutionCode = SAMPLE_RESOLUTION_CODE[type] ?? 'OTHER';
      prisma.orgTask.findFirst
        .mockResolvedValueOnce(baseTask({ status: 'IN_PROGRESS', type }))
        .mockResolvedValue({
          ...baseTask({ status: 'DONE', type, resolutionNote: 'OK', resolutionCode }),
          checklistItems: [],
          comments: [],
          attachments: [],
          events: [],
        });
      prisma.taskChecklistItem.findMany.mockResolvedValue([]);
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.orgTask.update.mockResolvedValue(baseTask({ status: 'DONE', type }));

      await svc.completeTask(
        'org1',
        't1',
        { resolutionNote: 'OK', resolutionCode },
        { id: 'u1' },
      );
      expect(prisma.orgTask.update).toHaveBeenCalled();
    },
  );

  it('completeTask on REPAIR rejects invalid resolutionCode', async () => {
    const { svc, prisma } = createTasksServiceHarness();
    prisma.orgTask.findFirst.mockResolvedValue(baseTask({ status: 'IN_PROGRESS', type: 'REPAIR' }));
    prisma.taskChecklistItem.findMany.mockResolvedValue([]);
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });

    await expect(
      svc.completeTask(
        'org1',
        't1',
        { resolutionNote: 'OK', resolutionCode: 'NOT_A_CODE' },
        { id: 'u1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgTask.update).not.toHaveBeenCalled();
  });
});
