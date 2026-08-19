import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PRODUCT_LOCALE } from '../../../i18n/locales';
import { api } from '../../../lib/api';
import type { WorkflowListItemDto } from '../../../lib/api';
import {
  workflowMissingOrgError,
  workflowRuntimeApiError,
} from './automation-i18n';
import type { WorkflowRuntimeStats } from './workflow-runtime.types';

export function useWorkflowRuntimeCenter(orgId: string | null, locale = DEFAULT_PRODUCT_LOCALE) {
  const [items, setItems] = useState<WorkflowListItemDto[]>([]);
  const [stats, setStats] = useState<WorkflowRuntimeStats>({
    total: 0,
    active: 0,
    inactive: 0,
    draft: 0,
    archived: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionWorkflowId, setActionWorkflowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setItems([]);
      setStats({ total: 0, active: 0, inactive: 0, draft: 0, archived: 0 });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.workflows.list(orgId, { includeArchived: true, includeSystem: true }),
        api.workflows.stats(orgId),
      ]);
      setItems(listRes);
      setStats({
        total: statsRes.total,
        active: statsRes.active,
        inactive: statsRes.disabled,
        draft: statsRes.draft,
        archived: statsRes.archived ?? 0,
      });
    } catch (e: unknown) {
      setError(workflowRuntimeApiError(locale, e));
    } finally {
      setLoading(false);
    }
  }, [orgId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async <T,>(workflowId: string, action: () => Promise<T>): Promise<T> => {
      setActionWorkflowId(workflowId);
      setError(null);
      try {
        const result = await action();
        await load();
        return result;
      } catch (e: unknown) {
        const message = workflowRuntimeApiError(locale, e);
        setError(message);
        throw e;
      } finally {
        setActionWorkflowId(null);
      }
    },
    [load, locale],
  );

  const toggleWorkflow = useCallback(
    (workflowId: string, activationReason?: string) => {
      if (!orgId) return Promise.reject(new Error(workflowMissingOrgError(locale)));
      return runAction(workflowId, () =>
        api.workflows.toggle(orgId, workflowId, activationReason ? { activationReason } : undefined),
      );
    },
    [orgId, runAction, locale],
  );

  const duplicateWorkflow = useCallback(
    (workflowId: string) => {
      if (!orgId) return Promise.reject(new Error(workflowMissingOrgError(locale)));
      return runAction(workflowId, () => api.workflows.duplicate(orgId, workflowId));
    },
    [orgId, runAction, locale],
  );

  const archiveWorkflow = useCallback(
    (workflowId: string) => {
      if (!orgId) return Promise.reject(new Error(workflowMissingOrgError(locale)));
      return runAction(workflowId, () => api.workflows.remove(orgId, workflowId));
    },
    [orgId, runAction, locale],
  );

  return {
    items,
    stats,
    loading,
    error,
    actionWorkflowId,
    reload: load,
    toggleWorkflow,
    duplicateWorkflow,
    archiveWorkflow,
  };
}
