import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import type { EvaluationsSectionEnvelope } from '@synq/evaluations-insights/evaluations-analytics-primitives.contract';
import type { EvaluationsAnalyticsSummaryResponse } from '../lib/evaluations-analytics-api.types';
import { validateEvaluationsAnalyticsSummaryResponse } from '../lib/evaluations-analytics-api.types';
import {
  resolveFetchPhase,
  resolveMetricFromEnvelope,
  formatCount,
} from '@synq/evaluations-insights/evaluations-metric-state';
import type { EvaluationsResolvedMetricState } from '@synq/evaluations-insights/evaluations-metric-state.contract';

interface UseEvaluationsAnalyticsSummaryOptions {
  orgId: string | null;
  filters: EvaluationsAnalyticsFiltersQuery;
  filterKey: string;
  locale?: 'de' | 'en';
}

export function useEvaluationsAnalyticsSummary({
  orgId,
  filters,
  filterKey,
  locale = 'de',
}: UseEvaluationsAnalyticsSummaryOptions) {
  const [summary, setSummary] = useState<EvaluationsAnalyticsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hadDataRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setSummary(null);
      setError(null);
      setLoading(false);
      setIsRefetching(false);
      hadDataRef.current = false;
      return;
    }

    const isInitial = !hadDataRef.current;
    if (isInitial) {
      setLoading(true);
      setSummary(null);
    } else {
      setIsRefetching(true);
    }
    setError(null);

    try {
      const filterParams = filters as Record<string, string | number | null | undefined>;
      const res = await api.evaluationsAnalytics.summary(orgId, filterParams);
      const validation = validateEvaluationsAnalyticsSummaryResponse(res);
      if (!validation.ok) {
        throw new Error('Analytics summary response failed contract validation');
      }
      setSummary(validation.data);
      hadDataRef.current = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Analytics summary failed';
      setError(message);
      if (isInitial) {
        setSummary(null);
        hadDataRef.current = false;
      }
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  }, [orgId, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh, filterKey]);

  const fetchPhase = resolveFetchPhase({
    loading,
    isRefetching,
    error,
    hasData: summary !== null,
  });

  const fmtEur = (minor: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(minor / 100);

  const resolveSectionMetric = <T>(
    envelope: EvaluationsSectionEnvelope<T> | null | undefined,
    extractValue: (data: T) => number | null,
    formatValue: (value: number) => string,
    options?: { notApplicable?: boolean; zeroMeansNull?: boolean },
  ): EvaluationsResolvedMetricState =>
    resolveMetricFromEnvelope({
      envelope: envelope ?? null,
      extractValue,
      formatValue,
      fetchPhase,
      fetchError: error,
      locale,
      notApplicable: options?.notApplicable,
      zeroMeansNull: options?.zeroMeansNull,
    });

  const emptyMetric = (
    formatValue: (value: number) => string,
  ): EvaluationsResolvedMetricState =>
    resolveMetricFromEnvelope({
      envelope: null,
      extractValue: () => null,
      formatValue,
      fetchPhase,
      fetchError: error,
      locale,
    });

  const metrics = {
    openReceivables: summary
      ? resolveSectionMetric(summary.receivables, (d) => d.openAmountMinor, fmtEur)
      : emptyMetric(fmtEur),
    businessRiskGroups: summary
      ? resolveSectionMetric(summary.activeRisks, (d) => d.businessRiskGroups, (v) => formatCount(v, locale), {
          zeroMeansNull: true,
        })
      : emptyMetric((v) => formatCount(v, locale)),
    criticalBookings: summary
      ? resolveSectionMetric(summary.activeRisks, (d) => d.criticalBookings, (v) => formatCount(v, locale), {
          zeroMeansNull: true,
        })
      : emptyMetric((v) => formatCount(v, locale)),
    revenueLeakageGroups: summary
      ? resolveSectionMetric(summary.activeRisks, (d) => d.revenueLeakageGroups, (v) => formatCount(v, locale), {
          zeroMeansNull: true,
        })
      : emptyMetric((v) => formatCount(v, locale)),
    estimatedExposure: summary
      ? resolveSectionMetric(summary.activeRisks, (d) => d.estimatedExposureMinor, fmtEur)
      : emptyMetric(fmtEur),
    downtimeVehicles: summary
      ? resolveSectionMetric(summary.downtime, (d) => d.totalDowntimeVehicles, (v) => formatCount(v, locale), {
          zeroMeansNull: true,
        })
      : emptyMetric((v) => formatCount(v, locale)),
  };

  return {
    summary,
    loading,
    isRefetching,
    error,
    fetchPhase,
    metrics,
    refresh,
  };
}
