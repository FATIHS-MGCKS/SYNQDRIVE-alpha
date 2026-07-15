import { useCallback, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import { mapBillingLoadError } from './billing-load.utils';

export function useBillingPaymentMethodActions(orgId: string | undefined, canWrite: boolean) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setDefault = useCallback(
    async (paymentMethodId: string) => {
      if (!orgId || !canWrite) return false;
      setLoadingId(paymentMethodId);
      setError(null);
      try {
        await api.billing.orgPaymentMethodSetDefault(orgId, paymentMethodId);
        return true;
      } catch (caught) {
        setError(mapBillingLoadError(caught));
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [canWrite, orgId],
  );

  const detach = useCallback(
    async (paymentMethodId: string) => {
      if (!orgId || !canWrite) return false;
      setLoadingId(paymentMethodId);
      setError(null);
      try {
        await api.billing.orgPaymentMethodDetach(orgId, paymentMethodId);
        return true;
      } catch (caught) {
        setError(getErrorMessage(caught, 'Zahlungsmethode konnte nicht entfernt werden.'));
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [canWrite, orgId],
  );

  return {
    loadingId,
    error,
    clearError: () => setError(null),
    setDefault,
    detach,
    canWrite,
  };
}
