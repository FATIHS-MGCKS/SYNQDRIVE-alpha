import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type ApiTask, type ApiTaskSummary } from '../../lib/api';
import { fetchAllTasks } from '../../lib/tasks-pagination';
import { matchesTaskListInvalidation, matchesTaskSummaryInvalidation, subscribeTaskQueryInvalidation } from '../../lib/tasks/invalidate';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import { useRentalOrg } from '../../rental/RentalContext';
import { normalizeTodayRows } from '../lib/operatorData';
import { useOperatorShell } from './OperatorShellContext';

interface OperatorDataContextValue {
  pickups: TodayBookingApiRow[];
  returns: TodayBookingApiRow[];
  tasks: ApiTask[];
  taskSummary: ApiTaskSummary | null;
  tasksByVehicleId: Map<string, number>;
  todayLoading: boolean;
  tasksLoading: boolean;
  todayError: string | null;
  tasksError: string | null;
  reloadToday: () => Promise<boolean>;
  reloadTasks: () => Promise<boolean>;
  reloadAll: () => Promise<void>;
}

const OperatorDataCtx = createContext<OperatorDataContextValue | null>(null);

export function OperatorDataProvider({ children }: { children: ReactNode }) {
  const { orgId } = useRentalOrg();
  const { refreshToken, setSyncState } = useOperatorShell();

  const [pickups, setPickups] = useState<TodayBookingApiRow[]>([]);
  const [returns, setReturns] = useState<TodayBookingApiRow[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [taskSummary, setTaskSummary] = useState<ApiTaskSummary | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const reloadToday = useCallback(async (): Promise<boolean> => {
    if (!orgId) {
      setPickups([]);
      setReturns([]);
      setTodayLoading(false);
      return true;
    }
    setTodayLoading(true);
    setTodayError(null);
    try {
      const [pRes, rRes] = await Promise.all([
        api.bookings.todayPickups(orgId),
        api.bookings.todayReturns(orgId),
      ]);
      setPickups(normalizeTodayRows(pRes));
      setReturns(normalizeTodayRows(rRes));
      return true;
    } catch (e) {
      setTodayError(e instanceof Error ? e.message : 'Heute-Daten fehlgeschlagen');
      return false;
    } finally {
      setTodayLoading(false);
    }
  }, [orgId]);

  const reloadTasks = useCallback(async (): Promise<boolean> => {
    if (!orgId) {
      setTasks([]);
      setTaskSummary(null);
      setTasksLoading(false);
      return true;
    }
    setTasksLoading(true);
    setTasksError(null);
    try {
      const [taskList, sum] = await Promise.all([
        fetchAllTasks(orgId, { bucket: 'ALL_OPEN' }),
        api.tasks.summary(orgId).catch(() => null),
      ]);
      setTasks(taskList);
      setTaskSummary(sum);
      return true;
    } catch (e) {
      setTasksError(e instanceof Error ? e.message : 'Aufgaben fehlgeschlagen');
      return false;
    } finally {
      setTasksLoading(false);
    }
  }, [orgId]);

  const reloadAll = useCallback(async () => {
    setSyncState({ loading: true, error: false });
    const [todayOk, tasksOk] = await Promise.all([reloadToday(), reloadTasks()]);
    setSyncState({
      loading: false,
      lastSyncAt: new Date().toISOString(),
      error: !todayOk || !tasksOk,
    });
  }, [reloadToday, reloadTasks, setSyncState]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll, refreshToken]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!orgId || detail.orgId !== orgId) return;
      if (matchesTaskListInvalidation(detail, orgId)) void reloadTasks();
      if (matchesTaskSummaryInvalidation(detail, orgId)) {
        void api.tasks.summary(orgId).then(setTaskSummary).catch(() => undefined);
      }
    });
  }, [orgId, reloadTasks]);

  const tasksByVehicleId = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!t.vehicleId) continue;
      map.set(t.vehicleId, (map.get(t.vehicleId) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const value = useMemo(
    () => ({
      pickups,
      returns,
      tasks,
      taskSummary,
      tasksByVehicleId,
      todayLoading,
      tasksLoading,
      todayError,
      tasksError,
      reloadToday,
      reloadTasks,
      reloadAll,
    }),
    [
      pickups,
      returns,
      tasks,
      taskSummary,
      tasksByVehicleId,
      todayLoading,
      tasksLoading,
      todayError,
      tasksError,
      reloadToday,
      reloadTasks,
      reloadAll,
    ],
  );

  return <OperatorDataCtx.Provider value={value}>{children}</OperatorDataCtx.Provider>;
}

export function useOperatorData(): OperatorDataContextValue {
  const ctx = useContext(OperatorDataCtx);
  if (!ctx) throw new Error('useOperatorData must be used within OperatorDataProvider');
  return ctx;
}
