import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns/page-header';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { useRentalOrg } from '../../RentalContext';
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
import { BillingSectionTabBar, type BillingSectionTab } from './BillingSectionTabBar';
import { CustomerPaymentsTab } from './CustomerPaymentsTab';
import { useBillingSubscriptionOverview } from './useBillingSubscriptionOverview';
import { useBillingVehicleBilling } from './useBillingVehicleBilling';
import { useBillingInvoices } from './useBillingInvoices';
import { useBillingPaymentMethods } from './useBillingPaymentMethods';

function readInitialBillingSection(): BillingSectionTab {
  if (typeof window === 'undefined') return 'subscription';
  const params = new URLSearchParams(window.location.search);
  return params.get('billingSection') === 'customer-payments'
    ? 'customer-payments'
    : 'subscription';
}

function BillingSectionError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <ErrorState
      title={title}
      description={description}
      onRetry={() => void onRetry()}
      retryLabel="Erneut versuchen"
    />
  );
}

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
  const [section, setSection] = useState<BillingSectionTab>(readInitialBillingSection);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);

  const overview = useBillingSubscriptionOverview(orgId);
  const vehicles = useBillingVehicleBilling(orgId);
  const invoices = useBillingInvoices(orgId);
  const paymentMethods = useBillingPaymentMethods(orgId);

  const summary = overview.summary;
  const stripeState = useMemo(
    () =>
      getBillingStripeUiState({
        stripeConfigured: paymentMethods.data?.configured ?? summary?.stripeConfigured,
        stripePortalPrepared: summary?.stripePortalPrepared,
      }),
    [paymentMethods.data?.configured, summary],
  );
  const stripeActions = useBillingStripeActions(orgId, stripeState);

  const paymentMethodSummary = useMemo(() => {
    const defaultMethod = paymentMethods.data?.paymentMethods.find((method) => method.isDefault);
    return {
      exists: Boolean(defaultMethod),
      type: defaultMethod?.type,
      brand: defaultMethod?.brand,
      last4: defaultMethod?.last4,
      status: defaultMethod?.billingState,
    };
  }, [paymentMethods.data]);

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
        <BillingSectionError
          title="Organisation konnte nicht bestimmt werden"
          description="Bitte Organisation neu laden oder erneut anmelden."
          onRetry={() => void overview.reload()}
        />
      </div>
    );
  }

  const headerBadge = summary
    ? headerBadgeFromSummary(summary.subscriptionStatus, summary.calculationStatus)
    : null;

  const reloadAll = () =>
    Promise.allSettled([
      overview.reload(),
      vehicles.reloadAll(),
      invoices.reload(),
      paymentMethods.reload(),
    ]);

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
          <Button type="button" variant="outline" size="sm" onClick={() => void reloadAll()}>
            Aktualisieren
          </Button>
        }
      />

      <BillingSectionTabBar activeTab={section} onTabChange={setSection} />

      {section === 'customer-payments' ? (
        <CustomerPaymentsTab />
      ) : (
        <>
          {overview.loading ? (
            <BillingLoadingSkeleton />
          ) : overview.error ? (
            <BillingSectionError
              title="Abo-Übersicht konnte nicht geladen werden"
              description={overview.error}
              onRetry={overview.reload}
            />
          ) : summary ? (
            <BillingStatusHero summary={summary} stripeState={stripeState} />
          ) : (
            <EmptyState
              icon={<Icon name="credit-card" className="w-5 h-5" />}
              title="Kein aktives Abo"
              description="Für diese Organisation sind noch keine Abrechnungsdaten verfügbar."
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-4">
            <div className="space-y-4">
              {overview.error ? null : overview.loading ? (
                <SkeletonCard className="h-72 rounded-2xl" />
              ) : summary ? (
                <>
                  <BillingSubscriptionCard
                    summary={summary}
                    onShowVehicles={() => setVehiclesOpen(true)}
                  />
                  <BillingPriceTierLadder
                    tiers={summary.priceTiers ?? []}
                    currency={summary.priceBook?.currency ?? 'EUR'}
                    currentTierId={summary.currentTier?.id ?? null}
                  />
                </>
              ) : null}
            </div>

            <div>
              {paymentMethods.loading ? (
                <SkeletonCard className="h-72 rounded-2xl" />
              ) : paymentMethods.error ? (
                <BillingSectionError
                  title="Zahlungsmethoden konnten nicht geladen werden"
                  description={paymentMethods.error}
                  onRetry={paymentMethods.reload}
                />
              ) : (
                <BillingPaymentMethodCard
                  paymentMethod={paymentMethodSummary}
                  stripeState={stripeState}
                  canUseStripePayments={stripeActions.canUseStripePayments}
                  onOpenPortal={() => void stripeActions.openCustomerPortal()}
                  portalLoading={stripeActions.loading}
                  portalError={stripeActions.error}
                />
              )}
            </div>
          </div>

          <BillingInvoiceSection
            invoices={invoices.invoices}
            loading={invoices.loading}
            error={invoices.error}
            meta={invoices.meta}
            query={invoices.query}
            onQueryChange={invoices.setQuery}
            onRetry={invoices.reload}
          />

          <BillableVehiclesDrawer
            open={vehiclesOpen}
            onOpenChange={setVehiclesOpen}
            data={vehicles.billableVehicles}
            licenseHistory={vehicles.vehicleLicenses?.data ?? []}
            licenseHistoryError={vehicles.licensesError}
            onReloadLicenses={vehicles.reloadLicenses}
          />
        </>
      )}
    </div>
  );
}
