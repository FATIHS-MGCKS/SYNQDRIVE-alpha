/** Bounded trigger classes for Prometheus labels — never raw trigger strings. */
export type InsightsTriggerClass =
  | 'scheduled'
  | 'scheduled_boot'
  | 'debounced'
  | 'manual'
  | 'other';

export function classifyInsightsTrigger(trigger: string): InsightsTriggerClass {
  const normalized = trigger.toLowerCase();
  if (normalized.startsWith('scheduled_boot')) return 'scheduled_boot';
  if (normalized.startsWith('scheduled')) return 'scheduled';
  if (normalized.includes('debounced')) return 'debounced';
  if (normalized.includes('manual') || normalized.includes('admin')) return 'manual';
  return 'other';
}
