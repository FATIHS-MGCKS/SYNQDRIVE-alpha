import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  fetchOperationalDashboard,
  getOperationalDashboardSnapshot,
  invalidateOperationalDashboard,
  OPERATIONAL_REFRESH_MS,
  OPERATIONAL_STALE_MS,
  subscribeOperationalDashboard,
} from './operational-cache';
import type { MasterDashboardOperationalDto } from './types';

export interface UseMasterDashboardOperationalResult {
  data: MasterDashboardOperationalDto | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  refresh: () => Promise<void>;
}

export function useMasterDashboardOperational(): UseMasterDashboardOperationalResult {
  const storeSnapshot = useSyncExternalStore(
    subscribeOperationalDashboard,
    getOperationalDashboardSnapshot,
    getOperationalDashboardSnapshot,
  );

  const [loading, setLoading] = useState(!storeSnapshot.data);
  const [error, setError] = useState<string | null>(null);

  const isStale =
    storeSnapshot.data != null && Date.now() - storeSnapshot.fetchedAt > OPERATIONAL_STALE_MS;

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      await fetchOperationalDashboard(force);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dashboard konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(true), OPERATIONAL_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const refresh = useCallback(async () => {
    invalidateOperationalDashboard();
    await load(true);
  }, [load]);

  return {
    data: storeSnapshot.data,
    loading: loading && !storeSnapshot.data,
    error,
    isStale,
    refresh,
  };
}

/** Badge derivation from operational snapshot — shared with sidebar. */
export function operationalToNavBadgeState(data: MasterDashboardOperationalDto | null) {
  if (!data) {
    return {
      platformHealthy: false,
      platformCritical: true,
      openSupportTickets: 0,
      dimoConnected: true,
      billingAnomaly: false,
    };
  }
  const billing = data.billing;
  const billingAnomaly =
    !!billing &&
    ((billing.failedPayments ?? 0) > 0 ||
      (billing.reconciliationDrifts ?? 0) > 0 ||
      billing.pastDueSubscriptions > 0 ||
      billing.stripeSyncErrors > 0);

  const dimo = data.connectivity?.platform;
  const hasFleet = (dimo?.dimoTotal ?? 0) > 0;
  const dimoConnected = !hasFleet || (dimo?.dimoConnected ?? 0) > 0;

  return {
    platformHealthy: data.overallStatus === 'healthy' || data.overallStatus === 'warning',
    platformCritical: data.overallStatus === 'critical',
    openSupportTickets: data.support?.openTickets ?? 0,
    dimoConnected,
    billingAnomaly,
  };
}
