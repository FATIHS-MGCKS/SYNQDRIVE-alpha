import { useLanguage } from '../../../i18n/LanguageContext';
import { BillingCreditNotesTab } from './BillingCreditNotesTab';
import { BillingInvoicesTab } from './BillingInvoicesTab';
import { MasterInvoicesSubTabBar } from './MasterInvoicesSubTabBar';
import {
  MASTER_BILLING_INVOICES_TABS,
  parseMasterBillingSubTab,
  type MasterBillingInvoicesTab,
} from './master-billing-navigation';

interface BillingInvoicesSectionProps {
  activeSubTab?: string | null;
  onSubTabChange?: (tab: MasterBillingInvoicesTab) => void;
}

export function BillingInvoicesSection({ activeSubTab, onSubTabChange }: BillingInvoicesSectionProps) {
  const { t } = useLanguage();
  const tab = parseMasterBillingSubTab(
    activeSubTab,
    MASTER_BILLING_INVOICES_TABS.map((row) => row.id),
    'invoices',
  );

  return (
    <div className="space-y-4" data-testid="master-billing-invoices-section">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">
          {t('master.billing.invoices.sectionTitle')}
        </h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          {t('master.billing.invoices.sectionDescription')}
        </p>
      </div>
      <MasterInvoicesSubTabBar
        activeTab={tab}
        onTabChange={(next) => onSubTabChange?.(next)}
      />
      {tab === 'invoices' ? <BillingInvoicesTab /> : <BillingCreditNotesTab />}
    </div>
  );
}