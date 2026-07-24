import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { EvaluationsRecommendationIntegrationAction } from '@synq/evaluations-insights/evaluations-recommendation-integrations';
import type { EvaluationsRecommendationIntegrationDescriptor } from '@synq/evaluations-insights/evaluations-recommendation-integrations';
import { logEvaluationsRecommendationAudit } from '@synq/evaluations-insights/evaluations-recommendations';

export function useEvaluationsRecommendationIntegrations(
  orgId: string | null | undefined,
  recommendationId: string | null,
) {
  const [items, setItems] = useState<EvaluationsRecommendationIntegrationDescriptor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<EvaluationsRecommendationIntegrationAction | null>(
    null,
  );

  const reload = useCallback(async () => {
    if (!orgId || !recommendationId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.evaluationsRecommendations.listIntegrations(orgId, recommendationId);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load integrations');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, recommendationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const execute = useCallback(
    async (action: EvaluationsRecommendationIntegrationAction, body?: { dueAt?: string; ownerId?: string }) => {
      if (!orgId || !recommendationId) return null;
      setPendingAction(action);
      setError(null);
      try {
        const result = await api.evaluationsRecommendations.executeIntegration(
          orgId,
          recommendationId,
          { action, ...body },
        );
        logEvaluationsRecommendationAudit({
          action: `integration:${action}`,
          recommendationId,
        });
        await reload();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Integration failed');
        throw e;
      } finally {
        setPendingAction(null);
      }
    },
    [orgId, recommendationId, reload],
  );

  return {
    items,
    loading,
    error,
    pendingAction,
    reload,
    execute,
  };
}
