import { InsightSeverity, TaskPriority } from '@prisma/client';

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

/** Normalize legacy priority strings from workflows / external callers. */
export function normalizeTaskPriorityInput(raw?: string | null): TaskPriority | undefined {
  if (!raw) return undefined;
  const v = raw.toUpperCase();
  if (v === 'URGENT') return 'CRITICAL';
  if (v === 'MEDIUM') return 'NORMAL';
  if (v === 'LOW' || v === 'NORMAL' || v === 'HIGH' || v === 'CRITICAL') return v as TaskPriority;
  return undefined;
}
