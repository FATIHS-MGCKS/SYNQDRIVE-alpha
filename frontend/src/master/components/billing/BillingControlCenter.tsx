import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns/page-header';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { getStoredUser, isMasterAdmin } from '../../../lib/auth';
import type { AdminBillingTab, AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import { BillingOverviewTab } from './BillingOverviewTab';
import { BillingOrganizationsTab } from './BillingOrganizationsTab';
import { BillingOrgDetailDrawer } from './BillingOrgDetailDrawer';
import { BillingPricingTab } from './BillingPricingTab';
import { BillingInvoicesTab } from './BillingInvoicesTab';
import { BillingPaymentMethodsTab } from './BillingPaymentMethodsTab';
import { BillingStripeTab } from './BillingStripeTab';
import { BillingAuditLogTab } from './BillingAuditLogTab';
import { useAdminBillingCore } from './useAdminBillingCore';

const TAB_BAR = 'sq-tab-bar flex gap-1 p-1 rounded-2xl overflow-x-auto w-full max-w-full';

const TABS: Array<{ id: AdminBillingTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payment-methods', label: 'Payment Methods' },
  { id: 'stripe', label: 'Stripe / Webhooks' },
  { id: 'audit', label: 'Audit Log' },
];

export interface BillingControlCenterProps {
  isDarkMode?: boolean;
}

export function BillingControlCenter(_props: BillingControlCenterProps) {
  const user = getStoredUser();
  const canAccess = isMasterAdmin() || user?.platformRole === 'MASTER_ADMIN';

  const [activeTab, setActiveTab] = useState<AdminBillingTab>('overview');
  const [pricingRefresh, setPricingRefresh] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState<AdminOrgBillingRowDto | null>(null);
  const [orgDrawerOpen, setOrgDrawerOpen] = useState(false);

  const { overview, organizations, loading, error, reload } = useAdminBillingCore();

  const orgById = useMemo(
    () => new Map(organizations.map((o) => [o.organization.id, o])),
    [organizations],
  );

  const openOrg = (orgId: string) => {
    const row = orgById.get(orgId);
    if (row) {
      setSelectedOrg(row);
      setOrgDrawerOpen(true);
    }
  };

  const openOrgRow = (row: AdminOrgBillingRowDto) => {
    setSelectedOrg(row);
    setOrgDrawerOpen(true);
  };

  if (!canAccess) {
    return (
      <div className="p-6">
        <EmptyState
          title="Kein Zugriff"
          description="Das Billing Control Center ist nur für Master Admins verfügbar."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      <PageHeader
        title="Billing Control Center"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('pricing');
                setPricingRefresh((v) => v + 1);
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white hover:opacity-90 transition-opacity"
            >
              Preisstaffel erstellen
            </button>
            <button
              type="button"
              disabled
              title="Invoice Export — Backend noch nicht angebunden"
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-border/70 text-muted-foreground cursor-not-allowed"
            >
              Invoice Export
            </button>
            <button
              type="button"
              disabled
              title="Stripe wird vorbereitet"
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-border/70 text-muted-foreground cursor-not-allowed"
            >
              Stripe wird vorbereitet
            </button>
          </div>
        }
      />

      <div className={TAB_BAR}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && activeTab === 'overview' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} className="h-24" />
            ))}
          </div>
          <SkeletonCard className="h-48" />
        </div>
      ) : error && activeTab === 'overview' ? (
        <ErrorState
          title="Billing Control Center nicht verfügbar"
          description={error}
          onRetry={() => void reload()}
        />
      ) : (
        <>
          {activeTab === 'overview' && overview && (
            <BillingOverviewTab
              overview={overview}
              organizations={organizations}
              onSelectOrg={openOrg}
              onGoOrganizations={() => setActiveTab('organizations')}
            />
          )}

          {activeTab === 'organizations' && (
            <BillingOrganizationsTab organizations={organizations} onSelectOrg={openOrgRow} />
          )}

          {activeTab === 'pricing' && <BillingPricingTab refreshToken={pricingRefresh} />}

          {activeTab === 'invoices' && <BillingInvoicesTab />}

          {activeTab === 'payment-methods' && (
            <BillingPaymentMethodsTab organizations={organizations} />
          )}

          {activeTab === 'stripe' && <BillingStripeTab />}

          {activeTab === 'audit' && <BillingAuditLogTab />}
        </>
      )}

      <BillingOrgDetailDrawer
        row={selectedOrg}
        open={orgDrawerOpen}
        onOpenChange={setOrgDrawerOpen}
      />
    </div>
  );
}
