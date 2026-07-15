/**
 * Canonical checklist progress for Task Domain V2 (§E.2–E.3).
 *
 * Single source of truth for Rental + Operator — frontends must not re-derive
 * completion eligibility from raw checklist rows.
 */

export const CHECKLIST_COMPLETION_BLOCKER = {
  REQUIRED_ITEMS_OPEN: 'REQUIRED_CHECKLIST_ITEMS_OPEN',
} as const;

export type ChecklistCompletionBlocker =
  (typeof CHECKLIST_COMPLETION_BLOCKER)[keyof typeof CHECKLIST_COMPLETION_BLOCKER];

export interface ChecklistProgressInputItem {
  isDone: boolean;
  isRequired: boolean;
}

export interface ChecklistProgressCounts {
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  completedRequiredItems: number;
}

export interface ChecklistProgress extends ChecklistProgressCounts {
  remainingRequiredItems: number;
  /** Required-item ratio (0–100). `null` when there are no required items or no checklist. */
  progressPercent: number | null;
  hasChecklist: boolean;
  areRequiredItemsComplete: boolean;
  canCompleteByChecklist: boolean;
  completionBlockers: ChecklistCompletionBlocker[];
}

export interface CalculateChecklistProgressOptions {
  /**
   * DONE/CANCELLED tasks: progress numbers stay truthful, but blockers are
   * suppressed so legacy rows with open checklist items still serialize cleanly.
   */
  isTerminal?: boolean;
}

export function calculateChecklistProgress(
  items: ChecklistProgressInputItem[],
  options: CalculateChecklistProgressOptions = {},
): ChecklistProgress {
  return buildChecklistProgress(summarizeChecklistItems(items), options);
}

export function calculateChecklistProgressFromCounts(
  counts: ChecklistProgressCounts,
  options: CalculateChecklistProgressOptions = {},
): ChecklistProgress {
  return buildChecklistProgress(counts, options);
}

function summarizeChecklistItems(items: ChecklistProgressInputItem[]): ChecklistProgressCounts {
  let completedItems = 0;
  let requiredItems = 0;
  let completedRequiredItems = 0;

  for (const item of items) {
    if (item.isDone) completedItems += 1;
    if (item.isRequired) {
      requiredItems += 1;
      if (item.isDone) completedRequiredItems += 1;
    }
  }

  return {
    totalItems: items.length,
    completedItems,
    requiredItems,
    completedRequiredItems,
  };
}

function buildChecklistProgress(
  counts: ChecklistProgressCounts,
  options: CalculateChecklistProgressOptions,
): ChecklistProgress {
  const { totalItems, completedItems, requiredItems, completedRequiredItems } = counts;
  const hasChecklist = totalItems > 0;
  const remainingRequiredItems = Math.max(requiredItems - completedRequiredItems, 0);
  const areRequiredItemsComplete = remainingRequiredItems === 0;
  const isTerminal = options.isTerminal === true;

  const progressPercent =
    requiredItems > 0 ? Math.round((completedRequiredItems / requiredItems) * 100) : null;

  const completionBlockers: ChecklistCompletionBlocker[] =
    !isTerminal && hasChecklist && remainingRequiredItems > 0
      ? [CHECKLIST_COMPLETION_BLOCKER.REQUIRED_ITEMS_OPEN]
      : [];

  const canCompleteByChecklist = isTerminal || areRequiredItemsComplete;

  return {
    totalItems,
    completedItems,
    requiredItems,
    completedRequiredItems,
    remainingRequiredItems,
    progressPercent,
    hasChecklist,
    areRequiredItemsComplete,
    canCompleteByChecklist,
    completionBlockers,
  };
}

/** Groups minimal checklist rows for list endpoints (one batched query, no N+1). */
export function aggregateChecklistProgressByTaskId(
  items: Array<{ taskId: string; isDone: boolean; isRequired: boolean }>,
): Map<string, ChecklistProgressCounts> {
  const map = new Map<string, ChecklistProgressCounts>();

  for (const item of items) {
    const current = map.get(item.taskId) ?? {
      totalItems: 0,
      completedItems: 0,
      requiredItems: 0,
      completedRequiredItems: 0,
    };

    current.totalItems += 1;
    if (item.isDone) current.completedItems += 1;
    if (item.isRequired) {
      current.requiredItems += 1;
      if (item.isDone) current.completedRequiredItems += 1;
    }

    map.set(item.taskId, current);
  }

  return map;
}
