import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { VehicleFileSummary } from '../lib/vehicle-file-summary.types';

export function useVehicleFileSummary(vehicleId: string | undefined | null) {
  const [summary, setSummary] = useState<VehicleFileSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!vehicleId) {
      setSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.vehicleIntelligence.vehicleFileSummary(vehicleId);
      setSummary(data);
    } catch {
      setSummary(null);
      setError('Fahrzeugakte konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    let cancelled = false;
    if (!vehicleId) {
      setSummary(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.vehicleIntelligence
      .vehicleFileSummary(vehicleId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setError('Fahrzeugakte konnte nicht geladen werden.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  return { summary, loading, error, reload };
}
