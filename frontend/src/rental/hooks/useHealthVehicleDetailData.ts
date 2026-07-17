import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type AiHealthCareResponse,
  type BatteryHealthSummary,
  type BrakeHealthDetail,
  type BrakeHealthSummary,
  type ServiceInfoStatus,
  type TireHealthDetailResponse,
  type TireHealthSummaryResponse,
} from '../../lib/api';
import { useBatteryHealthQuery } from '../lib/battery-health-query';
import type { HealthDetailTab } from '../lib/health-detail-utils';

export interface HealthVehicleDetailData {
  tiresSummary: TireHealthSummaryResponse | null;
  tiresDetail: TireHealthDetailResponse | null;
  brakeSummary: BrakeHealthSummary | null;
  brakeDetail: BrakeHealthDetail | null;
  battery: BatteryHealthSummary | null;
  batteryError: string | null;
  batteryRetry: () => Promise<void>;
  batteryLoading: boolean;
  service: ServiceInfoStatus | null;
  dtcActive: unknown[];
  dtcAll: unknown[];
  aiResult: AiHealthCareResponse | null;
}

const EMPTY: Omit<HealthVehicleDetailData, 'battery' | 'batteryError' | 'batteryRetry' | 'batteryLoading'> = {
  tiresSummary: null,
  tiresDetail: null,
  brakeSummary: null,
  brakeDetail: null,
  service: null,
  dtcActive: [],
  dtcAll: [],
  aiResult: null,
};

function tabsNeedingFetch(tab: HealthDetailTab): HealthDetailTab[] {
  if (tab === 'overview') return [];
  return [tab];
}

export function useHealthVehicleDetailData(
  vehicleId: string | null | undefined,
  orgId: string | null | undefined,
  activeTab: HealthDetailTab,
) {
  const batteryQuery = useBatteryHealthQuery({
    orgId,
    vehicleId,
    variant: 'summary',
    enabled: Boolean(vehicleId && orgId),
    livePolling: activeTab === 'battery',
  });

  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<HealthDetailTab>>(new Set());
  const [loadedAt, setLoadedAt] = useState<Partial<Record<HealthDetailTab, number>>>({});
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setData(EMPTY);
    setLoadedTabs(new Set());
    setLoadedAt({});
  }, [vehicleId]);

  const loadTab = useCallback(
    async (tab: HealthDetailTab, options?: { force?: boolean }) => {
      if (!vehicleId) return;
      if (tab === 'battery') {
        if (options?.force || batteryQuery.isHealthStale) {
          await batteryQuery.reload('health');
        }
        setLoadedTabs((prev) => new Set(prev).add(tab));
        setLoadedAt((prev) => ({ ...prev, [tab]: Date.now() }));
        return;
      }

      const lastLoaded = loadedAt[tab];
      const alreadyLoaded = loadedTabs.has(tab);
      if (alreadyLoaded && !options?.force && lastLoaded != null) {
        return;
      }

      setLoading(true);
      try {
        if (tab === 'tires') {
          const [tiresSummary, tiresDetail] = await Promise.all([
            api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
            api.vehicleIntelligence.tireHealthDetail(vehicleId).catch(() => null),
          ]);
          setData((prev) => ({ ...prev, tiresSummary, tiresDetail }));
        } else if (tab === 'brakes') {
          const [brakeSummary, brakeDetail] = await Promise.all([
            api.vehicleIntelligence.brakeHealthSummary(vehicleId).catch(() => null),
            api.vehicleIntelligence.brakeHealthDetail(vehicleId).catch(() => null),
          ]);
          setData((prev) => ({ ...prev, brakeSummary, brakeDetail }));
        } else if (tab === 'dtc') {
          const [dtcActive, dtcAll] = await Promise.all([
            api.vehicleIntelligence.dtcActive(vehicleId).catch(() => []),
            api.vehicleIntelligence.dtc(vehicleId).catch(() => []),
          ]);
          setData((prev) => ({
            ...prev,
            dtcActive: Array.isArray(dtcActive) ? dtcActive : [],
            dtcAll: Array.isArray(dtcAll) ? dtcAll : [],
          }));
        } else if (tab === 'service') {
          const service = await api.vehicleIntelligence
            .serviceInfoStatus(vehicleId)
            .catch(() => null);
          setData((prev) => ({ ...prev, service }));
        }
        setLoadedTabs((prev) => new Set(prev).add(tab));
        setLoadedAt((prev) => ({ ...prev, [tab]: Date.now() }));
      } finally {
        setLoading(false);
      }
    },
    [batteryQuery, loadedAt, loadedTabs, vehicleId],
  );

  useEffect(() => {
    if (!vehicleId) return;
    const tabs = tabsNeedingFetch(activeTab);
    if (tabs.length === 0) return;
    void loadTab(activeTab);
  }, [vehicleId, activeTab, loadTab]);

  useEffect(() => {
    if (activeTab !== 'battery' || !batteryQuery.isHealthStale) return;
    void loadTab('battery', { force: true });
  }, [activeTab, batteryQuery.isHealthStale, loadTab]);

  const triggerAiAnalysis = useCallback(async () => {
    if (!vehicleId) return;
    setAiLoading(true);
    try {
      const result = await api.vehicleIntelligence.aiHealthCare(vehicleId);
      setData((prev) => ({ ...prev, aiResult: result }));
    } catch {
      /* keep null */
    } finally {
      setAiLoading(false);
    }
  }, [vehicleId]);

  return {
    data: {
      ...data,
      battery: batteryQuery.data,
      batteryError: batteryQuery.error,
      batteryRetry: batteryQuery.retry,
      batteryLoading: batteryQuery.loading,
    },
    loading: loading || (activeTab === 'battery' && batteryQuery.loading),
    aiLoading,
    triggerAiAnalysis,
    loadTab,
    batteryIsHealthStale: batteryQuery.isHealthStale,
  };
}
