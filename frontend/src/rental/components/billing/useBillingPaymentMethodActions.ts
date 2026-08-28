import { useCallback, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type { PaymentMethodActionError } from '../../lib/rental-tenant-billing-i18n';
import { mapBillingLoadError } from './billing-load.utils';

export function useBillingPaymentMethodActions(orgId: string | undefined, canWrite: boolean) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<PaymentMethodActionError | null>(null);

  const setDefault = useCallback(
    async (paymentMethodId: string) => {
      if (!orgId || !canWrite) return false;
      setLoadingId(paymentMethodId);
      setError(null);
      try {
        await api.billing.orgPaymentMethodSetDefault(orgId, paymentMethodId);
        return true;
      } catch (caught) {
        setError({ source: 'setDefault', message: mapBillingLoadError(caught) });
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
        const message = getErrorMessage(caught, '').trim();
        setError(
          message
            ? { source: 'detach', error: { kind: 'raw', message } }
            : { source: 'detach', error: { kind: 'host', code: 'detachFailed' } },
        );
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
