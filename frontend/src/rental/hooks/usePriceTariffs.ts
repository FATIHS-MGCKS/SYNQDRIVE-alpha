import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { PriceTariffCatalog } from '../pricing/pricingTypes';
import { parseApiError } from '../pricing/pricingUtils';

export function usePriceTariffs(orgId: string | null | undefined) {
  const [catalog, setCatalog] = useState<PriceTariffCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId) {
      setCatalog(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = (await api.pricing.catalog(orgId)) as PriceTariffCatalog;
      setCatalog(data);
    } catch (e: unknown) {
      setError(parseApiError(e));
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { catalog, loading, error, reload, setCatalog };
}
