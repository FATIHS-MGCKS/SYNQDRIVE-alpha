import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import type { ApiNotificationAttentionScope } from './notification-api.types';
import { projectFleetReadinessPresentationItems } from './fleet-readiness-attention-projection';

/**
 * Backend `attentionScope` is authoritative. Client projection must not reroute
 * items by queue.domain when building scoped dashboard panels.
 */
export function projectScopedAttentionItems(
  items: ActionQueueItem[],
  scope: ApiNotificationAttentionScope,
): ActionQueueItem[] {
  if (scope === 'FLEET_READINESS') {
    return projectFleetReadinessPresentationItems(items);
  }
  return items;
}

export interface CrossScopeAttentionIsolation {
  overlappingIds: string[];
  operationsExclusiveCount: number;
  fleetExclusiveCount: number;
}

export function characterizeCrossScopeAttentionIsolation(
  operationsItems: ActionQueueItem[],
  fleetReadinessItems: ActionQueueItem[],
): CrossScopeAttentionIsolation {
  const fleetIds = new Set(fleetReadinessItems.map((item) => item.id));
  const operationsIds = new Set(operationsItems.map((item) => item.id));
  const overlappingIds = [...operationsIds].filter((id) => fleetIds.has(id));

  return {
    overlappingIds,
    operationsExclusiveCount: operationsItems.filter((item) => !fleetIds.has(item.id)).length,
    fleetExclusiveCount: fleetReadinessItems.filter((item) => !operationsIds.has(item.id)).length,
  };
}
