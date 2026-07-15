import type { TaskBucket } from './types';

export const TASK_QUERY_INVALIDATE_EVENT = 'task-query-invalidate' as const;

export interface TaskQueryInvalidationDetail {
  orgId: string;
  taskId?: string;
  vehicleId?: string | null;
  bookingId?: string | null;
  buckets?: TaskBucket[];
  /** Reload open-task list snapshots (OperatorDataContext, generic lists). */
  lists?: boolean;
  /** Reload dashboard summary KPIs. */
  summary?: boolean;
  /** Reload detail query for `taskId`. */
  detail?: boolean;
}

export interface TaskQueryInvalidationEvent extends CustomEvent<TaskQueryInvalidationDetail> {}

export function invalidateTaskQueries(detail: TaskQueryInvalidationDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TaskQueryInvalidationDetail>(TASK_QUERY_INVALIDATE_EVENT, { detail }),
  );
}

export function subscribeTaskQueryInvalidation(
  listener: (detail: TaskQueryInvalidationDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const custom = event as TaskQueryInvalidationEvent;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(TASK_QUERY_INVALIDATE_EVENT, handler);
  return () => window.removeEventListener(TASK_QUERY_INVALIDATE_EVENT, handler);
}

export function matchesTaskListInvalidation(
  detail: TaskQueryInvalidationDetail,
  orgId: string | null | undefined,
  bucket?: TaskBucket,
): boolean {
  if (!orgId || detail.orgId !== orgId) return false;
  if (detail.lists === false) return false;
  if (bucket && detail.buckets && detail.buckets.length > 0 && !detail.buckets.includes(bucket)) {
    return false;
  }
  return true;
}

export function matchesTaskDetailInvalidation(
  detail: TaskQueryInvalidationDetail,
  orgId: string | null | undefined,
  taskId: string | null | undefined,
): boolean {
  if (!orgId || !taskId || detail.orgId !== orgId) return false;
  if (detail.detail === false) return false;
  return !detail.taskId || detail.taskId === taskId;
}

export function matchesTaskSummaryInvalidation(
  detail: TaskQueryInvalidationDetail,
  orgId: string | null | undefined,
): boolean {
  if (!orgId || detail.orgId !== orgId) return false;
  return detail.summary !== false;
}
