import { useLanguage } from '../../../i18n/LanguageContext';
import { MASTER_BILLING_INVOICES_TABS, type MasterBillingInvoicesTab } from './master-billing-navigation';

const INVOICES_TAB_I18N_KEY: Record<MasterBillingInvoicesTab, 'master.billing.invoices.tab.invoices' | 'master.billing.invoices.tab.creditNotes'> = {
  invoices: 'master.billing.invoices.tab.invoices',
  'credit-notes': 'master.billing.invoices.tab.creditNotes',
};

interface MasterInvoicesSubTabBarProps {
  activeTab: MasterBillingInvoicesTab;
  onTabChange: (tab: MasterBillingInvoicesTab) => void;
}

export function MasterInvoicesSubTabBar({ activeTab, onTabChange }: MasterInvoicesSubTabBarProps) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('master.billing.invoices.subTabListAria')}>
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
          {t(INVOICES_TAB_I18N_KEY[tab.id])}
        </button>
      ))}
    </div>
  );
}