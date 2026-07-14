import { useCallback, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type { ConnectStatusDto } from '../../types/payments-connect.types';
import { extractConnectErrorCode, formatConnectReturnUrl } from './payments-connect.utils';

export function usePaymentsConnectActions(
  orgId: string | undefined,
  canManage: boolean,
  onStatusUpdate?: (status: ConnectStatusDto) => void,
) {
  const [actionLoading, setActionLoading] = useState<'setup' | 'onboarding' | 'refresh' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const createAccount = useCallback(async (): Promise<ConnectStatusDto | null> => {
    if (!orgId || !canManage) return null;
    setActionLoading('setup');
    setActionError(null);
    try {
      const status = await api.paymentsConnect.createAccount(orgId);
      onStatusUpdate?.(status);
      return status;
    } catch (err) {
      setActionError(getErrorMessage(err, 'Account setup failed'));
      return null;
    } finally {
      setActionLoading(null);
    }
  }, [orgId, canManage, onStatusUpdate]);

  const startOnboarding = useCallback(async (): Promise<boolean> => {
    if (!orgId || !canManage) return false;
    setActionLoading('onboarding');
    setActionError(null);
    try {
      const returnUrl = formatConnectReturnUrl();
      const link = await api.paymentsConnect.createOnboardingLink(orgId, { returnUrl });
      if (link?.url) {
        window.location.assign(link.url);
        return true;
      }
      setActionError('Onboarding link could not be created');
      return false;
    } catch (err) {
      const code = extractConnectErrorCode(err);
      if (code === 'CONNECT_ACCOUNT_RESTRICTED') {
        setActionError(getErrorMessage(err, 'Account is restricted'));
      } else {
        setActionError(getErrorMessage(err, 'Onboarding link could not be created'));
      }
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [orgId, canManage]);

  const refreshStatus = useCallback(async (): Promise<ConnectStatusDto | null> => {
    if (!orgId || !canManage) return null;
    setActionLoading('refresh');
    setActionError(null);
    try {
      const status = await api.paymentsConnect.refresh(orgId);
      onStatusUpdate?.(status);
      return status;
    } catch (err) {
      setActionError(getErrorMessage(err, 'Status sync failed'));
      return null;
    } finally {
      setActionLoading(null);
    }
  }, [orgId, canManage, onStatusUpdate]);

  const setupAndOnboard = useCallback(async () => {
    const created = await createAccount();
    if (!created) return false;
    return startOnboarding();
  }, [createAccount, startOnboarding]);

  return {
    actionLoading,
    actionError,
    clearActionError: () => setActionError(null),
    createAccount,
    startOnboarding,
    refreshStatus,
    setupAndOnboard,
  };
}
