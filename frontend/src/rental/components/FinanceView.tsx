import { FileText, AlertCircle, Tag } from 'lucide-react';
import { InvoicesView } from './InvoicesView';
import { FinesView } from './FinesView';
import { PriceTariffsView } from './PriceTariffsView';
import { VehicleTariff } from '../data/tariffs';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations/en';

export type FinanceTab = 'invoices' | 'fines' | 'price-tariffs';

interface FinanceViewProps {
  isDarkMode: boolean;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  tariffs?: VehicleTariff[];
  onTariffsChange?: (tariffs: VehicleTariff[]) => void;
}

const tabConfig: { id: FinanceTab; labelKey: TranslationKey; icon: typeof FileText }[] = [
  { id: 'invoices', labelKey: 'financeTab.invoices', icon: FileText },
  { id: 'fines', labelKey: 'financeTab.fines', icon: AlertCircle },
  { id: 'price-tariffs', labelKey: 'financeTab.pricingTariffs', icon: Tag },
];

export function FinanceView({ isDarkMode, activeTab, onTabChange, tariffs, onTariffsChange }: FinanceViewProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      {/* Finance Tab Navigation */}
      <div className={`rounded-lg p-1.5 border flex gap-1 ${
        isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-gray-100 border-gray-200'
      }`}>
        {tabConfig.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? isDarkMode
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'invoices' && <InvoicesView isDarkMode={isDarkMode} />}
      {activeTab === 'fines' && <FinesView isDarkMode={isDarkMode} />}
      {activeTab === 'price-tariffs' && <PriceTariffsView isDarkMode={isDarkMode} tariffs={tariffs} onTariffsChange={onTariffsChange} />}
    </div>
  );
}
