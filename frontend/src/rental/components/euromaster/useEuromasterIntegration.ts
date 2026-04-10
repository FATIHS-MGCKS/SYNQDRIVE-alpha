import { useState, useEffect, useCallback } from 'react';
import { api, type EuromasterAccessInfo } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';

export interface EuromasterState {
  access: EuromasterAccessInfo | null;
  loading: boolean;
  error: string | null;
  canCreateCase: boolean;
  modeSummary: string;
  refresh: () => void;
}

const EMPTY_ACCESS: EuromasterAccessInfo = {
  enabled: false,
  assigned: false,
  liveApiEnabled: false,
  manualMode: false,
  dataAuthGranted: false,
  grantedScopes: [],
  mode: 'disabled',
};

export function useEuromasterIntegration(): EuromasterState {
  const { orgId } = useRentalOrg();
  const [access, setAccess] = useState<EuromasterAccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccess = useCallback(async () => {
    if (!orgId) {
      setAccess(EMPTY_ACCESS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.servicePartners.euromasterAccess(orgId);
      setAccess(data);
    } catch (err: any) {
      setAccess(EMPTY_ACCESS);
      setError(err?.message ?? 'Failed to check Euromaster access');
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchAccess(); }, [fetchAccess]);

  const canCreateCase = !!(access?.enabled && access.assigned && access.dataAuthGranted);

  const modeSummary =
    !access?.enabled ? 'Disabled' :
    !access.assigned ? 'Not assigned' :
    !access.dataAuthGranted ? 'Authorization required' :
    access.liveApiEnabled ? 'Active' :
    access.manualMode ? 'Manual only' : 'Active';

  return { access, loading, error, canCreateCase, modeSummary, refresh: fetchAccess };
}
