
import { InvoicesPage } from './invoices/InvoicesPage';
import { PriceTariffsView } from './PriceTariffsView';
import type { InvoiceRelationNavigation } from './invoices/InvoiceRelations';

export type FinanceTab = 'invoices' | 'price-tariffs';

interface FinanceViewProps {
  isDarkMode: boolean;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  invoiceNavigation?: InvoiceRelationNavigation;
}

export function FinanceView({ isDarkMode, activeTab, invoiceNavigation }: FinanceViewProps) {
  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {activeTab === 'invoices' && (
        <InvoicesPage isDarkMode={isDarkMode} navigation={invoiceNavigation} />
      )}
      {activeTab === 'price-tariffs' && <PriceTariffsView isDarkMode={isDarkMode} />}
    </div>
  );
}
