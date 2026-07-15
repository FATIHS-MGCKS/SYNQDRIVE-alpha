
import { PageHeader } from '../../components/patterns/page-header';
import { useLanguage } from '../i18n/LanguageContext';
import { CustomerPaymentsTab } from './billing/CustomerPaymentsTab';
import { InvoicesPage } from './invoices/InvoicesPage';
import { PriceTariffsView } from './PriceTariffsView';
import type { FinanceTab } from './finance-navigation';
import type { InvoiceRelationNavigation } from './invoices/InvoiceRelations';

export type { FinanceTab } from './finance-navigation';

interface FinanceViewProps {
  isDarkMode: boolean;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  initialInvoiceId?: string | null;
  onConsumeInitialInvoiceId?: () => void;
  invoiceNavigation?: InvoiceRelationNavigation;
}

export function FinanceView({
  isDarkMode,
  activeTab,
  initialInvoiceId,
  onConsumeInitialInvoiceId,
  invoiceNavigation,
}: FinanceViewProps) {
  const { t } = useLanguage();

  if (activeTab === 'customer-payments') {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <PageHeader title={t('finance.customerPayments.pageTitle')} />
        <p className="text-[12px] text-muted-foreground leading-relaxed max-w-3xl -mt-2">
          {t('finance.separationHint')}
        </p>
        <CustomerPaymentsTab />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {activeTab === 'invoices' && (
        <InvoicesPage
          isDarkMode={isDarkMode}
          navigation={invoiceNavigation}
          initialInvoiceId={initialInvoiceId}
          onConsumeInitialInvoiceId={onConsumeInitialInvoiceId}
        />
      )}
      {activeTab === 'price-tariffs' && <PriceTariffsView isDarkMode={isDarkMode} />}
    </div>
  );
}
