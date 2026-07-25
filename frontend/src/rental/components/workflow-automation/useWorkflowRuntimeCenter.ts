import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { WorkflowListItemDto } from '../../../lib/api';
import type { WorkflowRuntimeStats } from './workflow-runtime.types';
import { parseApiError } from './workflow-runtime.utils';

export function useWorkflowRuntimeCenter(orgId: string | null) {
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
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

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
        const message = parseApiError(e);
        setError(message);
        throw e;
      } finally {
        setActionWorkflowId(null);
      }
    },
    [load],
  );

  const toggleWorkflow = useCallback(
    (workflowId: string, activationReason?: string) => {
      if (!orgId) return Promise.reject(new Error('Organization missing'));
      return runAction(workflowId, () =>
        api.workflows.toggle(orgId, workflowId, activationReason ? { activationReason } : undefined),
      );
    },
    [orgId, runAction],
  );

  const duplicateWorkflow = useCallback(
    (workflowId: string) => {
      if (!orgId) return Promise.reject(new Error('Organization missing'));
      return runAction(workflowId, () => api.workflows.duplicate(orgId, workflowId));
    },
    [orgId, runAction],
  );

  const archiveWorkflow = useCallback(
    (workflowId: string) => {
      if (!orgId) return Promise.reject(new Error('Organization missing'));
      return runAction(workflowId, () => api.workflows.remove(orgId, workflowId));
    },
    [orgId, runAction],
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
