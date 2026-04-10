import { BarChart3, ShieldCheck } from 'lucide-react';
import { AnalyticsView } from './AnalyticsView';
import { FleetConditionView } from './FleetConditionView';
import type { ConditionCategory } from './FleetConditionView';
import { VehicleTariff } from '../data/tariffs';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations/en';

export type OperationsTab = 'analytics' | 'fleet-condition';

interface OperationsViewProps {
  isDarkMode: boolean;
  activeTab: OperationsTab;
  onTabChange: (tab: OperationsTab) => void;
  tariffs?: VehicleTariff[];
  onTariffsChange?: (tariffs: VehicleTariff[]) => void;
  onConditionDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
}

const tabConfig: { id: OperationsTab; labelKey: TranslationKey; icon: typeof BarChart3 }[] = [
  { id: 'analytics', labelKey: 'operationsTab.analytics', icon: BarChart3 },
  { id: 'fleet-condition', labelKey: 'operationsTab.fleetCondition', icon: ShieldCheck },
];

export function OperationsView({ isDarkMode, activeTab, onTabChange, onConditionDrillDown }: OperationsViewProps) {
  const { t } = useLanguage();

  const showTabBar = activeTab !== 'tasks';

  return (
    <div className="space-y-5">
      {/* Operations Tab Navigation - Only Analytics & Fleet Condition */}
      {showTabBar && (
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
      )}

      {/* Tab Content */}
      {activeTab === 'analytics' && <AnalyticsView isDarkMode={isDarkMode} />}
      {activeTab === 'fleet-condition' && (
        <FleetConditionView isDarkMode={isDarkMode} onDrillDown={onConditionDrillDown} />
      )}
    </div>
  );
}
