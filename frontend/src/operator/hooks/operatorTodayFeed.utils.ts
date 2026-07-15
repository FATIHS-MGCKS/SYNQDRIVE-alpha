import type { ApiTask, ApiTaskSummary } from '../../lib/api';
import type { TaskBucket } from '../../lib/tasks/types';
import { buildOperatorTodayTaskEntries } from '../tasks/operatorTodayTasks';
import type { OperatorTodayTaskEntry } from '../tasks/operatorTodayTasks';

/** Buckets loaded for the Operator Today task feed (excludes ALL_OPEN — that stays on Tasks tab). */
export const OPERATOR_TODAY_FEED_BUCKETS = [
  'NOW',
  'TODAY',
  'UPCOMING',
  'PLANNED',
  'UNASSIGNED',
] as const satisfies readonly TaskBucket[];

export type OperatorTodayFeedBucket = (typeof OPERATOR_TODAY_FEED_BUCKETS)[number];

export const OPERATOR_TASKS_ALL_OPEN_BUCKET: TaskBucket = 'ALL_OPEN';

export interface OperatorTodayBucketSlice {
  bucket: OperatorTodayFeedBucket;
  tasks: ApiTask[];
  entries: OperatorTodayTaskEntry[];
  loading: boolean;
  error: string | null;
  count: number;
}

export interface OperatorTodayFeedState {
  buckets: Record<OperatorTodayFeedBucket, OperatorTodayBucketSlice | undefined>;
  summary: ApiTaskSummary | null;
  timezone: string | null;
  summaryLoading: boolean;
  summaryError: string | null;
  canViewUnassigned: boolean;
}

export function canViewOperatorUnassignedBucket(input: {
  userRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
}): boolean {
  if (input.userRole === 'ORG_ADMIN' || input.userRole === 'MASTER_ADMIN') return true;
  return input.hasPermission('tasks', 'manage');
}

export function dedupeTasksById(tasks: ApiTask[]): ApiTask[] {
  const seen = new Set<string>();
  const out: ApiTask[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    out.push(task);
  }
  return out;
}

/** Actionable Today feed: NOW → TODAY → UPCOMING (never PLANNED). */
export function mergeOperatorTodayActionableTasks(
  buckets: Pick<Record<OperatorTodayFeedBucket, ApiTask[] | undefined>, 'NOW' | 'TODAY' | 'UPCOMING'>,
): ApiTask[] {
  return dedupeTasksById([
    ...(buckets.NOW ?? []),
    ...(buckets.TODAY ?? []),
    ...(buckets.UPCOMING ?? []),
  ]);
}

export function bucketCount(
  summary: ApiTaskSummary | null | undefined,
  bucket: TaskBucket,
  fallback: number,
): number {
  const fromSummary = summary?.buckets?.[bucket];
  return typeof fromSummary === 'number' ? fromSummary : fallback;
}

export function buildBucketSlice(input: {
  bucket: OperatorTodayFeedBucket;
  tasks: ApiTask[];
  loading: boolean;
  error: string | null;
  summary: ApiTaskSummary | null;
  previewLimit?: number;
}): OperatorTodayBucketSlice {
  const entries = buildOperatorTodayTaskEntries(input.tasks);
  const limitedEntries =
    input.previewLimit != null ? entries.slice(0, input.previewLimit) : entries;
  return {
    bucket: input.bucket,
    tasks: input.tasks,
    entries: limitedEntries,
    loading: input.loading,
    error: input.error,
    count: bucketCount(input.summary, input.bucket, input.tasks.length),
  };
}

/** Buckets that should refresh after a task mutation in Operator surfaces. */
export function bucketsAffectedByTaskMutation(task?: Pick<ApiTask, 'bucket'> | null): TaskBucket[] {
  const current = task?.bucket;
  const base: TaskBucket[] = [
    'NOW',
    'TODAY',
    'UPCOMING',
    'PLANNED',
    'OVERDUE',
    'UNASSIGNED',
    OPERATOR_TASKS_ALL_OPEN_BUCKET,
  ];
  if (current && !base.includes(current)) {
    return [current, ...base];
  }
  return base;
}
