
import { InvoicesView } from './InvoicesView';
import { PriceTariffsView } from './PriceTariffsView';

export type FinanceTab = 'invoices' | 'price-tariffs';

interface FinanceViewProps {
  isDarkMode: boolean;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
}

export function FinanceView({ isDarkMode, activeTab }: FinanceViewProps) {
  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {activeTab === 'invoices' && <InvoicesView isDarkMode={isDarkMode} />}
      {activeTab === 'price-tariffs' && <PriceTariffsView isDarkMode={isDarkMode} />}
    </div>
  );
}
