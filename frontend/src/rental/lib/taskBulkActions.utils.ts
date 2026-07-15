import type { ApiTask, ApiTaskType } from '../../lib/api';

export type BulkTaskActionType =
  | 'assign'
  | 'set_priority'
  | 'shift_due_date'
  | 'set_waiting'
  | 'cancel';

export interface BulkTaskActionResult {
  results: Array<{ taskId: string; success: boolean; error?: string }>;
  succeeded: number;
  failed: number;
}

const RESOLUTION_NOTE_REQUIRED_TYPES: ApiTaskType[] = [
  'REPAIR',
  'BRAKE_CHECK',
  'TIRE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
];

export function isActiveApiTask(task: Pick<ApiTask, 'status'>): boolean {
  return task.status === 'OPEN' || task.status === 'IN_PROGRESS' || task.status === 'WAITING';
}

export function canOfferBulkComplete(tasks: ApiTask[]): boolean {
  if (tasks.length === 0) return false;

  const active = tasks.filter(isActiveApiTask);
  if (active.length !== tasks.length) return false;

  const types = new Set(active.map((task) => task.type));
  if (types.size !== 1) return false;

  const hasRequiredChecklist = active.some(
    (task) =>
      task.checklistProgress?.hasChecklist &&
      (task.checklistProgress.requiredItems ?? 0) > 0,
  );
  if (hasRequiredChecklist) return false;

  const hasResolutionNoteRequirement = active.some((task) =>
    RESOLUTION_NOTE_REQUIRED_TYPES.includes(task.type),
  );
  if (hasResolutionNoteRequirement) return false;

  return true;
}

export function formatBulkActionSummary(result: BulkTaskActionResult): string {
  if (result.failed === 0) {
    return result.succeeded === 1
      ? '1 Aufgabe erfolgreich aktualisiert'
      : `${result.succeeded} Aufgaben erfolgreich aktualisiert`;
  }
  if (result.succeeded === 0) {
    return result.failed === 1
      ? '1 Aufgabe konnte nicht aktualisiert werden'
      : `${result.failed} Aufgaben konnten nicht aktualisiert werden`;
  }
  return `${result.succeeded} erfolgreich, ${result.failed} fehlgeschlagen`;
}

export function bulkActionFailureMessages(result: BulkTaskActionResult): string[] {
  return result.results
    .filter((row) => !row.success)
    .map((row) => row.error ? `${row.taskId}: ${row.error}` : row.taskId);
}
