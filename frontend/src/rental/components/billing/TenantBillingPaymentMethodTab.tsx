import { ErrorState, SkeletonCard } from '../../../components/patterns/states';
import type { TenantPaymentMethodDto } from '../../types/billing.types';
import type { BillingStripeUiState } from './billing-stripe-ui';
import { TenantPaymentMethodsSection } from './TenantPaymentMethodsSection';
import { useBillingPaymentMethodActions } from './useBillingPaymentMethodActions';

interface TenantBillingPaymentMethodTabProps {
  orgId: string | undefined;
  paymentMethods: TenantPaymentMethodDto[];
  stripeState: BillingStripeUiState;
  canUseStripePayments: boolean;
  canWrite: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenPortal: () => void;
  portalLoading: boolean;
  portalError: string | null;
  onChanged: () => void;
}

export function TenantBillingPaymentMethodTab({
  orgId,
  paymentMethods,
  stripeState,
  canUseStripePayments,
  canWrite,
  loading,
  error,
  onRetry,
  onOpenPortal,
  portalLoading,
  portalError,
  onChanged,
}: TenantBillingPaymentMethodTabProps) {
  const actions = useBillingPaymentMethodActions(orgId, canWrite);

  if (loading) return <SkeletonCard className="h-72 rounded-2xl" />;
  if (error) {
    return (
      <ErrorState
        title="Zahlungsmethoden konnten nicht geladen werden"
        description={error}
        onRetry={() => void onRetry()}
        retryLabel="Erneut versuchen"
      />
    );
  }

  return (
    <div data-testid="tenant-payment-method-tab">
      <TenantPaymentMethodsSection
        paymentMethods={paymentMethods}
        stripeState={stripeState}
        canUseStripePayments={canUseStripePayments && canWrite}
        canWrite={canWrite}
        loadingId={actions.loadingId}
        actionError={actions.error}
        portalLoading={portalLoading}
        portalError={portalError}
        onOpenPortal={onOpenPortal}
        onSetDefault={async (paymentMethodId) => {
          const ok = await actions.setDefault(paymentMethodId);
          if (ok) onChanged();
        }}
        onDetach={async (paymentMethodId) => {
          const ok = await actions.detach(paymentMethodId);
          if (ok) onChanged();
        }}
      />
    </div>
  );
}
