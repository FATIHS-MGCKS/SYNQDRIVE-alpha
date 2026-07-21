import type { BulkTaskActionType } from './dto/task.dto';
import type { TaskPermissionAction } from './task-permission.constants';

export const TASK_BULK_ACTION_PERMISSIONS: Readonly<
  Record<BulkTaskActionType, TaskPermissionAction>
> = {
  assign: 'tasks.assign',
  cancel: 'tasks.cancel',
  set_priority: 'tasks.update',
  shift_due_date: 'tasks.update',
  set_waiting: 'tasks.update',
};
