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

/**
 * Canonical category → priority mapping (P1.3-S3).
 * Call sites may override via explicit `priority` on gateway params.
 */
export function defaultProviderPriority(
  category: DimoProviderRequestCategory,
): DimoProviderRequestPriority {
  switch (category) {
    case DimoProviderRequestCategory.ACTIVE_TRIP_TRACKING:
      return DimoProviderRequestPriority.P0_CRITICAL;
    case DimoProviderRequestCategory.VEHICLE_SUMMARY:
    case DimoProviderRequestCategory.VEHICLE_VIN:
      return DimoProviderRequestPriority.P2_INTERACTIVE;
    case DimoProviderRequestCategory.SNAPSHOT:
      return DimoProviderRequestPriority.P3_NORMAL;
    case DimoProviderRequestCategory.RECONCILIATION_SEGMENTS:
    case DimoProviderRequestCategory.RECHARGE_SEGMENTS:
    case DimoProviderRequestCategory.DTC:
    case DimoProviderRequestCategory.ENRICHMENT:
    case DimoProviderRequestCategory.VEHICLE_SYNC:
      return DimoProviderRequestPriority.P4_BACKGROUND;
    default:
      return DimoProviderRequestPriority.P2_INTERACTIVE;
  }
}

/** Every gateway category must resolve to a documented priority. */
export const PROVIDER_CATEGORY_PRIORITY_MAP: Record<
  DimoProviderRequestCategory,
  DimoProviderRequestPriority
> = Object.values(DimoProviderRequestCategory).reduce(
  (acc, category) => {
    acc[category] = defaultProviderPriority(category);
    return acc;
  },
  {} as Record<DimoProviderRequestCategory, DimoProviderRequestPriority>,
);
