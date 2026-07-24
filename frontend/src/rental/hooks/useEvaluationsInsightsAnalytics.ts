import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

export interface EvaluationsInsightsSummary {
  generatedAt: string | null;
  hasRun: boolean;
  lastRunAt: string | null;
  stale: boolean;
  error: string | null;
  counts: {
    totalVisible: number;
    businessRisks: number;
    revenueLeakage: number;
    criticalInsights: number;
    criticalBusinessRisks: number;
    recommended: number;
    bySeverity: {
      critical: number;
      warning: number;
      opportunity: number;
      info: number;
    };
  };
  estimatedFinancialExposureMinor: number;
  estimatedFinancialExposureCurrency: string;
}

export interface EvaluationsInsightListItem {
  id: string;
  type: string;
  severity: string;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityScope: string;
  entityIds?: string[] | null;
  timeContext?: Record<string, string> | null;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
  isGrouped: boolean;
  groupCount: number;
  createdAt: string;
}

interface UseEvaluationsInsightsAnalyticsOptions {
  orgId: string | null;
  stationId?: string | null;
  listLimit?: number;
}

export function useEvaluationsInsightsAnalytics({
  orgId,
  stationId = null,
  listLimit = 50,
}: UseEvaluationsInsightsAnalyticsOptions) {
  const [summary, setSummary] = useState<EvaluationsInsightsSummary | null>(null);
  const [businessRisks, setBusinessRisks] = useState<EvaluationsInsightListItem[]>([]);
  const [revenueLeakage, setRevenueLeakage] = useState<EvaluationsInsightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const stationQuery = stationId ? { stationId } : {};
      const [summaryRes, businessRes, leakageRes] = await Promise.all([
        api.evaluationsInsights.summary(orgId, stationQuery),
        api.evaluationsInsights.list(orgId, {
          ...stationQuery,
          category: 'BUSINESS_RISK',
          page: 1,
          limit: listLimit,
          sortBy: 'priority',
          sortOrder: 'desc',
        }),
        api.evaluationsInsights.list(orgId, {
          ...stationQuery,
          category: 'REVENUE_LEAKAGE',
          page: 1,
          limit: listLimit,
          sortBy: 'priority',
          sortOrder: 'desc',
        }),
      ]);
      setSummary(summaryRes);
      setBusinessRisks(businessRes.data);
      setRevenueLeakage(leakageRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insights analytics failed');
    } finally {
      setLoading(false);
    }
  }, [orgId, stationId, listLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    summary,
    businessRisks,
    revenueLeakage,
    loading,
    error,
    refresh,
  };
}
