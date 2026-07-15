import { BillingStripeTab } from './BillingStripeTab';
import { BillingReconciliationTab } from './BillingReconciliationTab';
import { BillingResendTab } from './BillingResendTab';
import { BillingOutboxTab } from './BillingOutboxTab';
import { MasterBillingSubTabBar } from './MasterBillingSubTabBar';
import {
  MASTER_BILLING_SYSTEM_SYNC_TABS,
  parseMasterBillingSubTab,
  type MasterBillingSystemSyncTab,
} from './master-billing-navigation';

interface BillingSystemSyncSectionProps {
  activeSubTab: string | null;
  onSubTabChange: (tab: MasterBillingSystemSyncTab) => void;
}

export function BillingSystemSyncSection({
  activeSubTab,
  onSubTabChange,
}: BillingSystemSyncSectionProps) {
  const subTab = parseMasterBillingSubTab(
    activeSubTab,
    MASTER_BILLING_SYSTEM_SYNC_TABS.map((tab) => tab.id),
    'stripe-api',
  );

  return (
    <div className="space-y-4" data-testid="master-billing-system-sync-section">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">System & Synchronisation</h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          Stripe-Anbindung, Webhooks, Reconciliation, Resend und Outbox — nur im Master-Bereich
          sichtbar.
        </p>
      </div>

      <MasterBillingSubTabBar
        tabs={MASTER_BILLING_SYSTEM_SYNC_TABS}
        activeTab={subTab}
        onTabChange={onSubTabChange}
        ariaLabel="System und Synchronisation Unterbereiche"
        testIdPrefix="master-billing-system-sync"
      />

      {subTab === 'stripe-api' ? <BillingStripeTab mode="api" /> : null}
      {subTab === 'webhooks' ? <BillingStripeTab mode="webhooks" /> : null}
      {subTab === 'reconciliation' ? <BillingReconciliationTab /> : null}
      {subTab === 'resend' ? <BillingResendTab /> : null}
      {subTab === 'outbox' ? <BillingOutboxTab /> : null}
    </div>
  );
}
