import { useCallback, useEffect, useState } from 'react';
import type {
  RecommendationImpactMeasurementResult,
  RecommendationImplementationStatus,
} from '@synq/evaluations-insights/evaluations-impact-measurement';
import { api } from '../../lib/api';

export type RecommendationImpactRecord = RecommendationImpactMeasurementResult & {
  id: string;
  recommendationId: string;
  organizationId: string;
  version: number;
  isLatest: boolean;
  measuredAt: string;
  createdAt: string;
};

export interface MeasureRecommendationImpactInput {
  baselineValue?: number | null;
  targetValue?: number | null;
  actualKpiValue?: number | null;
  expectedBenefit?: { amountMinor: number; currency: string } | null;
  expectedCost?: { amountMinor: number; currency: string } | null;
  actualBenefit?: { amountMinor: number; currency: string } | null;
  actualCost?: { amountMinor: number; currency: string } | null;
  baselinePeriod: { from: string; to: string };
  measurementPeriod: { from: string; to: string };
  dataCoveragePercent?: number | null;
  implementationStatus: RecommendationImplementationStatus;
  seasonalOrExternalFactors?: string[];
  locale?: 'de' | 'en';
}

export function useEvaluationsRecommendationImpact(
  orgId: string | null | undefined,
  recommendationId: string | null,
  enabled: boolean,
) {
  const [latest, setLatest] = useState<RecommendationImpactRecord | null>(null);
  const [versions, setVersions] = useState<RecommendationImpactRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !recommendationId || !enabled) {
      setLatest(null);
      setVersions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [latestRow, versionRows] = await Promise.all([
        api.evaluationsRecommendations.getLatestImpact(orgId, recommendationId),
        api.evaluationsRecommendations.listImpactVersions(orgId, recommendationId),
      ]);
      setLatest(latestRow);
      setVersions(versionRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load impact measurement');
      setLatest(null);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, recommendationId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const preview = useCallback(
    async (body: MeasureRecommendationImpactInput) => {
      if (!orgId || !recommendationId) return null;
      return api.evaluationsRecommendations.previewImpact(orgId, recommendationId, body);
    },
    [orgId, recommendationId],
  );

  const measure = useCallback(
    async (body: MeasureRecommendationImpactInput) => {
      if (!orgId || !recommendationId) return null;
      setPending(true);
      setError(null);
      try {
        const saved = await api.evaluationsRecommendations.measureImpact(
          orgId,
          recommendationId,
          body,
        );
        await reload();
        return saved;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impact measurement failed');
        throw e;
      } finally {
        setPending(false);
      }
    },
    [orgId, recommendationId, reload],
  );

  return {
    latest,
    versions,
    loading,
    pending,
    error,
    reload,
    preview,
    measure,
  };
}
