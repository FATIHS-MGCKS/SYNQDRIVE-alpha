import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type ApiServiceCase,
  type ApiTask,
  type ApiTaskSummary,
  type Vendor,
} from '../../../lib/api';
import {
  matchesTaskListInvalidation,
  matchesTaskSummaryInvalidation,
  subscribeTaskQueryInvalidation,
} from '../../../lib/tasks/invalidate';
import { isCoordinatedRefreshActive } from '../fleet-health-service/fleet-health-service-refresh-coordinator';
import { deriveServiceKpis, isActiveTask } from './service-center.utils';
import type { ServiceCenterData } from './service-center.types';
import {
  hasPartialServiceCenterData,
  isSourceUsable,
  normalizeArrayResponse,
  resolveSourceAfterError,
  resolveSourceAfterSuccess,
  SERVICE_CASES_ERROR_MESSAGE,
  TASK_SUMMARY_ERROR_MESSAGE,
  TASKS_ERROR_MESSAGE,
  VENDOR_SOURCE_ERROR_MESSAGE,
  type ServiceCenterSource,
  type ServiceCenterSourceState,
  type ServiceCenterSourceStatus,
} from './service-center-source-state';

type SourceSlice<T> = ServiceCenterSourceState<T>;

function createIdleSlice<T>(emptyData: T): SourceSlice<T> {
  return {
    data: emptyData,
    status: 'idle',
    error: null,
    fetchedAt: null,
  };
}

function useSourceSlice<T>(
  orgId: string | null | undefined,
  emptyData: T,
  hasMeaningfulData: (data: T) => boolean,
  errorMessage: string,
  fetcher: (orgId: string) => Promise<T>,
): SourceSlice<T> & { reload: () => Promise<void> } {
  const [slice, setSlice] = useState<SourceSlice<T>>(() => createIdleSlice(emptyData));
  const sliceRef = useRef(slice);
  const inFlightReloadRef = useRef<Promise<void> | null>(null);
  sliceRef.current = slice;

  const reload = useCallback(async () => {
    if (!orgId) {
      inFlightReloadRef.current = null;
      setSlice(createIdleSlice(emptyData));
      return;
    }

    if (inFlightReloadRef.current) {
      return inFlightReloadRef.current;
    }

    const promise = (async () => {
      setSlice((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
      }));

      try {
        const response = await fetcher(orgId);
        const next = resolveSourceAfterSuccess(response, new Date().toISOString());
        setSlice(next);
      } catch {
        const current = sliceRef.current;
        const next = resolveSourceAfterError({
          previousData: current.data,
          previousStatus: current.status,
          previousFetchedAt: current.fetchedAt,
          emptyData,
          hasMeaningfulData,
          errorMessage,
        });
        setSlice(next);
      }
    })();

    inFlightReloadRef.current = promise;
    try {
      await promise;
    } finally {
      if (inFlightReloadRef.current === promise) {
        inFlightReloadRef.current = null;
      }
    }
  }, [orgId, emptyData, errorMessage, fetcher, hasMeaningfulData]);

  return { ...slice, reload };
}

function toSource<T>(slice: SourceSlice<T> & { reload: () => Promise<void> }): ServiceCenterSource<T> {
  return {
    data: slice.data,
    status: slice.status,
    error: slice.error,
    fetchedAt: slice.fetchedAt,
    reload: slice.reload,
  };
}

const fetchTaskSummary = (orgId: string) => api.tasks.summary(orgId);
const fetchTasks = async (orgId: string) => {
  const listRes = await api.tasks.list(orgId);
  return normalizeArrayResponse<ApiTask>(listRes);
};
const fetchVendors = async (orgId: string) => {
  const vendorsRes = await api.vendors.list(orgId);
  return normalizeArrayResponse<Vendor>(vendorsRes);
};
const fetchServiceCases = async (orgId: string) => {
  const casesRes = await api.serviceCases.list(orgId);
  return normalizeArrayResponse<ApiServiceCase>(casesRes);
};

