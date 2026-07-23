import type { FleetHealthServiceTab, FleetHealthServiceWorkSection } from './fleet-health-service.types';

export const FHS_TAB_ID: Record<FleetHealthServiceTab, string> = {
  overview: 'fhs-tab-overview',
  vehicles: 'fhs-tab-vehicles',
  work: 'fhs-tab-work',
  history: 'fhs-tab-history',
};

export const FHS_TAB_PANEL_ID: Record<FleetHealthServiceTab, string> = {
  overview: 'fhs-panel-overview',
  vehicles: 'fhs-panel-vehicles',
  work: 'fhs-panel-work',
  history: 'fhs-panel-history',
};

export const FHS_WORK_TAB_ID: Record<FleetHealthServiceWorkSection, string> = {
  tasks: 'fhs-work-tab-tasks',
  'service-cases': 'fhs-work-tab-service-cases',
  schedule: 'fhs-work-tab-schedule',
  vendors: 'fhs-work-tab-vendors',
};

export const FHS_WORK_PANEL_ID: Record<FleetHealthServiceWorkSection, string> = {
  tasks: 'fhs-work-panel-tasks',
  'service-cases': 'fhs-work-panel-service-cases',
  schedule: 'fhs-work-panel-schedule',
  vendors: 'fhs-work-panel-vendors',
};

export function fhsVehicleRowDetailsId(rowId: string): string {
  return `fhs-vehicle-details-${rowId}`;
}

export function fhsVehicleRowTriggerId(rowId: string): string {
  return `fhs-vehicle-trigger-${rowId}`;
}
