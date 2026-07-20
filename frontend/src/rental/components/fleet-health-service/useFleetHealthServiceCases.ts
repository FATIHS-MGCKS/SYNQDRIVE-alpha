import { useCallback, useEffect, useState } from 'react';
import { api, type ApiServiceCase } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';

export function useFleetHealthServiceCases(orgId: string | null | undefined) {
  const { t } = useLanguage();
  const [serviceCases, setServiceCases] = useState<ApiServiceCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) {
      setServiceCases([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.serviceCases.list(orgId);
      setServiceCases(Array.isArray(res) ? res : []);
    } catch {
      setServiceCases([]);
      setError(t('fleetHealthService.error.serviceCases'));
    }
    setLoading(false);
  }, [orgId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { serviceCases, loading, error, reload };
}
