import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { PriceTariffCatalog } from '../pricing/pricingTypes';
import { parseApiError } from '../pricing/pricingUtils';

export function usePriceTariffs(orgId: string | null | undefined) {
  const [catalog, setCatalog] = useState<PriceTariffCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<PriceTariffCatalog | null> => {
    if (!orgId) {
      setCatalog(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = (await api.pricing.catalog(orgId)) as PriceTariffCatalog;
      setCatalog(data);
      return data;
    } catch (e: unknown) {
      setError(parseApiError(e));
      setCatalog(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { catalog, loading, error, reload, setCatalog };
}
