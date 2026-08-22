import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  CommunicationConversationListItem,
  CommunicationConversationSummary,
} from '../../../lib/communication/types';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';
import {
  DASHBOARD_COMMUNICATION_ROW_LIMIT,
  dashboardCommunicationNeedsAttention,
} from '../communication-center/communication-dashboard-priority';

interface UseCommunicationDashboardOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
  refreshSignal?: string | null;
}

export function useCommunicationDashboard({
  orgId,
  enabled = true,
  refreshSignal = null,
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
    setRows([]);

    let summaryResult: CommunicationConversationSummary | null = null;
    let summarySucceeded = false;

    try {
      summaryResult = await api.communication.getConversationSummary(requestOrgId);
      if (!isCurrent(requestOrgId, generation)) return;
      summarySucceeded = true;
      setSummary(summaryResult);
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setSummaryError(getErrorMessage(err, 'Could not load communication summary.'));
      setSummary(null);
    } finally {
      if (isCurrent(requestOrgId, generation)) {
        setSummaryLoading(false);
      }
    }

    if (!isCurrent(requestOrgId, generation)) return;

    const shouldShortCircuitPreview =
      summarySucceeded && !dashboardCommunicationNeedsAttention(summaryResult);

    if (shouldShortCircuitPreview) {
      setRows([]);
      setListLoading(false);
      return;
    }

    try {
      const preview = await api.communication.getAttentionPreview(requestOrgId, {
        limit: DASHBOARD_COMMUNICATION_ROW_LIMIT,
      });
      if (!isCurrent(requestOrgId, generation)) return;
      setRows(preview.items);
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setListError(getErrorMessage(err, 'Could not load communication conversations.'));
      setRows([]);
    } finally {
      if (isCurrent(requestOrgId, generation)) {
        setListLoading(false);
      }
    }
  }, [enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

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
