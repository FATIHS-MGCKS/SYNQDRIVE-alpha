import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import { serializeFiltersToSearchParams } from '@synq/evaluations-insights/evaluations-analytics-filters';

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
    criticalBookings: number;
    criticalBusinessRisks: number;
    entities: {
      insightGroups: number;
      events: number;
      affectedVehicles: number;
      affectedBookings: number;
      affectedCustomers: number;
      affectedStations: number;
      uniqueEntities: number;
      criticalBookings: number;
      orgWideRisks: number;
      bookingScopedRisks: number;
    };
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
  filters: EvaluationsAnalyticsFiltersQuery;
  filterKey: string;
  listLimit?: number;
}

function toQueryString(filters: EvaluationsAnalyticsFiltersQuery, extra?: Record<string, string>): string {
  const params = serializeFiltersToSearchParams(filters);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function useEvaluationsInsightsAnalytics({
  orgId,
  filters,
  filterKey,
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
    setSummary(null);
    setBusinessRisks([]);
    setRevenueLeakage([]);
    try {
      const [summaryRes, businessRes, leakageRes] = await Promise.all([
        api.evaluationsInsights.summary(orgId, filters as Record<string, string | number | null | undefined>),
        api.evaluationsInsights.list(orgId, {
          ...(filters as Record<string, string | number | null | undefined>),
          riskCategory: 'BUSINESS_RISK',
          page: 1,
          limit: listLimit,
          sortBy: 'priority',
          sortOrder: 'desc',
        }),
        api.evaluationsInsights.list(orgId, {
          ...(filters as Record<string, string | number | null | undefined>),
          riskCategory: 'REVENUE_LEAKAGE',
          page: 1,
          limit: listLimit,
          sortBy: 'priority',
          sortOrder: 'desc',
        }),
      ]);
      setSummary(summaryRes as EvaluationsInsightsSummary);
      setBusinessRisks(
        Array.isArray((businessRes as { data?: EvaluationsInsightListItem[] })?.data)
          ? (businessRes as { data: EvaluationsInsightListItem[] }).data
          : Array.isArray(businessRes)
            ? (businessRes as EvaluationsInsightListItem[])
            : [],
      );
      setRevenueLeakage(
        Array.isArray((leakageRes as { data?: EvaluationsInsightListItem[] })?.data)
          ? (leakageRes as { data: EvaluationsInsightListItem[] }).data
          : Array.isArray(leakageRes)
            ? (leakageRes as EvaluationsInsightListItem[])
            : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insights analytics failed');
    } finally {
      setLoading(false);
    }
  }, [orgId, filters, listLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh, filterKey]);

  return {
    summary,
    businessRisks,
    revenueLeakage,
    loading,
    error,
    refresh,
  };
}
