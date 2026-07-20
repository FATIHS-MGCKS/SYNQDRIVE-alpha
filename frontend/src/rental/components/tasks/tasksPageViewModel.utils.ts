import type { ApiTaskSummary } from '../../../lib/api';
import type { TaskBucket } from '../../../lib/tasks/types';
import {
  bucketCountFromSummary,
  findTasksPageViewMeta,
  getVisibleTasksPageViews,
  type TasksPageView,
} from '../../lib/tasks-page.utils';

export function buildTasksPageViewCounts(
  summary: ApiTaskSummary | null | undefined,
  canViewUnassigned: boolean,
): Partial<Record<TasksPageView, number>> {
  const counts: Partial<Record<TasksPageView, number>> = {};
  for (const view of getVisibleTasksPageViews(canViewUnassigned)) {
    if (view.id === 'mine') {
      counts.mine = summary?.assignedToMe ?? 0;
      continue;
    }
    counts[view.id] = bucketCountFromSummary(summary, view.bucket, 0);
  }
  return counts;
}

export function resolveTasksPageSummaryCount(
  summary: ApiTaskSummary | null | undefined,
  view: TasksPageView,
  bucket: TaskBucket,
): number {
  if (view === 'mine') return summary?.assignedToMe ?? 0;
  return bucketCountFromSummary(summary, bucket, 0);
}

export function buildTasksPageResultLabel(
  view: TasksPageView,
  loadedCount: number,
  summaryCount: number,
  hasMore: boolean,
): string {
  const meta = findTasksPageViewMeta(view);

  if (loadedCount === 0 && summaryCount === 0) {
    return `${meta.label} · keine Einträge`;
  }

  if (hasMore && summaryCount > loadedCount) {
    if (loadedCount === 1) {
      return `${meta.label} · 1 von ${summaryCount} geladen`;
    }
    return `${meta.label} · ${loadedCount} von ${summaryCount} geladen`;
  }

  if (summaryCount === 1 || loadedCount === 1) {
    return `${meta.label} · 1 Aufgabe`;
  }

  const count = summaryCount > 0 ? summaryCount : loadedCount;
  return `${meta.label} · ${count} Aufgaben`;
}
