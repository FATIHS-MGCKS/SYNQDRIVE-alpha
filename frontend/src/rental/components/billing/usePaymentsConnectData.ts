import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type { ConnectStatusDto } from '../../types/payments-connect.types';
import { extractConnectErrorCode } from './payments-connect.utils';

export function usePaymentsConnectData(orgId: string | undefined, enabled: boolean) {
  const [status, setStatus] = useState<ConnectStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ReturnType<typeof extractConnectErrorCode>>(null);

  const reload = useCallback(async () => {
    if (!orgId || !enabled) {
      setStatus(null);
      setError(null);
      setErrorCode(null);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await api.paymentsConnect.getStatus(orgId);
      setStatus(data);
    } catch (err) {
      const code = extractConnectErrorCode(err);
      setErrorCode(code);
      if (code === 'CONNECT_NOT_CONFIGURED') {
        setStatus(null);
        setError(null);
      } else if (code === 'PAYMENTS_FEATURE_DISABLED') {
        setStatus(null);
        setError(null);
      } else {
        setStatus(null);
        setError(getErrorMessage(err, 'Status could not be loaded'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, loading, error, errorCode, reload, setStatus };
}
