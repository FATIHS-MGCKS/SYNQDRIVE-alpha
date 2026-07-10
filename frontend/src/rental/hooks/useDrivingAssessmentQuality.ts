import { useCallback, useEffect, useState } from 'react';
import { api, type DrivingAssessmentQualityResponse } from '../../lib/api';

export function useDrivingAssessmentQuality(vehicleId: string | null | undefined) {
  const [data, setData] = useState<DrivingAssessmentQualityResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!vehicleId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.vehicleIntelligence.drivingAssessmentQuality(vehicleId);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const status = data?.applicable ? data.status ?? 'NORMAL' : 'NORMAL';
  const isDegraded = status === 'DEGRADED';
  const isRecovering = status === 'RECOVERING';
  const showWarning = isDegraded || isRecovering;

  return {
    data,
    loading,
    reload,
    status,
    isDegraded,
    isRecovering,
    showWarning,
  };
}
