import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { FleetDamageStatsResponse } from '../lib/damage.types';

/**
 * Fleet-level damage analytics hook.
 * Intended for Fleet Condition / Reports surfaces — not the vehicle Damages tab.
 */
export function useFleetDamageStats(orgId: string | undefined) {
  const [stats, setStats] = useState<FleetDamageStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await api.damages.fleetStats(orgId);
      setStats(row);
    } catch (err) {
      setStats(null);
      setError(err instanceof Error ? err.message : 'Fleet damage stats unavailable');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { stats, loading, error, reload };
}
