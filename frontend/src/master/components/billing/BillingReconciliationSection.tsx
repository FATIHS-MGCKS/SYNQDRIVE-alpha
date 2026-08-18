import { BillingStripeTab } from './BillingStripeTab';
import { BillingReconciliationTab } from './BillingReconciliationTab';
import { MasterBillingSubTabBar } from './MasterBillingSubTabBar';
import {
  MASTER_BILLING_RECONCILIATION_TABS,
  parseMasterBillingSubTab,
  type MasterBillingReconciliationTab,
} from './master-billing-navigation';

interface BillingReconciliationSectionProps {
  activeSubTab: string | null;
  onSubTabChange: (tab: MasterBillingReconciliationTab) => void;
  onOpenSubscription?: (organizationId: string) => void;
}

export function BillingReconciliationSection({
  activeSubTab,
  onSubTabChange,
  onOpenSubscription,
}: BillingReconciliationSectionProps) {
  const subTab = parseMasterBillingSubTab(
    activeSubTab,
    MASTER_BILLING_RECONCILIATION_TABS.map((tab) => tab.id),
    'drifts',
  );

  return (
    <div className="space-y-4" data-testid="master-billing-reconciliation-section">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Abgleich</h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          Reconciliation-Abweichungen, Plattform-Sync und Webhook-Gesundheit.
        </p>
      </div>

      <MasterBillingSubTabBar
        tabs={MASTER_BILLING_RECONCILIATION_TABS}
        activeTab={subTab}
        onTabChange={onSubTabChange}
        ariaLabel="Abgleich Unterbereiche"
        testIdPrefix="master-billing-reconciliation"
      />

      {subTab === 'drifts' ? (
        <BillingReconciliationTab onOpenSubscription={onOpenSubscription} />
      ) : null}
      {subTab === 'platform-sync' ? <BillingStripeTab mode="api" /> : null}
      {subTab === 'webhooks' ? <BillingStripeTab mode="webhooks" /> : null}
    </div>
  );
}
