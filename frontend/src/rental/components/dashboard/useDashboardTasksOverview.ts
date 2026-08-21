import { useEffect, useMemo } from 'react';
import { useTaskList } from '../../../lib/tasks/hooks/useTaskList';
import { useTaskSummary } from '../../../lib/tasks/hooks/useTaskSummary';
import { isActiveApiTask } from '../../lib/taskBulkActions.utils';
import { canViewUnassignedTasksBucket } from '../../lib/tasks-page.utils';
import type { VehicleData } from '../../data/vehicles';
import {
  buildDashboardTaskPreview,
  buildDashboardTasksOverviewCountsFromSummary,
  buildFleetVehicleById,
  deriveDashboardTasksOverviewCounts,
  filterTasksForDashboardStation,
} from './dashboardTasksOverview.utils';

export interface UseDashboardTasksOverviewOptions {
  orgId: string | null | undefined;
  selectedStationId: string | null;
  fleetVehicles: VehicleData[];
  userRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
  enabled?: boolean;
}

export function useDashboardTasksOverview({
  orgId,
  selectedStationId,
  fleetVehicles,
  userRole,
  hasPermission,
  enabled = true,
}: UseDashboardTasksOverviewOptions) {
  const stationScoped = Boolean(selectedStationId);
  const canViewUnassigned = canViewUnassignedTasksBucket({ userRole, hasPermission });
  const queryEnabled = Boolean(orgId) && enabled;

  const summaryQuery = useTaskSummary({
    orgId,
    enabled: queryEnabled && !stationScoped,
  });

  const listQuery = useTaskList({
    orgId,
    bucket: 'ALL_OPEN',
    enabled: queryEnabled,
  });

  const vehicleById = useMemo(() => buildFleetVehicleById(fleetVehicles), [fleetVehicles]);

  const activeTasks = useMemo(
    () => listQuery.tasks.filter(isActiveApiTask),
    [listQuery.tasks],
  );

  const stationTasks = useMemo(() => {
    if (!stationScoped || !selectedStationId) return activeTasks;
    return filterTasksForDashboardStation(activeTasks, selectedStationId, vehicleById);
  }, [activeTasks, selectedStationId, stationScoped, vehicleById]);

  const listComplete = !listQuery.hasMore && !listQuery.loadingMore;
  const orgWideSummaryEmpty =
    !stationScoped &&
    summaryQuery.summary != null &&
    (summaryQuery.summary.active ?? summaryQuery.summary.open ?? 0) === 0;
  const shouldPaginateList = queryEnabled && !listQuery.error && !orgWideSummaryEmpty;

  useEffect(() => {
    if (!shouldPaginateList) return;
    if (!listQuery.hasMore || listQuery.loadingMore) return;
    void listQuery.loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paginate until ALL_OPEN is complete for preview/counts
  }, [
    shouldPaginateList,
    listQuery.hasMore,
    listQuery.loadingMore,
    listQuery.tasks.length,
  ]);

  const previewReady = (listComplete || orgWideSummaryEmpty) && !listQuery.error;

  const countsLoading = stationScoped
    ? listQuery.loading || !listComplete
    : summaryQuery.loading;

  const counts = useMemo(() => {
    if (stationScoped) {
      if (!listComplete || listQuery.error) return null;
      return deriveDashboardTasksOverviewCounts(stationTasks);
    }
    if (summaryQuery.error || summaryQuery.loading) return null;
    return buildDashboardTasksOverviewCountsFromSummary(summaryQuery.summary, canViewUnassigned);
  }, [
    stationScoped,
    listComplete,
    listQuery.error,
    stationTasks,
    summaryQuery.error,
    summaryQuery.loading,
    summaryQuery.summary,
    canViewUnassigned,
  ]);

  const previewTasks = useMemo(() => {
    if (!previewReady) return [];
    const source = stationScoped ? stationTasks : activeTasks;
    return buildDashboardTaskPreview(source);
  }, [activeTasks, previewReady, stationScoped, stationTasks]);

  const previewLoading =
    !previewReady && !listQuery.error && (listQuery.loading || listQuery.hasMore || listQuery.loadingMore);

  const loading = countsLoading || previewLoading;

  const error = stationScoped ? listQuery.error : listQuery.error ?? summaryQuery.error;

  const reload = async () => {
    await Promise.all([
      listQuery.reload(),
      stationScoped ? Promise.resolve(null) : summaryQuery.reload(),
    ]);
  };

  return {
    counts,
    previewTasks,
    loading,
    countsLoading,
    previewLoading,
    previewReady,
    error,
    reload,
    canViewUnassigned,
    stationScoped,
    listComplete,
  };
}
