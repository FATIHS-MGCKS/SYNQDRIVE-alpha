import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { DamageResponse, DamageStatsResponse } from '../lib/damage.types';
import { parseDamageList } from '../lib/damage.types';
import type { VehicleDamageHostErrorKey } from '../lib/rental-vehicle-damages-i18n';

export function useVehicleDamages(vehicleId: string | undefined | null) {
  const [damages, setDamages] = useState<DamageResponse[]>([]);
  const [stats, setStats] = useState<DamageStatsResponse | null>(null);
  const [statsUnavailable, setStatsUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hostErrorKey, setHostErrorKey] = useState<VehicleDamageHostErrorKey | null>(null);

  const applyPayload = useCallback(
    (damageRows: unknown, statsRow: DamageStatsResponse | null, statsFailed: boolean) => {
      setDamages(parseDamageList(damageRows));
      setStats(statsRow);
      setStatsUnavailable(statsFailed);
    },
    [],
  );

  const reload = useCallback(async () => {
    if (!vehicleId) {
      setDamages([]);
      setStats(null);
      setStatsUnavailable(false);
      setHostErrorKey(null);
      return;
    }
    setLoading(true);
    setHostErrorKey(null);
    try {
      const [damageRows, statsResult] = await Promise.all([
        api.vehicleIntelligence.getVehicleDamages(vehicleId),
        api.vehicleIntelligence.getDamageStats(vehicleId).catch(() => null),
      ]);
      applyPayload(damageRows, statsResult, statsResult == null);
    } catch {
      setHostErrorKey('vehicleDamages.hostError.refreshFailed');
      // Preserve existing damages/stats — mutation may have succeeded server-side.
    } finally {
      setLoading(false);
    }
  }, [applyPayload, vehicleId]);

  useEffect(() => {
    let cancelled = false;
    if (!vehicleId) {
      setDamages([]);
      setStats(null);
      setStatsUnavailable(false);
      setHostErrorKey(null);
      return;
    }
    setLoading(true);
    setHostErrorKey(null);
    Promise.all([
      api.vehicleIntelligence.getVehicleDamages(vehicleId),
      api.vehicleIntelligence.getDamageStats(vehicleId).catch(() => null),
    ])
      .then(([damageRows, statsRow]) => {
        if (cancelled) return;
        applyPayload(damageRows, statsRow, statsRow == null);
      })
      .catch(() => {
        if (!cancelled) {
          setDamages([]);
          setStats(null);
          setStatsUnavailable(false);
          setHostErrorKey('vehicleDamages.hostError.loadFailed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyPayload, vehicleId]);

  return { damages, stats, statsUnavailable, loading, hostErrorKey, reload };
}
