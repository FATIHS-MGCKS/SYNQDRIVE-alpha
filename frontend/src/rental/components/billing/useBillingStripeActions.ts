import { useCallback, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type { StripePortalActionError } from '../../lib/rental-tenant-billing-i18n';
import type { BillingStripeUiState } from './billing-stripe-ui';

export function useBillingStripeActions(
  orgId: string | undefined,
  stripeState: BillingStripeUiState,
  canWrite = false,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StripePortalActionError | null>(null);

  const canUseStripePayments = stripeState === 'configured' && Boolean(orgId) && canWrite;

  const openCustomerPortal = useCallback(async () => {
    if (!orgId || !canUseStripePayments) return;
    setLoading(true);
    setError(null);
    try {
      const returnUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}?settingsTab=billing`
          : undefined;
      const res = (await api.billing.orgStripeCustomerPortal(orgId, returnUrl)) as {
        url?: string;
        status?: string;
        message?: string;
      };
      if (res?.url) {
        window.location.assign(res.url);
        return;
      }
      setError({ kind: 'host', code: 'openFailed' });
    } catch (e) {
      const msg = getErrorMessage(e, '');
      const lower = msg.toLowerCase();
      if (
        lower.includes('not_configured') ||
        lower.includes('not configured') ||
        lower.includes('501')
      ) {
        setError({ kind: 'host', code: 'notConfigured' });
      } else {
        setError({ kind: 'host', code: 'openFailed' });
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, canUseStripePayments]);

  return {
    canUseStripePayments,
    openCustomerPortal,
    loading,
    error,
    clearError: () => setError(null),
  };
}
