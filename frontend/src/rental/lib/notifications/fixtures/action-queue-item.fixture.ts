import type { ActionQueueItem } from '../../../components/dashboard/dashboardTypes';

/** Minimal ActionQueueItem for notification attention unit tests. */
export function minimalActionQueueItem(
  id: string,
  overrides: Partial<ActionQueueItem> = {},
): ActionQueueItem {
  const vehicleId = overrides.vehicleId ?? 'veh-1';
  return {
    id,
    source: 'notifications-v2',
    severity: 'warning',
    category: 'health',
    title: `Title — ${id}`,
    reason: 'reason',
    timeSortMs: 1000,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    vehicleId,
    isOverdue: false,
    entityContextParams: {
      plate: 'WOB L 1',
      ...overrides.entityContextParams,
    },
    ...overrides,
  };
}
