import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/patterns/page-header';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { hasMasterBillingAccess } from '../../../lib/auth';
import type { AdminOrgBillingRowDto } from '../../types/admin-billing.types';
import { BillingOverviewTab } from './BillingOverviewTab';
import { BillingOrganizationsTab } from './BillingOrganizationsTab';
import { BillingOrgDetailDrawer } from './BillingOrgDetailDrawer';
import { BillingPricingTab } from './BillingPricingTab';
import { BillingInvoicesPaymentsSection } from './BillingInvoicesPaymentsSection';
import { BillingSystemSyncSection } from './BillingSystemSyncSection';
import { BillingAuditSection } from './BillingAuditSection';
import { MasterBillingSectionTabBar } from './MasterBillingSectionTabBar';
import { useAdminBillingCore } from './useAdminBillingCore';
import {
  buildMasterBillingSearch,
  defaultSubTabForSection,
  readMasterBillingLocation,
  sectionNeedsCoreData,
  type MasterBillingAuditTab,
  type MasterBillingInvoicesPaymentsTab,
  type MasterBillingSection,
  type MasterBillingSystemSyncTab,
} from './master-billing-navigation';

export interface BillingControlCenterProps {
  /** @deprecated Theme is token-driven via CSS variables. */
  isDarkMode?: boolean;
  /** Opens the org detail drawer once organizations are loaded. */
  initialOrgId?: string | null;
  onInitialOrgConsumed?: () => void;
}

function syncMasterBillingUrl(
  section: MasterBillingSection,
  subTab: string | null,
  orgId: string | null,
  replace = false,
) {
  const nextSearch = buildMasterBillingSearch(
    {
      section,
      subTab,
      orgId,
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
}: BillingControlCenterProps) {
  const canAccess = hasMasterBillingAccess();
  const initialLocation = readMasterBillingLocation(window.location.search);

  const [activeSection, setActiveSection] = useState<MasterBillingSection>(initialLocation.section);
  const [activeSubTab, setActiveSubTab] = useState<string | null>(
    initialLocation.subTab ?? defaultSubTabForSection(initialLocation.section),
  );
  const [pricingRefresh, setPricingRefresh] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState<AdminOrgBillingRowDto | null>(null);
  const [orgDrawerOpen, setOrgDrawerOpen] = useState(false);

  const { overview, organizations, loading, error, reload } = useAdminBillingCore();

  const orgById = useMemo(
    () => new Map(organizations.map((organization) => [organization.organization.id, organization])),
    [organizations],
  );

  const navigateSection = (section: MasterBillingSection, replace = false) => {
    const subTab = defaultSubTabForSection(section);
    setActiveSection(section);
    setActiveSubTab(subTab);
    syncMasterBillingUrl(section, subTab, null, replace);
  };

  const navigateSubTab = (subTab: string) => {
    setActiveSubTab(subTab);
    syncMasterBillingUrl(activeSection, subTab, null);
  };

  const openOrg = (orgId: string) => {
    const row = orgById.get(orgId);
    if (!row) return;
    setSelectedOrg(row);
    setOrgDrawerOpen(true);
    syncMasterBillingUrl('organizations', activeSubTab, orgId);
  };

  const openOrgRow = (row: AdminOrgBillingRowDto) => {
    setSelectedOrg(row);
    setOrgDrawerOpen(true);
    syncMasterBillingUrl('organizations', activeSubTab, row.organization.id);
  };

  useEffect(() => {
    const onPopState = () => {
      const location = readMasterBillingLocation(window.location.search);
      setActiveSection(location.section);
      setActiveSubTab(location.subTab ?? defaultSubTabForSection(location.section));
      if (location.orgId) {
        const row = orgById.get(location.orgId);
        if (row) {
          setSelectedOrg(row);
          setOrgDrawerOpen(true);
        }
      } else {
        setOrgDrawerOpen(false);
        setSelectedOrg(null);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [orgById]);

  useEffect(() => {
    if (!initialOrgId || loading || organizations.length === 0) return;
    const row = organizations.find((organization) => organization.organization.id === initialOrgId);
    if (row) {
      setSelectedOrg(row);
      setOrgDrawerOpen(true);
      setActiveSection('organizations');
      setActiveSubTab(defaultSubTabForSection('organizations'));
      syncMasterBillingUrl('organizations', null, initialOrgId, true);
    }
    onInitialOrgConsumed?.();
  }, [initialOrgId, loading, organizations, onInitialOrgConsumed]);

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

  const needsCoreData = sectionNeedsCoreData(activeSection);
  const showCoreLoading = loading && needsCoreData;
  const showCoreError = Boolean(error) && needsCoreData && !loading;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" data-testid="master-billing-control-center">
      <PageHeader
        title="Master-Abrechnung"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                navigateSection('pricing');
                setPricingRefresh((value) => value + 1);
              }}
            >
              Preisstaffel erstellen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              title="Rechnungsexport — folgt in einem späteren Schritt"
            >
              Rechnungsexport
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
              Aktualisieren
            </Button>
          </div>
        }
      />

      <MasterBillingSectionTabBar
        activeSection={activeSection}
        onSectionChange={navigateSection}
      />

      {showCoreLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonCard key={index} className="h-20" />
            ))}
          </div>
          <SkeletonCard className="h-48" />
        </div>
      ) : showCoreError ? (
        <ErrorState
          title="Master-Abrechnung nicht verfügbar"
          description={error ?? 'Abrechnungsdaten konnten nicht geladen werden'}
          onRetry={() => void reload()}
        />
      ) : (
        <>
          {activeSection === 'overview' && overview ? (
            <BillingOverviewTab
              overview={overview}
              organizations={organizations}
              onSelectOrg={openOrg}
              onGoOrganizations={() => navigateSection('organizations')}
            />
          ) : null}

          {activeSection === 'organizations' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Unternehmen & Verträge</h2>
                <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
                  Organisationen, Vertragsstatus, Fahrzeugabrechnung und Vertragsdetails.
                </p>
              </div>
              <BillingOrganizationsTab organizations={organizations} onSelectOrg={openOrgRow} />
            </div>
          ) : null}

          {activeSection === 'pricing' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Tarife & Preise</h2>
                <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
                  Produkte, Pricebooks, Versionen, Staffeln und Stripe-Mapping.
                </p>
              </div>
              <BillingPricingTab refreshToken={pricingRefresh} />
            </div>
          ) : null}

          {activeSection === 'invoices-payments' ? (
            <BillingInvoicesPaymentsSection
              organizations={organizations}
              activeSubTab={activeSubTab}
              onSubTabChange={(tab: MasterBillingInvoicesPaymentsTab) => navigateSubTab(tab)}
            />
          ) : null}

          {activeSection === 'system-sync' ? (
            <BillingSystemSyncSection
              activeSubTab={activeSubTab}
              onSubTabChange={(tab: MasterBillingSystemSyncTab) => navigateSubTab(tab)}
            />
          ) : null}

          {activeSection === 'audit' ? (
            <BillingAuditSection
              activeSubTab={activeSubTab}
              onSubTabChange={(tab: MasterBillingAuditTab) => navigateSubTab(tab)}
            />
          ) : null}
        </>
      )}

      <BillingOrgDetailDrawer
        row={selectedOrg}
        open={orgDrawerOpen}
        onOpenChange={(open) => {
          setOrgDrawerOpen(open);
          if (!open) {
            syncMasterBillingUrl(activeSection, activeSubTab, null, true);
          }
        }}
      />
    </div>
  );
}
