import {
  bumpTaskQueryOrgGeneration,
  getTaskQueryOrgGeneration,
  isTaskQueryGenerationStale,
  runTaskQueryFlight,
} from './task-query-flight';
import { taskQueryKeys } from './query-keys';
import type { TaskBucket, TaskListFilters } from './types';
import { api } from '../api';
import { unwrapTaskListPage } from '../tasks-pagination';

export async function fetchTaskListDeduped(options: {
  orgId: string;
  filters?: TaskListFilters;
  bucket?: TaskBucket;
  generation: number;
}) {
  const { orgId, filters, bucket, generation } = options;
  const mergedFilters: TaskListFilters = {
    ...filters,
    ...(bucket ? { bucket } : {}),
  };
  const queryKey = bucket
    ? taskQueryKeys.listBucket(orgId, bucket, filters)
    : taskQueryKeys.list(orgId, mergedFilters);

  return runTaskQueryFlight({
    queryKey,
    orgId,
    generation,
    fetcher: async () => unwrapTaskListPage(await api.tasks.list(orgId, mergedFilters)),
  });
}

export async function fetchTaskSummaryDeduped(orgId: string, generation: number) {
  return runTaskQueryFlight({
    queryKey: taskQueryKeys.summary(orgId),
    orgId,
    generation,
    fetcher: () => api.tasks.summary(orgId),
  });
}

export function resetTaskQueryScope(orgId: string | null | undefined): void {
  if (!orgId) return;
  bumpTaskQueryOrgGeneration(orgId);
}

export function currentTaskQueryGeneration(orgId: string): number {
  return getTaskQueryOrgGeneration(orgId);
}

export function isStaleTaskQueryResponse(orgId: string, generation: number): boolean {
  return isTaskQueryGenerationStale(orgId, generation);
}
