import type { VehicleDetailTab } from './vehicle-overview.types';
import { VEHICLE_DETAIL_TAB_KEYS } from './vehicle-overview-navigation';

export const VEHICLE_DETAIL_TAB_ID: Record<VehicleDetailTab, string> = {
  overview: 'vehicle-detail-tab-overview',
  trips: 'vehicle-detail-tab-trips',
  'health-errors': 'vehicle-detail-tab-health-errors',
  damages: 'vehicle-detail-tab-damages',
  documents: 'vehicle-detail-tab-documents',
  'vehicle-bookings': 'vehicle-detail-tab-vehicle-bookings',
  'vehicle-tasks': 'vehicle-detail-tab-vehicle-tasks',
  'vehicle-requirements': 'vehicle-detail-tab-vehicle-requirements',
};

export const VEHICLE_DETAIL_TAB_PANEL_ID: Record<VehicleDetailTab, string> = {
  overview: 'vehicle-detail-panel-overview',
  trips: 'vehicle-detail-panel-trips',
  'health-errors': 'vehicle-detail-panel-health-errors',
  damages: 'vehicle-detail-panel-damages',
  documents: 'vehicle-detail-panel-documents',
  'vehicle-bookings': 'vehicle-detail-panel-vehicle-bookings',
  'vehicle-tasks': 'vehicle-detail-panel-vehicle-tasks',
  'vehicle-requirements': 'vehicle-detail-panel-vehicle-requirements',
};

export const VEHICLE_DETAIL_TAB_LABELS: Record<VehicleDetailTab, string> = {
  overview: 'Overview',
  trips: 'Trips',
  'health-errors': 'Health',
  damages: 'Damages',
  documents: 'Documents',
  'vehicle-bookings': 'Bookings',
  'vehicle-tasks': 'Task List',
  'vehicle-requirements': 'Requirements',
};

export { VEHICLE_DETAIL_TAB_KEYS };
