import { Activity, Briefcase, Car } from 'lucide-react';
import { FleetView } from './FleetView';
import { FleetConditionView, type ConditionCategory } from './FleetConditionView';
import { VendorManagementView } from './VendorManagementView';
import { PageHeader } from '../../components/patterns';
import { useLanguage } from '../i18n/LanguageContext';
import type { VehicleData } from '../data/vehicles';
import type { Vendor } from '../../lib/api';

export type FleetTab = 'status' | 'health' | 'service';

interface FleetHubViewProps {
  activeTab: FleetTab;
  onTabChange: (tab: FleetTab) => void;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onDrillDown?: (vehicleId: string, category: ConditionCategory) => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
}

const TAB_ICONS = {
  status: Car,
  health: Activity,
  service: Briefcase,
} as const;

export function FleetHubView({
  activeTab,
  onTabChange,
  onVehicleSelect,
  onDrillDown,
  onOpenVendorDetail,
}: FleetHubViewProps) {
  const { t } = useLanguage();

  const tabs: { key: FleetTab; labelKey: 'fleetTab.status' | 'fleetTab.health' | 'fleetTab.service' }[] = [
    { key: 'status', labelKey: 'fleetTab.status' },
    { key: 'health', labelKey: 'fleetTab.health' },
    { key: 'service', labelKey: 'fleetTab.service' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader title={t('view.fleet')} />

      <div className="sq-tab-bar p-1 flex items-stretch w-full max-w-md">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = TAB_ICONS[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-border/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'status' && (
        <FleetView embedded onVehicleSelect={onVehicleSelect} />
      )}
      {activeTab === 'health' && (
        <FleetConditionView embedded onDrillDown={onDrillDown} />
      )}
      {activeTab === 'service' && (
        <VendorManagementView embedded onOpenDetail={onOpenVendorDetail} />
      )}
    </div>
  );
}
