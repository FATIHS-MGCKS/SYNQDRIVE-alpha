import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns/page-header';
import { Button } from '../../../components/ui/button';
import { EmptyState, SkeletonCard } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { getBillingStripeUiState } from './billing-stripe-ui';
import { useBillingStripeActions } from './useBillingStripeActions';
import { Icon } from '../ui/Icon';
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
import { TenantBillingProblemPanel } from './TenantBillingProblemPanel';

function syncBillingSubTabUrl(subTab: TenantSubscriptionSubTab) {
  const nextUrl = `${window.location.pathname}${buildTenantBillingSubTabSearch(subTab, window.location.search)}`;
  window.history.replaceState(null, '', nextUrl);
}

export function BillingTab() {
  const { t } = useLanguage();
  const { orgId, hasPermission, loading: orgLoading } = useRentalOrg();
  const canRead = hasPermission('billing', 'read');
  const canWrite = hasPermission('billing', 'write');
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
  const stripeActions = useBillingStripeActions(orgId, stripeState, canWrite);

  const paymentMethodList = paymentMethods.data?.paymentMethods ?? [];

  const navigateSubTab = (tab: TenantSubscriptionSubTab) => {
    setSubTab(tab);
    syncBillingSubTabUrl(tab);
  };

  useEffect(() => {
    syncBillingSubTabUrl(subTab);
  }, [subTab]);

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

      <p className="text-[12px] text-muted-foreground leading-relaxed max-w-3xl -mt-2">
        {t('billing.saasOnlyHint')}
      </p>

      <TenantSubscriptionTabBar activeTab={subTab} onTabChange={navigateSubTab} />

      {(subTab === 'invoices' || subTab === 'payment-method' || subTab === 'overview') &&
      (overview?.contract?.status === 'PAST_DUE' ||
        overview?.warnings.some((warning) => warning.severity === 'critical')) ? (
        <TenantBillingProblemPanel
          overview={overview}
          canWrite={canWrite}
          onViewInvoices={() => navigateSubTab('invoices')}
          onManagePaymentMethod={() => navigateSubTab('payment-method')}
          onOpenPortal={canWrite ? () => void stripeActions.openCustomerPortal() : undefined}
          portalLoading={stripeActions.loading}
        />
      ) : null}

      {subTab === 'overview' ? (
        <TenantBillingOverviewTab
          overview={overview}
          loading={overviewQuery.loading}
          error={overviewQuery.error}
          onRetry={overviewQuery.reload}
          lastPaidInvoice={lastPaidInvoices.invoices[0] ?? null}
          lastPaidInvoiceLoading={lastPaidInvoices.loading}
          lastPaidInvoiceError={lastPaidInvoices.error}
          canWrite={canWrite}
          onManagePaymentMethod={() => navigateSubTab('payment-method')}
          onViewInvoices={() => navigateSubTab('invoices')}
          onOpenPortal={canWrite ? () => void stripeActions.openCustomerPortal() : undefined}
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
          orgId={orgId}
          invoices={invoices.invoices}
          loading={invoices.loading}
          error={invoices.error}
          meta={invoices.meta}
          query={invoices.query}
          onQueryChange={invoices.setQuery}
          onRetry={invoices.reload}
          canWrite={canWrite}
          onManagePaymentMethod={() => navigateSubTab('payment-method')}
        />
      ) : null}

      {subTab === 'payment-method' ? (
        <TenantBillingPaymentMethodTab
          orgId={orgId}
          paymentMethods={paymentMethodList}
          stripeState={stripeState}
          canUseStripePayments={stripeActions.canUseStripePayments}
          canWrite={canWrite}
          loading={paymentMethods.loading}
          error={paymentMethods.error}
          onRetry={paymentMethods.reload}
          onOpenPortal={() => void stripeActions.openCustomerPortal()}
          portalLoading={stripeActions.loading}
          portalError={stripeActions.error}
          onChanged={() => void paymentMethods.reload()}
        />
      ) : null}
    </div>
  );
}
