import { useCallback, useMemo } from 'react';
import { useRentalOrg } from '../../rental/RentalContext';
import { useTaskList } from '../../lib/tasks/hooks/useTaskList';
import { useTaskSummary } from '../../lib/tasks/hooks/useTaskSummary';
import type { TaskBucket } from '../../lib/tasks/types';
import {
  buildBucketSlice,
  canViewOperatorUnassignedBucket,
  OPERATOR_TODAY_FEED_BUCKETS,
  type OperatorTodayBucketSlice,
  type OperatorTodayFeedBucket,
  type OperatorTodayFeedState,
} from './operatorTodayFeed.utils';
import { OPERATOR_TODAY_BUCKET_PREVIEW_LIMITS } from '../views/operatorTodayView.utils';

export interface UseOperatorTodayFeedResult extends OperatorTodayFeedState {
  isStale: boolean;
  reload: () => Promise<void>;
}

function useBucketList(orgId: string | null, bucket: TaskBucket, enabled: boolean) {
  return useTaskList({
    orgId,
    bucket,
    enabled: Boolean(orgId) && enabled,
  });
}

export function useOperatorTodayFeed(): UseOperatorTodayFeedResult {
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const enabled = Boolean(orgId);
  const canViewUnassigned = canViewOperatorUnassignedBucket({ userRole, hasPermission });

  const nowQuery = useBucketList(orgId, 'NOW', enabled);
  const todayQuery = useBucketList(orgId, 'TODAY', enabled);
  const upcomingQuery = useBucketList(orgId, 'UPCOMING', enabled);
  const plannedQuery = useBucketList(orgId, 'PLANNED', enabled);
  const unassignedQuery = useBucketList(orgId, 'UNASSIGNED', enabled && canViewUnassigned);
  const summaryQuery = useTaskSummary({ orgId, enabled });

  const summary = summaryQuery.summary;
  const timezone = summary?.timezone ?? null;

  const bucketQueries: Record<OperatorTodayFeedBucket, ReturnType<typeof useTaskList> | null> = useMemo(
    () => ({
      NOW: nowQuery,
      TODAY: todayQuery,
      UPCOMING: upcomingQuery,
      PLANNED: plannedQuery,
      UNASSIGNED: canViewUnassigned ? unassignedQuery : null,
    }),
    [canViewUnassigned, nowQuery, todayQuery, upcomingQuery, plannedQuery, unassignedQuery],
  );

  const buckets = useMemo(() => {
    const out = {} as Record<OperatorTodayFeedBucket, OperatorTodayBucketSlice | undefined>;
    for (const bucket of OPERATOR_TODAY_FEED_BUCKETS) {
      const query = bucketQueries[bucket];
      if (!query) {
        out[bucket] = undefined;
        continue;
      }
      const previewLimit = OPERATOR_TODAY_BUCKET_PREVIEW_LIMITS[bucket];
      out[bucket] = buildBucketSlice({
        bucket,
        tasks: query.tasks,
        loading: query.loading,
        error: query.error,
        summary,
        previewLimit,
      });
    }
    return out;
  }, [
    bucketQueries,
    summary,
    nowQuery.tasks,
    nowQuery.loading,
    nowQuery.error,
    todayQuery.tasks,
    todayQuery.loading,
    todayQuery.error,
    upcomingQuery.tasks,
    upcomingQuery.loading,
    upcomingQuery.error,
    plannedQuery.tasks,
    plannedQuery.loading,
    plannedQuery.error,
    unassignedQuery.tasks,
    unassignedQuery.loading,
    unassignedQuery.error,
    canViewUnassigned,
  ]);

  const reload = useCallback(async () => {
    await Promise.all([
      nowQuery.reload(),
      todayQuery.reload(),
      upcomingQuery.reload(),
      plannedQuery.reload(),
      canViewUnassigned ? unassignedQuery.reload() : Promise.resolve([]),
      summaryQuery.reload(),
    ]);
  }, [
    canViewUnassigned,
    nowQuery,
    todayQuery,
    upcomingQuery,
    plannedQuery,
    unassignedQuery,
    summaryQuery,
  ]);

  const isStale =
    nowQuery.isStale ||
    todayQuery.isStale ||
    upcomingQuery.isStale ||
    plannedQuery.isStale ||
    (canViewUnassigned && unassignedQuery.isStale);

  return {
    buckets,
    summary,
    timezone,
    summaryLoading: summaryQuery.loading,
    summaryError: summaryQuery.error,
    canViewUnassigned,
    isStale,
    reload,
  };
}
