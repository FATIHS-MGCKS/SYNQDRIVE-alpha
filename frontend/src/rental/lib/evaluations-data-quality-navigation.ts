import type { EvaluationsDataQualityRemediationTarget } from '@synq/evaluations-insights/evaluations-data-quality-panel.contract';
import type { SettingsTab } from '../components/settings/settingsTypes';
import type { FleetTab } from '../components/fleet-health-service/fleet-health-service.types';

export interface EvaluationsDataQualityNavigationOptions {
  settingsTab?: SettingsTab;
  fleetTab?: FleetTab;
}

export function navigateToDataQualityRemediation(
  target: EvaluationsDataQualityRemediationTarget,
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void,
): void {
  if (!onNavigate) return;
  switch (target) {
    case 'integrations-hub':
    case 'data-authorization':
      onNavigate('settings', { settingsTab: 'data-authorization' });
      break;
    case 'fleet':
      onNavigate('fleet', { fleetTab: 'connectivity' });
      break;
    case 'invoices':
      onNavigate('invoices');
      break;
    case 'bookings':
      onNavigate('bookings');
      break;
    case 'damages':
      onNavigate('damages');
      break;
    case 'tasks':
      onNavigate('tasks');
      break;
    default:
      break;
  }
}
