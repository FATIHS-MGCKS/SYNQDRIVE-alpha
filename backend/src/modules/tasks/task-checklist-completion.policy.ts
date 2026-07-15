import { BadRequestException } from '@nestjs/common';
import { calculateChecklistProgress } from './checklist-progress.util';

export const TASK_REQUIRED_CHECKLIST_INCOMPLETE = 'TASK_REQUIRED_CHECKLIST_INCOMPLETE';

export interface ChecklistItemForCompletionValidation {
  id: string;
  title: string;
  isDone: boolean;
  isRequired: boolean;
}

export interface OpenRequiredChecklistItem {
  id: string;
  title: string;
}

export interface TaskRequiredChecklistIncompleteDetails {
  statusCode: 400;
  code: typeof TASK_REQUIRED_CHECKLIST_INCOMPLETE;
  message: string;
  remainingRequiredItems: number;
  openRequiredItems: OpenRequiredChecklistItem[];
}

export function buildRequiredChecklistIncompleteMessage(remainingRequiredItems: number): string {
  if (remainingRequiredItems === 1) {
    return 'Die Aufgabe kann noch nicht abgeschlossen werden. 1 erforderlicher Schritt ist offen.';
  }
  return `Die Aufgabe kann noch nicht abgeschlossen werden. ${remainingRequiredItems} erforderliche Schritte sind offen.`;
}

export function buildRequiredChecklistIncompleteResponse(
  openRequiredItems: OpenRequiredChecklistItem[],
): TaskRequiredChecklistIncompleteDetails {
  const remainingRequiredItems = openRequiredItems.length;
  return {
    statusCode: 400,
    code: TASK_REQUIRED_CHECKLIST_INCOMPLETE,
    message: buildRequiredChecklistIncompleteMessage(remainingRequiredItems),
    remainingRequiredItems,
    openRequiredItems,
  };
}

export function getOpenRequiredChecklistItems(
  items: ChecklistItemForCompletionValidation[],
): OpenRequiredChecklistItem[] {
  return items
    .filter((item) => item.isRequired && !item.isDone)
    .map((item) => ({ id: item.id, title: item.title }));
}

/**
 * Validates manual (MANUAL completionMode) task completion against required checklist items.
 * Throws {@link BadRequestException} with structured payload when open required items remain.
 */
export function assertManualCompletionAllowedByChecklist(items: ChecklistItemForCompletionValidation[]): void {
  const progress = calculateChecklistProgress(
    items.map((item) => ({ isDone: item.isDone, isRequired: item.isRequired })),
    { isTerminal: false },
  );
  if (progress.remainingRequiredItems === 0) return;

  const openRequiredItems = getOpenRequiredChecklistItems(items);
  throw new BadRequestException(buildRequiredChecklistIncompleteResponse(openRequiredItems));
}
