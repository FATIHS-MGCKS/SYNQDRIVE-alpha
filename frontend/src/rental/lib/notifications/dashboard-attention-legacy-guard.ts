import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import { mergeV2NotificationsWithVehicleHealth } from './merge-v2-with-vehicle-health';

export interface DashboardAttentionLegacyGuardOptions {
  attentionSplitActive: boolean;
}

export function shouldSupplementVehicleHealthForScopedAttention(
  options: DashboardAttentionLegacyGuardOptions,
): boolean {
  return !options.attentionSplitActive;
}

/**
 * Fleet Readiness scoped panel: when attention split is active, API-scoped items
 * are authoritative and legacy rental-health supplemental rows must not merge in.
 */
export function buildFleetReadinessScopedAttentionItems(
  scopedApiItems: ActionQueueItem[],
  vehicleHealthQueueItems: ActionQueueItem[],
  options: DashboardAttentionLegacyGuardOptions,
): ActionQueueItem[] {
  if (options.attentionSplitActive) {
    return scopedApiItems;
  }
  return mergeV2NotificationsWithVehicleHealth(scopedApiItems, vehicleHealthQueueItems);
}
