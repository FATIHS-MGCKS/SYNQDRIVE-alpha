import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import type {
  EvaluationsInsightDetail,
  InsightAnalyticsSummary,
} from '../lib/evaluations-analytics-api.types';
import {
  validateEvaluationsInsightListResponse,
  validateInsightAnalyticsSummary,
} from '../lib/evaluations-analytics-api.types';

interface UseEvaluationsInsightsAnalyticsOptions {
  orgId: string | null;
  filters: EvaluationsAnalyticsFiltersQuery;
  filterKey: string;
  listLimit?: number;
}

export function useEvaluationsInsightsAnalytics({
  orgId,
  filters,
  filterKey,
  listLimit = 50,
}: UseEvaluationsInsightsAnalyticsOptions) {
  const [summary, setSummary] = useState<InsightAnalyticsSummary | null>(null);
  const [businessRisks, setBusinessRisks] = useState<EvaluationsInsightDetail[]>([]);
  const [revenueLeakage, setRevenueLeakage] = useState<EvaluationsInsightDetail[]>([]);
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
      const filterParams = filters as Record<string, string | number | null | undefined>;
      const [summaryRes, businessRes, leakageRes] = await Promise.all([
        api.evaluationsInsights.summary(orgId, filterParams),
        api.evaluationsInsights.list(orgId, {
          ...filterParams,
          riskCategory: 'BUSINESS_RISK',
          page: 1,
          limit: listLimit,
          sortBy: 'priority',
          sortOrder: 'desc',
        }),
        api.evaluationsInsights.list(orgId, {
          ...filterParams,
          riskCategory: 'REVENUE_LEAKAGE',
          page: 1,
          limit: listLimit,
          sortBy: 'priority',
          sortOrder: 'desc',
        }),
      ]);

      const summaryValidation = validateInsightAnalyticsSummary(summaryRes);
      if (!summaryValidation.ok) {
        throw new Error('Insights summary response failed contract validation');
      }
      setSummary(summaryValidation.data);

      const businessValidation = validateEvaluationsInsightListResponse(businessRes);
      const leakageValidation = validateEvaluationsInsightListResponse(leakageRes);
      if (!businessValidation.ok || !leakageValidation.ok) {
        throw new Error('Insights list response failed contract validation');
      }
      setBusinessRisks(businessValidation.data.data);
      setRevenueLeakage(leakageValidation.data.data);
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
