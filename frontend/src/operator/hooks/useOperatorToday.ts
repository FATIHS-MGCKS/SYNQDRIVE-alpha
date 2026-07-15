import { useMemo } from 'react';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { buildOperatorTodaySnapshot, type OperatorTodaySnapshot } from '../lib/operatorData';
import { useOperatorNetworkStatus } from './useOperatorNetworkStatus';
import { useOperatorTodayFeed } from './useOperatorTodayFeed';

export interface UseOperatorTodayResult {
  orgId: string;
  orgLoading: boolean;
  snapshot: OperatorTodaySnapshot;
  loading: boolean;
  bookingsLoading: boolean;
  tasksLoading: boolean;
  error: string | null;
  bookingsError: string | null;
  tasksError: string | null;
  isStale: boolean;
  offline: boolean;
  reload: () => Promise<void>;
}

export function useOperatorToday(locale = 'de'): UseOperatorTodayResult {
  const { orgId, loading: orgLoading } = useRentalOrg();
  const { fleetVehicles, healthMap } = useFleetVehicles();
  const {
    pickups,
    returns,
    todayLoading,
    todayError,
    reloadToday,
  } = useOperatorData();
  const taskFeed = useOperatorTodayFeed();
  const { online } = useOperatorNetworkStatus();

  const snapshot = useMemo(
    () =>
      buildOperatorTodaySnapshot({
        pickups,
        returns,
        taskFeed,
        fleetVehicles,
        healthMap,
        locale,
      }),
    [pickups, returns, taskFeed, fleetVehicles, healthMap, locale],
  );

  const tasksLoading =
    taskFeed.summaryLoading ||
    Boolean(taskFeed.buckets.NOW?.loading) ||
    Boolean(taskFeed.buckets.TODAY?.loading) ||
    Boolean(taskFeed.buckets.UPCOMING?.loading) ||
    Boolean(taskFeed.buckets.PLANNED?.loading) ||
    Boolean(taskFeed.buckets.UNASSIGNED?.loading);

  const tasksError =
    taskFeed.summaryError ??
    taskFeed.buckets.NOW?.error ??
    taskFeed.buckets.TODAY?.error ??
    taskFeed.buckets.UPCOMING?.error ??
    taskFeed.buckets.PLANNED?.error ??
    taskFeed.buckets.UNASSIGNED?.error ??
    null;

  const loading = orgLoading || todayLoading || tasksLoading;
  const error = todayError ?? tasksError;

  const reload = async () => {
    await Promise.all([reloadToday(), taskFeed.reload()]);
  };

  return {
    orgId,
    orgLoading,
    snapshot,
    loading,
    bookingsLoading: todayLoading,
    tasksLoading,
    error,
    bookingsError: todayError,
    tasksError,
    isStale: taskFeed.isStale,
    offline: !online,
    reload,
  };
}
