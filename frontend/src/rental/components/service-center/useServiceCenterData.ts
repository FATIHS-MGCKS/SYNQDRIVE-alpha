import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiTask, type ApiTaskSummary, type Vendor } from '../../../lib/api';
import { matchesTaskListInvalidation, matchesTaskSummaryInvalidation, subscribeTaskQueryInvalidation } from '../../../lib/tasks/invalidate';
import { deriveServiceKpis, isActiveTask } from './service-center.utils';
import type { ServiceCenterData } from './service-center.types';
import {
  resolveVendorSourceAfterError,
  resolveVendorSourceAfterSuccess,
  VENDOR_SOURCE_ERROR_MESSAGE,
  type VendorSourceState,
} from './vendor-source-state';

const TASKS_ERROR_MESSAGE = 'Service-Daten konnten nicht geladen werden.';

export function useServiceCenterData(orgId: string | null | undefined): ServiceCenterData {
  const [summary, setSummary] = useState<ApiTaskSummary | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsStatus, setVendorsStatus] = useState<VendorSourceState>('idle');
  const [vendorsError, setVendorsError] = useState<string | null>(null);
  const [vendorsFetchedAt, setVendorsFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const vendorsStatusRef = useRef(vendorsStatus);
  const vendorsRef = useRef(vendors);
  vendorsStatusRef.current = vendorsStatus;
  vendorsRef.current = vendors;

  const resetVendorSource = useCallback(() => {
    setVendors([]);
    setVendorsStatus('idle');
    setVendorsError(null);
    setVendorsFetchedAt(null);
  }, []);

  const reloadVendors = useCallback(async () => {
    if (!orgId) {
      resetVendorSource();
      return;
    }

    setVendorsStatus('loading');
    setVendorsError(null);

    try {
      const vendorsRes = await api.vendors.list(orgId);
      const next = resolveVendorSourceAfterSuccess(vendorsRes, new Date().toISOString());
      setVendors(next.vendors);
      setVendorsStatus(next.status);
      setVendorsFetchedAt(next.fetchedAt);
      setVendorsError(next.error);
    } catch {
      const next = resolveVendorSourceAfterError(
        vendorsRef.current,
        vendorsStatusRef.current,
      );
      setVendors(next.vendors);
      setVendorsStatus(next.status);
      setVendorsError(next.error);
    }
  }, [orgId, resetVendorSource]);

  const reloadTasks = useCallback(async () => {
    if (!orgId) {
      setSummary(null);
      setTasks([]);
      setError(null);
      setLoaded(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [summaryRes, listRes] = await Promise.all([
        api.tasks.summary(orgId),
        api.tasks.list(orgId),
      ]);
      setSummary(summaryRes);
      setTasks(Array.isArray(listRes) ? listRes : []);
      setLoaded(true);
    } catch {
      setSummary(null);
      setTasks([]);
      setError(TASKS_ERROR_MESSAGE);
      setLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const reload = useCallback(async () => {
    await Promise.all([reloadTasks(), reloadVendors()]);
  }, [reloadTasks, reloadVendors]);

  useEffect(() => {
    void reloadTasks();
    void reloadVendors();
  }, [reloadTasks, reloadVendors]);

  useEffect(() => {
    return subscribeTaskQueryInvalidation((detail) => {
      if (!orgId || detail.orgId !== orgId) return;
      if (matchesTaskListInvalidation(detail, orgId) || matchesTaskSummaryInvalidation(detail, orgId)) {
        void reloadTasks();
      }
    });
  }, [orgId, reloadTasks]);

  const activeTasks = useMemo(() => tasks.filter(isActiveTask), [tasks]);
  const historyTasks = useMemo(
    () => tasks.filter((t) => t.status === 'DONE' || t.status === 'CANCELLED'),
    [tasks],
  );

  const kpis = useMemo(
    () => deriveServiceKpis(summary, activeTasks, loaded),
    [summary, activeTasks, loaded],
  );

  return {
    summary,
    allTasks: tasks,
    activeTasks,
    historyTasks,
    vendors,
    vendorsError,
    vendorsStatus,
    vendorsFetchedAt,
    kpis,
    loading,
    error,
    reload,
    reloadVendors,
  };
}

export { VENDOR_SOURCE_ERROR_MESSAGE };
