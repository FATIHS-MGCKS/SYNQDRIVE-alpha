import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type {
  AdminBillingOverviewDto,
  AdminOrgBillingRowDto,
} from '../../types/admin-billing.types';

export function useAdminBillingCore() {
  const [overview, setOverview] = useState<AdminBillingOverviewDto | null>(null);
  const [organizations, setOrganizations] = useState<AdminOrgBillingRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, orgsRes] = await Promise.all([
        api.billing.overview(),
        api.billing.organizations(),
      ]);
      setOverview(overviewRes as AdminBillingOverviewDto);
      setOrganizations(orgsRes as AdminOrgBillingRowDto[]);
    } catch (e) {
      setError((e as Error).message || 'Billing-Daten konnten nicht geladen werden');
      setOverview(null);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, organizations, loading, error, reload: load };
}
