import {
  DEFAULT_OPERATOR_TASK_FILTERS,
  type OperatorTaskViewFilters,
} from '../tasks/operatorTask.utils';

export function hasActiveOperatorTaskFilters(filters: OperatorTaskViewFilters): boolean {
  return (
    filters.today ||
    filters.overdue ||
    Boolean(filters.vehicleId) ||
    Boolean(filters.bookingId) ||
    filters.priority !== 'all' ||
    filters.scope === 'mine'
  );
}

export function operatorTasksEmptyDescription(
  filters: OperatorTaskViewFilters,
  userId: string | null,
): string {
  if (hasActiveOperatorTaskFilters(filters)) {
    return 'Keine Aufgaben passen zu den aktiven Filtern.';
  }
  if (filters.scope === 'mine' && userId) {
    return 'Dir sind keine offenen Aufgaben zugewiesen.';
  }
  return 'Alle Aufgaben erledigt.';
}

export function resetOperatorTaskFilters(
  userId: string | null,
): OperatorTaskViewFilters {
  return {
    ...DEFAULT_OPERATOR_TASK_FILTERS,
    scope: userId ? DEFAULT_OPERATOR_TASK_FILTERS.scope : 'all',
  };
}
