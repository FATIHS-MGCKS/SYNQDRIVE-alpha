import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  TaskAutomationOverridePayload,
  TaskAutomationRulesOverviewDto,
} from './task-automation.types';
import { parseApiError } from './task-automation.utils';

export function useTaskAutomationCenter(orgId: string | null) {
  const [overview, setOverview] = useState<TaskAutomationRulesOverviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionRuleId, setActionRuleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setOverview(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.taskAutomation.listRules(orgId);
      setOverview(data);
    } catch (e: unknown) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async <T,>(ruleId: string, action: () => Promise<T>): Promise<T> => {
      setActionRuleId(ruleId);
      setError(null);
      try {
        const result = await action();
        await load();
        return result;
      } catch (e: unknown) {
        const message = parseApiError(e);
        setError(message);
        throw e;
      } finally {
        setActionRuleId(null);
      }
    },
    [load],
  );

  const saveOverride = useCallback(
    (ruleId: string, payload: TaskAutomationOverridePayload) => {
      if (!orgId) return Promise.reject(new Error('Organisation fehlt'));
      return runAction(ruleId, () => api.taskAutomation.upsertOverride(orgId, ruleId, payload));
    },
    [orgId, runAction],
  );

  const resetOverride = useCallback(
    (ruleId: string, expectedVersion?: number) => {
      if (!orgId) return Promise.reject(new Error('Organisation fehlt'));
      return runAction(ruleId, () =>
        api.taskAutomation.resetOverride(orgId, ruleId, expectedVersion),
      );
    },
    [orgId, runAction],
  );

  return {
    overview,
    loading,
    error,
    actionRuleId,
    reload: load,
    saveOverride,
    resetOverride,
  };
}
