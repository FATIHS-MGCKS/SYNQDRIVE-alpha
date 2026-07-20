import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { TasksController } from './tasks.controller';

describe('TasksController', () => {
  const orgId = 'org1';
  const taskId = 't1';
  const user = { id: 'user-1', platformRole: undefined };

  const tasksService = {
    listTasks: jest.fn(),
    getDashboardSummary: jest.fn(),
    getTaskById: jest.fn(),
    createManualTask: jest.fn(),
    updateTask: jest.fn(),
    assignTask: jest.fn(),
    startTask: jest.fn(),
    moveTaskToWaiting: jest.fn(),
    completeTask: jest.fn(),
    cancelTask: jest.fn(),
    bulkTaskActions: jest.fn(),
    addComment: jest.fn(),
    addChecklistItem: jest.fn(),
    updateChecklistItem: jest.fn(),
    addAttachment: jest.fn(),
    getTasksForVehicle: jest.fn(),
    getTasksForBooking: jest.fn(),
    getTasksForVendor: jest.fn(),
    getTasksForCustomer: jest.fn(),
  };

  const controller = new TasksController(tasksService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies OrgScopingGuard, RolesGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TasksController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });

  it('delegates list to TasksService.listTasks with bucket filters', async () => {
    tasksService.listTasks.mockResolvedValue([]);
    await controller.findAll(orgId, { bucket: 'NOW', status: 'OPEN' } as any);
    expect(tasksService.listTasks).toHaveBeenCalledWith(orgId, expect.objectContaining({ bucket: 'NOW', status: 'OPEN' }));
  });

  it('delegates getTaskById with actor context', async () => {
    tasksService.getTaskById.mockResolvedValue({ id: taskId });
    const req = { user } as any;
    await controller.findOne(orgId, taskId, req);
    expect(tasksService.getTaskById).toHaveBeenCalledWith(taskId, orgId, { id: user.id, platformRole: undefined });
  });

  it('delegates complete with override flags', async () => {
    tasksService.completeTask.mockResolvedValue({ id: taskId, status: 'DONE' });
    const req = { user } as any;
    await controller.complete(orgId, taskId, req, {
      overrideIncompleteChecklist: true,
      overrideReason: 'Dringend',
    } as any);
    expect(tasksService.completeTask).toHaveBeenCalledWith(
      orgId,
      taskId,
      expect.objectContaining({
        overrideIncompleteChecklist: true,
        overrideReason: 'Dringend',
      }),
      { id: user.id, platformRole: undefined },
    );
  });

  it('delegates bulk actions', async () => {
    tasksService.bulkTaskActions.mockResolvedValue({ succeeded: 1, failed: 0, results: [] });
    const req = { user } as any;
    await controller.bulkActions(orgId, req, { taskIds: ['t1'], action: 'cancel' } as any);
    expect(tasksService.bulkTaskActions).toHaveBeenCalledWith(
      orgId,
      { taskIds: ['t1'], action: 'cancel' },
      user.id,
    );
  });
});
