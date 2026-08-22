import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  CommunicationConversationListItem,
  CommunicationConversationSummary,
} from '../../../lib/communication/types';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';
import {
  DASHBOARD_COMMUNICATION_CANDIDATE_LIMIT,
  DASHBOARD_COMMUNICATION_ROW_LIMIT,
  dashboardCommunicationNeedsAttention,
  prioritizeDashboardConversations,
} from '../communication-center/communication-dashboard-priority';

interface UseCommunicationDashboardOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export function useCommunicationDashboard({
  orgId,
  enabled = true,
}: UseCommunicationDashboardOptions) {
  const { isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [summary, setSummary] = useState<CommunicationConversationSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [rows, setRows] = useState<CommunicationConversationListItem[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setSummary(null);
      setRows([]);
      setSummaryError(null);
      setListError(null);
      setSummaryLoading(false);
      setListLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setSummaryLoading(true);
    setListLoading(true);
    setSummaryError(null);
    setListError(null);

    const summaryPromise = api.communication
      .getConversationSummary(requestOrgId)
      .then((result) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setSummary(result);
      })
      .catch((err) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setSummaryError(getErrorMessage(err, 'Could not load communication summary.'));
        setSummary(null);
      })
      .finally(() => {
        if (isCurrent(requestOrgId, generation)) {
          setSummaryLoading(false);
        }
      });

    const listPromise = api.communication
      .listConversations(requestOrgId, { limit: DASHBOARD_COMMUNICATION_CANDIDATE_LIMIT })
      .then((result) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setRows(
          prioritizeDashboardConversations(
            result.items,
            DASHBOARD_COMMUNICATION_ROW_LIMIT,
          ),
        );
      })
      .catch((err) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setListError(getErrorMessage(err, 'Could not load communication conversations.'));
        setRows([]);
      })
      .finally(() => {
        if (isCurrent(requestOrgId, generation)) {
          setListLoading(false);
        }
      });

    await Promise.allSettled([summaryPromise, listPromise]);
  }, [enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = summaryLoading || listLoading;
  const needsAttention = useMemo(() => dashboardCommunicationNeedsAttention(summary), [summary]);

  return {
    summary,
    rows,
    loading,
    summaryLoading,
    listLoading,
    summaryError,
    listError,
    needsAttention,
    reload: load,
  };
}
