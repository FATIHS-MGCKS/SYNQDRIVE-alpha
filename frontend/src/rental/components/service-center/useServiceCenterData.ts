import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ApiTask, type ApiTaskSummary, type Vendor } from '../../../lib/api';
import { deriveServiceKpis, isActiveTask } from './service-center.utils';
import type { ServiceCenterData } from './service-center.types';

export function useServiceCenterData(orgId: string | null | undefined): ServiceCenterData {
  const [summary, setSummary] = useState<ApiTaskSummary | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) {
      setSummary(null);
      setTasks([]);
      setVendors([]);
      setError(null);
      setLoaded(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, listRes, vendorsRes] = await Promise.all([
        api.tasks.summary(orgId),
        api.tasks.list(orgId),
        api.vendors.list(orgId).catch(() => [] as Vendor[]),
      ]);
      setSummary(summaryRes);
      setTasks(Array.isArray(listRes) ? listRes : []);
      setVendors(Array.isArray(vendorsRes) ? vendorsRes : []);
      setLoaded(true);
    } catch {
      setSummary(null);
      setTasks([]);
      setVendors([]);
      setError('Service-Daten konnten nicht geladen werden.');
      setLoaded(false);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
    kpis,
    loading,
    error,
    reload,
  };
}
