import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PRODUCT_LOCALE } from '../../../i18n/locales';
import { api } from '../../../lib/api';
import {
  parseTaskAutomationApiError,
  taskAutomationMissingOrgError,
} from './automation-i18n';
import type {
  TaskAutomationOverridePayload,
  TaskAutomationRulesOverviewDto,
} from './task-automation.types';

export function useTaskAutomationCenter(orgId: string | null, locale = DEFAULT_PRODUCT_LOCALE) {
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
      setError(parseTaskAutomationApiError(locale, e));
    } finally {
      setLoading(false);
    }
  }, [orgId, locale]);

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
        const message = parseTaskAutomationApiError(locale, e);
        setError(message);
        throw e;
      } finally {
        setActionRuleId(null);
      }
    },
    [load, locale],
  );

  const saveOverride = useCallback(
    (ruleId: string, payload: TaskAutomationOverridePayload) => {
      if (!orgId) return Promise.reject(new Error(taskAutomationMissingOrgError(locale)));
      return runAction(ruleId, () => api.taskAutomation.upsertOverride(orgId, ruleId, payload));
    },
    [orgId, runAction, locale],
  );

  const resetOverride = useCallback(
    (ruleId: string, expectedVersion?: number) => {
      if (!orgId) return Promise.reject(new Error(taskAutomationMissingOrgError(locale)));
      return runAction(ruleId, () =>
        api.taskAutomation.resetOverride(orgId, ruleId, expectedVersion),
      );
    },
    [orgId, runAction, locale],
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
