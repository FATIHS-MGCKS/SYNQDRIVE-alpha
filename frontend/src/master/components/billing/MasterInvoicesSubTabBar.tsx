import { MASTER_BILLING_INVOICES_TABS, type MasterBillingInvoicesTab } from './master-billing-navigation';

interface MasterInvoicesSubTabBarProps {
  activeTab: MasterBillingInvoicesTab;
  onTabChange: (tab: MasterBillingInvoicesTab) => void;
}

export function MasterInvoicesSubTabBar({ activeTab, onTabChange }: MasterInvoicesSubTabBarProps) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rechnungen Bereiche">
      {MASTER_BILLING_INVOICES_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === tab.id
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/50'
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}