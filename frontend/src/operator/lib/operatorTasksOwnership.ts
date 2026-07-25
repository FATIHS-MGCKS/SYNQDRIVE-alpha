import { DEFAULT_OPERATOR_TASK_FILTERS, type OperatorTaskViewFilters } from '../../operator/tasks/operatorTask.utils';
import type { TaskListFilters } from './types';

/** True when the Tasks tab can reuse OperatorDataContext ALL_OPEN snapshot. */
export function canReuseOperatorAllOpenTasks(
  filters: OperatorTaskViewFilters,
  apiFilters: TaskListFilters | undefined,
): boolean {
  return (
    filters.scope === DEFAULT_OPERATOR_TASK_FILTERS.scope &&
    !filters.today &&
    !filters.overdue &&
    !filters.vehicleId &&
    !filters.bookingId &&
    filters.priority === DEFAULT_OPERATOR_TASK_FILTERS.priority &&
    !apiFilters
  );
}
