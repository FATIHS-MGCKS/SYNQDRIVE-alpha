import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage, type SmsConfig } from '../../../lib/api';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';

interface UseSmsSettingsOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export function useSmsSettings({ orgId, enabled = true }: UseSmsSettingsOptions) {
  const { isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setConfig(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setLoading(true);
    setError(null);

    try {
      const result = await api.sms.getConfig(requestOrgId);
      if (!isCurrent(requestOrgId, generation)) return;
      setConfig(result);
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setError(getErrorMessage(err, 'Could not load SMS configuration.'));
      setConfig(null);
    } finally {
      if (isCurrent(requestOrgId, generation)) {
        setLoading(false);
      }
    }
  }, [enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    config,
    loading,
    error,
    reload: load,
  };
}
