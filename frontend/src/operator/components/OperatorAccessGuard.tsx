import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorState } from '../../components/patterns';
import { api } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import { useRentalOrg } from '../../rental/RentalContext';
import { evaluateOperatorAccess, isRentalBusinessType } from '../lib/operatorAccess';
import { OperatorAccessDeniedScreen } from './OperatorAccessDeniedScreen';
import { OperatorAccessLoadingScreen } from './OperatorAccessLoadingScreen';

type OrgGateState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Auth + role gate (outside RentalProvider) and org/rental gate (inside).
 */
export function OperatorAccessGuard({ children }: { children: ReactNode }) {
  const access = evaluateOperatorAccess(getStoredUser());

  if (!access.allowed) {
    if (access.reason === 'unauthenticated') {
      return <Navigate to="/login" replace state={{ from: '/operator' }} />;
    }
    return <OperatorAccessDeniedScreen reason={access.reason} />;
  }

  return <OperatorOrgAccessGate>{children}</OperatorOrgAccessGate>;
}

function OperatorOrgAccessGate({ children }: { children: ReactNode }) {
  const { orgId, loading: orgLoading } = useRentalOrg();
  const [gateState, setGateState] = useState<OrgGateState>('idle');
  const [rentalAllowed, setRentalAllowed] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const verifyOrg = useCallback(async () => {
    if (!orgId) {
      setGateState('ready');
      setRentalAllowed(true);
      setProfileError(null);
      return;
    }
    setGateState('loading');
    setProfileError(null);
    try {
      const profile = await api.organizations.getProfile(orgId);
      setRentalAllowed(isRentalBusinessType(profile.businessType));
      setGateState('ready');
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Organisation konnte nicht geladen werden');
      setGateState('error');
    }
  }, [orgId]);

  useEffect(() => {
    if (orgLoading) return;
    void verifyOrg();
  }, [orgLoading, verifyOrg, retryKey]);

  if (orgLoading || gateState === 'idle' || gateState === 'loading') {
    return <OperatorAccessLoadingScreen label="Organisation laden…" />;
  }

  if (!orgId) {
    return <OperatorAccessDeniedScreen reason="no_organization" />;
  }

  if (gateState === 'error') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-5">
        <ErrorState
          compact
          title="Organisation nicht verfügbar"
          error={profileError}
          onRetry={() => setRetryKey((k) => k + 1)}
          retryLabel="Erneut versuchen"
        />
      </div>
    );
  }

  if (!rentalAllowed) {
    return <OperatorAccessDeniedScreen reason="no_rental_product" />;
  }

  return <>{children}</>;
}
