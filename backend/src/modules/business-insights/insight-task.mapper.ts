import { InsightSeverity, TaskPriority } from '@prisma/client';
export { normalizeTaskPriority, normalizeTaskPriorityInput } from '@modules/tasks/task-priority.util';

/** Map dashboard insight severity → canonical TaskPriority. */
export function mapInsightSeverityToTaskPriority(severity: InsightSeverity): TaskPriority {
  switch (severity) {
    case InsightSeverity.CRITICAL:
      return 'CRITICAL';
    case InsightSeverity.WARNING:
      return 'HIGH';
    case InsightSeverity.INFO:
    case InsightSeverity.OPPORTUNITY:
    default:
      return 'NORMAL';
  }
}
