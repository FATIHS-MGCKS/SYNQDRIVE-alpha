import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns/page-header';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { useRentalOrg } from '../../RentalContext';
import { useBillingData } from './useBillingData';
import { BillingStatusHero } from './BillingStatusHero';
import { BillingSubscriptionCard } from './BillingSubscriptionCard';
import { BillingPriceTierLadder } from './BillingPriceTierLadder';
import { BillingPaymentMethodCard } from './BillingPaymentMethodCard';
import { BillingInvoiceSection } from './BillingInvoiceSection';
import { BillableVehiclesDrawer } from './BillableVehiclesDrawer';
import { headerBadgeFromSummary } from './billing.utils';
import { getBillingStripeUiState } from './billing-stripe-ui';
import { useBillingStripeActions } from './useBillingStripeActions';
import { Icon } from '../ui/Icon';

function BillingLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-4">
        <SkeletonCard className="h-72 rounded-2xl" />
        <SkeletonCard className="h-72 rounded-2xl" />
      </div>
      <SkeletonCard className="h-56 rounded-2xl" />
    </div>
  );
}

export function BillingTab() {
  const { orgId, hasPermission, loading: orgLoading } = useRentalOrg();
  const canRead = hasPermission('billing', 'read');
  const { summary, invoices, billableVehicles, loading, error, reload } = useBillingData(orgId);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);

  const stripeState = useMemo(
    () => getBillingStripeUiState(summary),
    [summary],
  );
  const stripeActions = useBillingStripeActions(orgId, stripeState);

  if (orgLoading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4 p-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SkeletonCard className="h-10 w-56" />
        <BillingLoadingSkeleton />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="max-w-[1200px] mx-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <EmptyState
          icon={<Icon name="lock" className="w-5 h-5" />}
          title="Kein Zugriff auf Abrechnung"
          description="Du benötigst Leseberechtigung für das Modul Abrechnung."
        />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="max-w-[1200px] mx-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Abrechnung & Abo" />
        <ErrorState
          title="Organisation konnte nicht bestimmt werden"
          description="Bitte Organisation neu laden oder erneut anmelden."
          onRetry={() => void reload()}
          retryLabel="Erneut versuchen"
        />
      </div>
    );
  }

  const headerBadge = summary
    ? headerBadgeFromSummary(summary.subscriptionStatus, summary.calculationStatus)
    : null;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <PageHeader
        title="Abrechnung & Abo"
        status={
          headerBadge ? (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${headerBadge.tone}`}
            >
              {headerBadge.label}
            </span>
          ) : undefined
        }
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void reload()}
          >
            Aktualisieren
          </Button>
        }
      />

      {loading ? (
        <BillingLoadingSkeleton />
      ) : error ? (
        <ErrorState
          title="Abrechnung konnte nicht geladen werden"
          description={error}
          onRetry={() => void reload()}
          retryLabel="Erneut versuchen"
        />
      ) : summary ? (
        <>
          <BillingStatusHero summary={summary} stripeState={stripeState} />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-4">
            <div className="space-y-4">
              <BillingSubscriptionCard
                summary={summary}
                onShowVehicles={() => setVehiclesOpen(true)}
              />
              <BillingPriceTierLadder
                tiers={summary.priceTiers ?? []}
                currency={summary.priceBook?.currency ?? 'EUR'}
                currentTierId={summary.currentTier?.id ?? null}
              />
            </div>
            <BillingPaymentMethodCard
              paymentMethod={summary.paymentMethod}
              stripeState={stripeState}
              canUseStripePayments={stripeActions.canUseStripePayments}
              onOpenPortal={() => void stripeActions.openCustomerPortal()}
              portalLoading={stripeActions.loading}
              portalError={stripeActions.error}
            />
          </div>

          <BillingInvoiceSection invoices={invoices} />

          <BillableVehiclesDrawer
            open={vehiclesOpen}
            onOpenChange={setVehiclesOpen}
            data={billableVehicles}
          />
        </>
      ) : (
        <EmptyState
          icon={<Icon name="credit-card" className="w-5 h-5" />}
          title="Kein aktives Abo"
          description="Für diese Organisation sind noch keine Abrechnungsdaten verfügbar."
        />
      )}
    </div>
  );
}
