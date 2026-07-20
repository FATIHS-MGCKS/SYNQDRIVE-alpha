import type { ApiTask, ApiTaskStatus } from '../../../../lib/api';
import { createRuntimeReason } from './dashboardRuntimeReasons';
import type { RuntimeReason } from './dashboardRuntimeTypes';

export const TASK_RUNTIME_REASON_CODE = 'TASK_BLOCKS_VEHICLE_AVAILABILITY';

export const ACTIVE_TASK_STATUSES: readonly ApiTaskStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
] as const;

const ACTIVE_TASK_STATUS_SET = new Set<ApiTaskStatus>(ACTIVE_TASK_STATUSES);

export function isActiveTaskStatus(status: ApiTaskStatus): boolean {
  return ACTIVE_TASK_STATUS_SET.has(status);
}

export function isBlockingTask(task: ApiTask): boolean {
  return task.blocksVehicleAvailability === true && isActiveTaskStatus(task.status);
}

export function blockingTasksForVehicle(
  tasks: ApiTask[] | undefined,
  vehicleId: string,
): ApiTask[] {
  if (!tasks?.length) return [];
  return tasks.filter((task) => task.vehicleId === vehicleId && isBlockingTask(task));
}

export interface CreateTaskRuntimeReasonOptions {
  parentReasonId?: string;
  blocking?: boolean;
  parentServiceCaseId?: string;
}

export function createTaskRuntimeReason(
  task: ApiTask,
  options: CreateTaskRuntimeReasonOptions = {},
): RuntimeReason {
  const blocking = options.blocking ?? true;
  return createRuntimeReason({
    category: 'operational',
    severity: blocking ? 'critical' : 'warning',
    title: task.title,
    description: task.description?.trim() || undefined,
    source: 'TASK',
    blocking,
    preventsReady: blocking,
    reasonCode: TASK_RUNTIME_REASON_CODE,
    taskId: task.id,
    serviceCaseId: task.serviceCaseId ?? options.parentServiceCaseId,
    parentReasonId: options.parentReasonId,
    status: task.status,
    scheduledAt: task.dueDate,
    expectedReadyAt: task.dueDate,
  });
}
