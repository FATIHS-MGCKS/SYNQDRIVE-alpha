import { useCallback, useEffect, useState } from 'react';
import { api, type FleetConnectivityResponse } from '../../../lib/api';

export function useFleetConnectivityList(orgId: string | null, loadErrorLabel: string) {
  const [data, setData] = useState<FleetConnectivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.vehicles.fleetConnectivity(orgId);
      setData(res);
    } catch {
      setData(null);
      setError(loadErrorLabel);
    } finally {
      setLoading(false);
    }
  }, [orgId, loadErrorLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
