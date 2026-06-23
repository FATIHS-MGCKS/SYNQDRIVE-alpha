import { useMemo } from 'react';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useRentalOrg } from '../../rental/RentalContext';
import { useOperatorData } from '../context/OperatorDataContext';
import { buildOperatorTodaySnapshot, type OperatorTodaySnapshot } from '../lib/operatorData';

export interface UseOperatorTodayResult {
  orgId: string;
  orgLoading: boolean;
  snapshot: OperatorTodaySnapshot;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useOperatorToday(locale = 'de'): UseOperatorTodayResult {
  const { orgId, loading: orgLoading } = useRentalOrg();
  const { fleetVehicles, healthMap } = useFleetVehicles();
  const {
    pickups,
    returns,
    tasks,
    todayLoading,
    tasksLoading,
    todayError,
    tasksError,
    reloadToday,
    reloadTasks,
  } = useOperatorData();

  const snapshot = useMemo(
    () =>
      buildOperatorTodaySnapshot({
        pickups,
        returns,
        tasks,
        fleetVehicles,
        healthMap,
        locale,
      }),
    [pickups, returns, tasks, fleetVehicles, healthMap, locale],
  );

  const loading = orgLoading || todayLoading || tasksLoading;
  const error = todayError ?? tasksError;

  const reload = async () => {
    await Promise.all([reloadToday(), reloadTasks()]);
  };

  return {
    orgId,
    orgLoading,
    snapshot,
    loading,
    error,
    reload,
  };
}
