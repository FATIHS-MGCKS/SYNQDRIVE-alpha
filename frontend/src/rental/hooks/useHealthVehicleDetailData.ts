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
import type { HealthDetailTab } from '../lib/health-detail-utils';

export interface HealthVehicleDetailData {
  tiresSummary: TireHealthSummaryResponse | null;
  tiresDetail: TireHealthDetailResponse | null;
  brakeSummary: BrakeHealthSummary | null;
  brakeDetail: BrakeHealthDetail | null;
  battery: BatteryHealthSummary | null;
  service: ServiceInfoStatus | null;
  dtcActive: unknown[];
  dtcAll: unknown[];
  aiResult: AiHealthCareResponse | null;
}

const EMPTY: HealthVehicleDetailData = {
  tiresSummary: null,
  tiresDetail: null,
  brakeSummary: null,
  brakeDetail: null,
  battery: null,
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
  activeTab: HealthDetailTab,
) {
  const [data, setData] = useState<HealthVehicleDetailData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<HealthDetailTab>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setData(EMPTY);
    setLoadedTabs(new Set());
  }, [vehicleId]);

  const loadTab = useCallback(
    async (tab: HealthDetailTab) => {
      if (!vehicleId || loadedTabs.has(tab)) return;
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
        } else if (tab === 'battery') {
          const battery = await api.vehicleIntelligence
            .batteryHealthSummary(vehicleId)
            .catch(() => null);
          setData((prev) => ({ ...prev, battery }));
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
        } else if (tab === 'complaints' || tab === 'oem_alerts' || tab === 'evidence') {
          /* RentalHealth modules only — no extra fetch required */
        }
        setLoadedTabs((prev) => new Set(prev).add(tab));
      } finally {
        setLoading(false);
      }
    },
    [vehicleId, loadedTabs],
  );

  useEffect(() => {
    if (!vehicleId) return;
    const tabs = tabsNeedingFetch(activeTab);
    if (tabs.length === 0) return;
    void loadTab(activeTab);
  }, [vehicleId, activeTab, loadTab]);

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

  return { data, loading, aiLoading, triggerAiAnalysis, loadTab };
}
