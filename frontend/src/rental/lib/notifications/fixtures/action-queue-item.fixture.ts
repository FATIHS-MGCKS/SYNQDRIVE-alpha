import type { ActionQueueItem } from '../../../components/dashboard/dashboardTypes';
import type { NotificationQueueModel } from '../../../components/dashboard/notificationQueueModel';

/** Minimal queue model for notification lifecycle UI tests. */
export function minimalLifecycleQueue(
  overrides: Partial<NotificationQueueModel> = {},
): NotificationQueueModel {
  return {
    severity: 'warning',
    lifecycleStatus: 'open',
    readStatus: 'unread',
    domain: 'operations',
    source: 'runtime',
    legacySource: 'notifications-v2',
    occurredAt: null,
    firstSeenAt: null,
    lastSeenAt: null,
    resolvedAt: null,
    createdAt: null,
    entityType: 'vehicle',
    entityId: 'veh-1',
    actionType: 'open-vehicle',
    actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
    semanticKey: 'vehicle:veh-1:test',
    sortMs: 1000,
    issueType: 'VEHICLE_NOT_READY',
    ...overrides,
  };
}

/** ActionQueueItem with lifecycle actions enabled for grouped mutation tests. */
export function minimalLifecycleActionQueueItem(
  id: string,
  overrides: Partial<ActionQueueItem> = {},
): ActionQueueItem {
  const vehicleId = overrides.vehicleId ?? 'veh-1';
  return minimalActionQueueItem(id, {
    vehicleId,
    availableActions: ['acknowledge', 'snooze', 'read'],
    queue: minimalLifecycleQueue({
      entityId: vehicleId,
      actionTarget: { type: 'open-vehicle', vehicleId },
      semanticKey: `vehicle:${vehicleId}:${id}`,
      ...((overrides.queue as Partial<NotificationQueueModel> | undefined) ?? {}),
    }),
    ...overrides,
  });
}

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
