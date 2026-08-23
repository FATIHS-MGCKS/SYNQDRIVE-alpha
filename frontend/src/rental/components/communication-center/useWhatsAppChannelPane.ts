import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage, type WhatsAppStats, type WhatsAppTemplate } from '../../../lib/api';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';

interface UseWhatsAppChannelPaneOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export function useWhatsAppChannelPane({ orgId, enabled = true }: UseWhatsAppChannelPaneOptions) {
  const { isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setStats(null);
      setTemplates([]);
      setStatsLoading(false);
      setTemplatesLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setStatsLoading(true);
    setTemplatesLoading(true);
    setStatsError(null);
    setTemplatesError(null);

    const statsPromise = api.whatsapp
      .getStats(requestOrgId)
      .then((result) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setStats(result);
      })
      .catch((err) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setStatsError(getErrorMessage(err));
      })
      .finally(() => {
        if (isCurrent(requestOrgId, generation)) setStatsLoading(false);
      });

    const templatesPromise = api.whatsapp
      .listTemplates(requestOrgId)
      .then((result) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setTemplates(result ?? []);
      })
      .catch((err) => {
        if (!isCurrent(requestOrgId, generation)) return;
        setTemplatesError(getErrorMessage(err));
      })
      .finally(() => {
        if (isCurrent(requestOrgId, generation)) setTemplatesLoading(false);
      });

    await Promise.all([statsPromise, templatesPromise]);
  }, [enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    stats,
    templates,
    statsLoading,
    templatesLoading,
    statsError,
    templatesError,
    reload: load,
  };
}
