
import { InvoicesView } from './InvoicesView';
import { PriceTariffsView } from './PriceTariffsView';
import { VehicleTariff } from '../data/tariffs';

export type FinanceTab = 'invoices' | 'price-tariffs';

interface FinanceViewProps {
  isDarkMode: boolean;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  tariffs?: VehicleTariff[];
  onTariffsChange?: (tariffs: VehicleTariff[]) => void;
}

export function FinanceView({ isDarkMode, activeTab, tariffs, onTariffsChange }: FinanceViewProps) {
  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {activeTab === 'invoices' && <InvoicesView isDarkMode={isDarkMode} />}
      {activeTab === 'price-tariffs' && <PriceTariffsView isDarkMode={isDarkMode} tariffs={tariffs} onTariffsChange={onTariffsChange} />}
    </div>
  );
}
