/**
 * Top-level fields on `GET /tasks/:id` that remain for backward compatibility but
 * are superseded by normalized sections in `TaskDetailNormalizedSections`.
 *
 * Do not remove these fields until all clients consume the structured sections.
 * New clients should prefer: summary, reason, nextAction, timing, completion,
 * assignment, checklistProgress, linkedObjects, timeline, technicalMetadata.
 */
export const TASK_DETAIL_DEPRECATED_TOP_LEVEL_FIELDS = [
  'id',
  'title',
  'description',
  'type',
  'status',
  'priority',
  'sourceType',
  'source',
  'dedupKey',
  'completionMode',
  'resolutionCode',
  'resolutionNote',
  'completedByUserId',
  'supersededByTaskId',
  'assignedUserId',
  'createdByUserId',
  'isOverdue',
  'dueDate',
  'startedAt',
  'completedAt',
  'cancelledAt',
  'activatesAt',
  'createdAt',
  'checklistProgress',
  'metadata',
  'timeline',
] as const;

export type TaskDetailDeprecatedTopLevelField =
  (typeof TASK_DETAIL_DEPRECATED_TOP_LEVEL_FIELDS)[number];
