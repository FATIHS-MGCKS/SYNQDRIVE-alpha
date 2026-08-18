import { useEffect, useMemo, useState } from 'react';
import { MasterPageHeader } from '../../shell';
import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/patterns/states';
import { hasMasterBillingAccess } from '../../../lib/auth';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import { BillingPricingTab } from './BillingPricingTab';
import { BillingInvoicesSection } from './BillingInvoicesSection';
import { BillingReconciliationSection } from './BillingReconciliationSection';
import { BillingAuditSection } from './BillingAuditSection';
import { BillingOrgDetailDrawer } from './BillingOrgDetailDrawer';
import { MasterBillingSectionTabBar } from './MasterBillingSectionTabBar';
import {
  BillingOverviewError,
  BillingOverviewSkeleton,
  BillingOverviewView,
} from '../../billing/BillingOverviewView';
import { BillingSubscriptionsView } from '../../billing/BillingSubscriptionsView';
import { BillingSubscriptionDetailView } from '../../billing/BillingSubscriptionDetailView';
import { useBillingOverviewOperational } from '../../billing/useBillingOperational';
import {
  buildMasterBillingSearch,
  defaultSubTabForSection,
  readMasterBillingLocation,
  type MasterBillingAuditTab,
  type MasterBillingPricingTab,
  type MasterBillingReconciliationTab,
  type MasterBillingSection,
} from './master-billing-navigation';

export interface BillingControlCenterProps {
  /** @deprecated Theme is token-driven via CSS variables. */
  isDarkMode?: boolean;
  /** Opens subscription detail once billing is loaded. */
  initialOrgId?: string | null;
  onInitialOrgConsumed?: () => void;
  onOpenOrganization?: (organizationId: string) => void;
}

function syncMasterBillingUrl(
  section: MasterBillingSection,
  subTab: string | null,
  subscriptionId: string | null,
  replace = false,
) {
  const nextSearch = buildMasterBillingSearch(
    {
      section,
      subTab,
      subscriptionId,
      orgId: null,
    },
    window.location.search,
  );
  const nextUrl = `${window.location.pathname}${nextSearch}`;
  if (replace) {
    window.history.replaceState(null, '', nextUrl);
  } else {
    window.history.pushState(null, '', nextUrl);
  }
}

