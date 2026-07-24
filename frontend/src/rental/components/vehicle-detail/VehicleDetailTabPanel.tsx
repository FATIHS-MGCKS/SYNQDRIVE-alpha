import type { ReactNode } from 'react';
import {
  VEHICLE_DETAIL_TAB_ID,
  VEHICLE_DETAIL_TAB_PANEL_ID,
} from '../../lib/vehicle-detail-a11y';
import type { VehicleDetailTab } from '../../lib/vehicle-overview.types';

interface VehicleDetailTabPanelProps {
  tab: VehicleDetailTab;
  activeTab: VehicleDetailTab;
  children: ReactNode;
}

export function VehicleDetailTabPanel({ tab, activeTab, children }: VehicleDetailTabPanelProps) {
  if (activeTab !== tab) return null;

  return (
    <div
      role="tabpanel"
      id={VEHICLE_DETAIL_TAB_PANEL_ID[tab]}
      aria-labelledby={VEHICLE_DETAIL_TAB_ID[tab]}
      tabIndex={0}
      className="min-w-0 max-w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      {children}
    </div>
  );
}
