import { useCallback, useEffect, useState } from 'react';
import { api, type ApiServiceCase } from '../../../lib/api';

export function useFleetHealthServiceCaseDetail(input: {
  orgId: string | null;
  serviceCaseId: string | null;
  open: boolean;
  initialCase?: ApiServiceCase | null;
}) {
  const { orgId, serviceCaseId, open, initialCase } = input;
  const [serviceCase, setServiceCase] = useState<ApiServiceCase | null>(initialCase ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !serviceCaseId || !open) {
      setServiceCase(initialCase ?? null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const detail = await api.serviceCases.get(orgId, serviceCaseId);
      setServiceCase(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Servicefall konnte nicht geladen werden.');
      setServiceCase(initialCase ?? null);
    } finally {
      setLoading(false);
    }
  }, [orgId, serviceCaseId, open, initialCase]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (initialCase && initialCase.id === serviceCaseId) {
      setServiceCase((prev) => (prev?.id === initialCase.id ? prev : initialCase));
    }
  }, [initialCase, serviceCaseId]);

  return {
    serviceCase,
    loading,
    error,
    reload: load,
    setServiceCase,
  };
}
