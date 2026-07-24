import type { EvaluationsRecommendationIntegrationAction } from '@synq/evaluations-insights/evaluations-recommendation-integrations';
import type { EvaluationsDataQualityNavigationOptions } from './evaluations-data-quality-navigation';
import type { RentalEntityNavigationValue } from '../context/RentalEntityNavigationContext';
import type { EvaluationsRecommendationIntegrationDescriptor } from '@synq/evaluations-insights/evaluations-recommendation-integrations';

export function executeRecommendationIntegrationNavigation(
  descriptor: EvaluationsRecommendationIntegrationDescriptor,
  navigation: RentalEntityNavigationValue,
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void,
): boolean {
  if (descriptor.mode !== 'navigate' || descriptor.state !== 'AVAILABLE') return false;

  const entityId = descriptor.entity?.entityId;
  switch (descriptor.action as EvaluationsRecommendationIntegrationAction) {
    case 'OPEN_VEHICLE':
      if (entityId) navigation.openVehicleById(entityId);
      return true;
    case 'OPEN_BOOKING':
      if (entityId) navigation.openBookingById(entityId);
      return true;
    case 'OPEN_CUSTOMER':
      if (entityId) navigation.openCustomerById(entityId);
      return true;
    case 'OPEN_INVOICE':
      if (entityId) navigation.openInvoiceById(entityId);
      return true;
    case 'OPEN_SETTINGS_INTEGRATIONS':
      onNavigate?.('settings', { settingsTab: 'data-authorization' });
      return true;
    default:
      return false;
  }
}