const hasSummary = (summary: ApiTaskSummary | null) => summary != null;
const hasTasks = (tasks: ApiTask[]) => tasks.length > 0;
const hasVendors = (vendors: Vendor[]) => vendors.length > 0;
const hasServiceCases = (cases: ApiServiceCase[]) => cases.length > 0;

export function useServiceCenterData(orgId: string | null | undefined): ServiceCenterData {
  const taskSummarySlice = useSourceSlice(
    orgId,
    null,
    hasSummary,
    TASK_SUMMARY_ERROR_MESSAGE,
    fetchTaskSummary,
  );
  const tasksSlice = useSourceSlice(orgId, [], hasTasks, TASKS_ERROR_MESSAGE, fetchTasks);
  const vendorsSlice = useSourceSlice(orgId, [], hasVendors, VENDOR_SOURCE_ERROR_MESSAGE, fetchVendors);
  const serviceCasesSlice = useSourceSlice(
    orgId,
    [],
    hasServiceCases,
    SERVICE_CASES_ERROR_MESSAGE,
    fetchServiceCases,
  );

  const reloadAll = useCallback(async () => {
    await Promise.all([
      taskSummarySlice.reload(),
      tasksSlice.reload(),
      vendorsSlice.reload(),
      serviceCasesSlice.reload(),
    ]);
  }, [taskSummarySlice.reload, tasksSlice.reload, vendorsSlice.reload, serviceCasesSlice.reload]);

  useEffect(() => {
    if (!orgId) return;
    void taskSummarySlice.reload();
    void tasksSlice.reload();
    void vendorsSlice.reload();
    void serviceCasesSlice.reload();
    // Intentionally keyed only by orgId to avoid parallel reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!orgId || detail.orgId !== orgId) return;
      if (isCoordinatedRefreshActive()) return;
      if (matchesTaskSummaryInvalidation(detail, orgId)) {
        void taskSummarySlice.reload();
      }
      if (matchesTaskListInvalidation(detail, orgId)) {
        void tasksSlice.reload();
      }
    });
  }, [orgId, taskSummarySlice.reload, tasksSlice.reload]);

  const taskSummary = useMemo(() => toSource(taskSummarySlice), [taskSummarySlice]);
  const tasks = useMemo(() => toSource(tasksSlice), [tasksSlice]);
  const vendors = useMemo(() => toSource(vendorsSlice), [vendorsSlice]);
  const serviceCases = useMemo(() => toSource(serviceCasesSlice), [serviceCasesSlice]);

  const allTasks = tasks.data;
  const activeTasks = useMemo(() => allTasks.filter(isActiveTask), [allTasks]);
  const historyTasks = useMemo(
    () => allTasks.filter((t) => t.status === 'DONE' || t.status === 'CANCELLED'),
    [allTasks],
  );

  const tasksLoaded = isSourceUsable(tasks.status);
  const kpis = useMemo(
    () => deriveServiceKpis(taskSummary.data, activeTasks, tasksLoaded),
    [taskSummary.data, activeTasks, tasksLoaded],
  );

  const partialData = useMemo(
    () =>
      hasPartialServiceCenterData([
        taskSummary.status,
        tasks.status,
        vendors.status,
        serviceCases.status,
      ]),
    [taskSummary.status, tasks.status, vendors.status, serviceCases.status],
  );

  const loading = taskSummary.status === 'loading' || tasks.status === 'loading';
  const error = tasks.error ?? taskSummary.error;

  return {
    taskSummary,
    tasks,
    vendors,
    serviceCases,
    partialData,
    summary: taskSummary.data,
    allTasks,
    activeTasks,
    historyTasks,
    vendorsError: vendors.error,
    vendorsStatus: vendors.status,
    vendorsFetchedAt: vendors.fetchedAt,
    kpis,
    loading,
    error,
    reload: reloadAll,
    reloadVendors: vendors.reload,
  };
}

export {
  SERVICE_CASES_ERROR_MESSAGE,
  TASK_SUMMARY_ERROR_MESSAGE,
  TASKS_ERROR_MESSAGE,
  VENDOR_SOURCE_ERROR_MESSAGE,
};
