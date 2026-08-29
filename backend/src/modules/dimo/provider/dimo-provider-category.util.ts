import { DimoProviderOperation } from './dimo-provider-gateway.types';
import {
  DimoProviderRequestCategory,
  DimoProviderRequestPriority,
} from './dimo-provider-limiter.types';

export function resolveProviderCategory(
  operation: DimoProviderOperation,
  category?: DimoProviderRequestCategory,
): DimoProviderRequestCategory {
  if (category) return category;
  switch (operation) {
    case DimoProviderOperation.TELEMETRY_GRAPHQL:
      return DimoProviderRequestCategory.TELEMETRY_GRAPHQL;
    case DimoProviderOperation.TELEMETRY_VEHICLE_SUMMARY:
      return DimoProviderRequestCategory.VEHICLE_SUMMARY;
    case DimoProviderOperation.TELEMETRY_VEHICLE_VIN:
      return DimoProviderRequestCategory.VEHICLE_VIN;
    default:
      return DimoProviderRequestCategory.OTHER;
  }
}

export function defaultProviderPriority(
  category: DimoProviderRequestCategory,
): DimoProviderRequestPriority {
  switch (category) {
    case DimoProviderRequestCategory.ACTIVE_TRIP_TRACKING:
      return DimoProviderRequestPriority.P0_CRITICAL;
    case DimoProviderRequestCategory.RECONCILIATION_SEGMENTS:
    case DimoProviderRequestCategory.SNAPSHOT:
      return DimoProviderRequestPriority.P1_HIGH;
    case DimoProviderRequestCategory.DTC:
    case DimoProviderRequestCategory.ENRICHMENT:
    case DimoProviderRequestCategory.VEHICLE_SYNC:
      return DimoProviderRequestPriority.P3_BACKGROUND;
    default:
      return DimoProviderRequestPriority.P2_NORMAL;
  }
}
