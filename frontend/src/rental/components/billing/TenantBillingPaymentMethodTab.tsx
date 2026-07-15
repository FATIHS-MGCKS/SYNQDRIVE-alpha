import { BillingPaymentMethodCard } from './BillingPaymentMethodCard';
import { ErrorState, SkeletonCard } from '../../../components/patterns/states';
import type { BillingStripeUiState } from './billing-stripe-ui';

interface TenantBillingPaymentMethodTabProps {
  paymentMethod: {
    exists: boolean;
    type?: string;
    brand?: string | null;
    last4?: string | null;
    status?: string;
  };
  stripeState: BillingStripeUiState;
  canUseStripePayments: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenPortal: () => void;
  portalLoading: boolean;
  portalError: string | null;
}

export function TenantBillingPaymentMethodTab({
  paymentMethod,
  stripeState,
  canUseStripePayments,
  loading,
  error,
  onRetry,
  onOpenPortal,
  portalLoading,
  portalError,
}: TenantBillingPaymentMethodTabProps) {
  if (loading) return <SkeletonCard className="h-72 rounded-2xl" />;
  if (error) {
    return (
      <ErrorState
        title="Zahlungsmethode konnte nicht geladen werden"
        description={error}
        onRetry={() => void onRetry()}
        retryLabel="Erneut versuchen"
      />
    );
  }

  return (
    <div data-testid="tenant-payment-method-tab">
      <BillingPaymentMethodCard
        paymentMethod={paymentMethod}
        stripeState={stripeState}
        canUseStripePayments={canUseStripePayments}
        onOpenPortal={onOpenPortal}
        portalLoading={portalLoading}
        portalError={portalError}
      />
    </div>
  );
}