export function BillingControlCenter({
  initialOrgId,
  onInitialOrgConsumed,
  onOpenOrganization,
}: BillingControlCenterProps) {
  const canAccess = hasMasterBillingAccess();
  const initialLocation = readMasterBillingLocation(window.location.search);

  const [activeSection, setActiveSection] = useState<MasterBillingSection>(initialLocation.section);
  const [activeSubTab, setActiveSubTab] = useState<string | null>(
    initialLocation.subTab ?? defaultSubTabForSection(initialLocation.section),
  );
  const [subscriptionId, setSubscriptionId] = useState<string | null>(
    initialLocation.subscriptionId,
  );
  const [subscriptionFilters, setSubscriptionFilters] = useState<Record<string, string>>({});
  const [pricingRefresh, setPricingRefresh] = useState(0);
  const [contractDrawerRow, setContractDrawerRow] = useState<AdminOrgBillingRowDto | null>(null);
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);

  const overviewState = useBillingOverviewOperational();

  const navigateSection = (section: MasterBillingSection, replace = false) => {
    const subTab = defaultSubTabForSection(section);
    setActiveSection(section);
    setActiveSubTab(subTab);
    setSubscriptionId(null);
    syncMasterBillingUrl(section, subTab, null, replace);
  };

  const navigateSubTab = (subTab: string) => {
    setActiveSubTab(subTab);
    syncMasterBillingUrl(activeSection, subTab, subscriptionId);
  };

  const openSubscription = (orgId: string) => {
    setSubscriptionId(orgId);
    setActiveSection('subscriptions');
    syncMasterBillingUrl('subscriptions', activeSubTab, orgId);
  };

  const closeSubscription = () => {
    setSubscriptionId(null);
    syncMasterBillingUrl('subscriptions', activeSubTab, null, true);
  };

  const goSubscriptionsWithFilters = (filters?: Record<string, string>) => {
    setSubscriptionFilters(filters ?? {});
    setSubscriptionId(null);
    setActiveSection('subscriptions');
    syncMasterBillingUrl('subscriptions', null, null);
  };

  useEffect(() => {
    const onPopState = () => {
      const location = readMasterBillingLocation(window.location.search);
      setActiveSection(location.section);
      setActiveSubTab(location.subTab ?? defaultSubTabForSection(location.section));
      setSubscriptionId(location.subscriptionId);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!initialOrgId) return;
    openSubscription(initialOrgId);
    onInitialOrgConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrgId]);

  const showOverview = activeSection === 'overview';
  const showSubscriptions = activeSection === 'subscriptions' && !subscriptionId;

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            navigateSection('pricing');
            setPricingRefresh((value) => value + 1);
          }}
        >
          Neuer Preisstand
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (showOverview) void overviewState.refresh();
          }}
        >
          Daten neu laden
        </Button>
      </div>
    ),
    [showOverview, overviewState],
  );

  if (!canAccess) {
    return (
      <div className="p-6">
        <EmptyState
          title="Kein Zugriff"
          description="Das Master-Abrechnungscenter ist nur für berechtigte Plattform-Operatoren verfügbar."
        />
      </div>
    );
  }

  return (
    <div data-testid="master-billing-control-center">
      <MasterPageHeader
        title="Master-Abrechnung"
        description="Verträge, Rechnungen, Preise und Abgleich"
        actions={headerActions}
      />

      <MasterBillingSectionTabBar activeSection={activeSection} onSectionChange={navigateSection} />

      {showOverview ? (
        overviewState.loading && !overviewState.overview ? (
          <BillingOverviewSkeleton />
        ) : overviewState.error ? (
          <BillingOverviewError message={overviewState.error} onRetry={() => void overviewState.refresh()} />
        ) : overviewState.overview ? (
          <BillingOverviewView
            overview={overviewState.overview}
            attention={overviewState.attention}
            onOpenSubscription={openSubscription}
            onGoSubscriptions={goSubscriptionsWithFilters}
            onGoReconciliation={() => navigateSection('reconciliation')}
            onGoInvoices={() => navigateSection('invoices')}
          />
        ) : null
      ) : null}

      {activeSection === 'subscriptions' && !subscriptionId ? (
        <BillingSubscriptionsView
          key={JSON.stringify(subscriptionFilters)}
          onOpenSubscription={openSubscription}
          initialFilters={subscriptionFilters}
        />
      ) : null}

      {activeSection === 'subscriptions' && subscriptionId ? (
        <BillingSubscriptionDetailView
          organizationId={subscriptionId}
          onBack={closeSubscription}
          onOpenOrganization={onOpenOrganization}
          onManageContract={(row) => {
            setContractDrawerRow(row);
            setContractDrawerOpen(true);
          }}
        />
      ) : null}

      {activeSection === 'pricing' ? (
        <div className="space-y-4">
          <BillingPricingTab
            refreshToken={pricingRefresh}
            activeSubTab={activeSubTab}
            onSubTabChange={(tab: MasterBillingPricingTab) => navigateSubTab(tab)}
          />
        </div>
      ) : null}

      {activeSection === 'invoices' ? <BillingInvoicesSection /> : null}

      {activeSection === 'reconciliation' ? (
        <BillingReconciliationSection
          activeSubTab={activeSubTab}
          onSubTabChange={(tab: MasterBillingReconciliationTab) => navigateSubTab(tab)}
          onOpenSubscription={openSubscription}
        />
      ) : null}

      {activeSection === 'audit' ? (
        <BillingAuditSection
          activeSubTab={activeSubTab}
          onSubTabChange={(tab: MasterBillingAuditTab) => navigateSubTab(tab)}
        />
      ) : null}

      <BillingOrgDetailDrawer
        row={contractDrawerRow}
        open={contractDrawerOpen}
        onOpenChange={(open) => {
          setContractDrawerOpen(open);
          if (!open) setContractDrawerRow(null);
        }}
        onContractUpdated={() => void overviewState.refresh()}
      />
    </div>
  );
}
