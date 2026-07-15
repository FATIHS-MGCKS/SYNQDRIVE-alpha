import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns/page-header';
import { Button } from '../../../components/ui/button';
import { EmptyState, SkeletonCard } from '../../../components/patterns/states';
import { useRentalOrg } from '../../RentalContext';
import { getBillingStripeUiState } from './billing-stripe-ui';
import { useBillingStripeActions } from './useBillingStripeActions';
import { Icon } from '../ui/Icon';
import { BillingSectionTabBar, type BillingSectionTab } from './BillingSectionTabBar';
import { CustomerPaymentsTab } from './CustomerPaymentsTab';
import { useBillingSubscriptionOverview } from './useBillingSubscriptionOverview';
import { useBillingTariffVehicles } from './useBillingTariffVehicles';
import { useBillingInvoices } from './useBillingInvoices';
import { useBillingPaymentMethods } from './useBillingPaymentMethods';
import { TenantSubscriptionTabBar } from './TenantSubscriptionTabBar';
import {
  buildTenantBillingSubTabSearch,
  readTenantBillingSubTab,
  type TenantSubscriptionSubTab,
} from './tenant-billing-navigation';
import { overviewHeaderBadge } from './tenant-billing-overview.utils';
import { TenantBillingOverviewTab } from './TenantBillingOverviewTab';
import { TenantBillingTariffVehiclesTab } from './TenantBillingTariffVehiclesTab';
import { TenantBillingAddOnsTab } from './TenantBillingAddOnsTab';
import { TenantBillingInvoicesTab } from './TenantBillingInvoicesTab';
import { TenantBillingPaymentMethodTab } from './TenantBillingPaymentMethodTab';

function readInitialBillingSection(): BillingSectionTab {
  if (typeof window === 'undefined') return 'subscription';
  const params = new URLSearchParams(window.location.search);
  return params.get('billingSection') === 'customer-payments'
    ? 'customer-payments'
    : 'subscription';
}

function syncBillingSubTabUrl(subTab: TenantSubscriptionSubTab) {
  const nextUrl = `${window.location.pathname}${buildTenantBillingSubTabSearch(subTab, window.location.search)}`;
  window.history.replaceState(null, '', nextUrl);
}

export function BillingTab() {
  const { orgId, hasPermission, loading: orgLoading } = useRentalOrg();
  const canRead = hasPermission('billing', 'read');
  const [section, setSection] = useState<BillingSectionTab>(readInitialBillingSection);
  const [subTab, setSubTab] = useState<TenantSubscriptionSubTab>(() =>
    readTenantBillingSubTab(window.location.search),
  );

  const overviewQuery = useBillingSubscriptionOverview(orgId);
  const tariffVehicles = useBillingTariffVehicles(orgId);
  const invoices = useBillingInvoices(orgId);
  const lastPaidInvoices = useBillingInvoices(orgId, { page: 1, pageSize: 1, status: 'PAID' });
  const paymentMethods = useBillingPaymentMethods(orgId);

  const overview = overviewQuery.overview;
  const summary = overviewQuery.summary;

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

  const navigateSubTab = (tab: TenantSubscriptionSubTab) => {
    setSubTab(tab);
    syncBillingSubTabUrl(tab);
  };

  useEffect(() => {
    if (section === 'subscription') {
      syncBillingSubTabUrl(subTab);
    }
  }, [section, subTab]);

  const headerBadge = overviewHeaderBadge(overview);

  const reloadAll = () =>
    Promise.allSettled([
      overviewQuery.reload(),
      tariffVehicles.reloadAll(),
      invoices.reload(),
      lastPaidInvoices.reload(),
      paymentMethods.reload(),
    ]);

  if (orgLoading) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4 p-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SkeletonCard className="h-10 w-56" />
        <SkeletonCard className="h-64 rounded-2xl" />
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
        <EmptyState title="Organisation konnte nicht bestimmt werden" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <PageHeader
        title="Abrechnung & Abo"
        status={
          headerBadge ? (
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${headerBadge.tone}`}
            >
              {overview?.contract?.statusLabel ?? headerBadge.label}
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
          <TenantSubscriptionTabBar activeTab={subTab} onTabChange={navigateSubTab} />

          {subTab === 'overview' ? (
            <TenantBillingOverviewTab
              overview={overview}
              loading={overviewQuery.loading}
              error={overviewQuery.error}
              onRetry={overviewQuery.reload}
              lastPaidInvoice={lastPaidInvoices.invoices[0] ?? null}
              lastPaidInvoiceLoading={lastPaidInvoices.loading}
              lastPaidInvoiceError={lastPaidInvoices.error}
              onManagePaymentMethod={() => navigateSubTab('payment-method')}
              onViewInvoices={() => navigateSubTab('invoices')}
            />
          ) : null}

          {subTab === 'tariff-vehicles' ? (
            <TenantBillingTariffVehiclesTab data={tariffVehicles} />
          ) : null}

          {subTab === 'addons' ? (
            <TenantBillingAddOnsTab
              overview={overview}
              loading={overviewQuery.loading}
              error={overviewQuery.error}
              onRetry={overviewQuery.reload}
            />
          ) : null}

          {subTab === 'invoices' ? (
            <TenantBillingInvoicesTab
              invoices={invoices.invoices}
              loading={invoices.loading}
              error={invoices.error}
              meta={invoices.meta}
              query={invoices.query}
              onQueryChange={invoices.setQuery}
              onRetry={invoices.reload}
            />
          ) : null}

          {subTab === 'payment-method' ? (
            <TenantBillingPaymentMethodTab
              paymentMethod={paymentMethodSummary}
              stripeState={stripeState}
              canUseStripePayments={stripeActions.canUseStripePayments}
              loading={paymentMethods.loading}
              error={paymentMethods.error}
              onRetry={paymentMethods.reload}
              onOpenPortal={() => void stripeActions.openCustomerPortal()}
              portalLoading={stripeActions.loading}
              portalError={stripeActions.error}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
