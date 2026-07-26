import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiNotificationResponse } from './notification-api.types';
import {
  isOrgResolvedNotification,
  isPersonallyAcknowledged,
  mapNotificationLifecycleFromApi,
} from './notification-lifecycle-display';
import { mapNotificationApiToActionQueueItem } from './map-notification-api-to-view-model';
import { notificationTaskDedupKey } from './notification-task-dedup';
import {
  shouldDecoupleActionQueueFromNotifications,
} from './notifications-v2-flag';
import { buildOperationalHandoverWorkQueue } from '../../components/dashboard/actionQueueBuilder';
import { buildNotificationTaskPrefill } from '../../components/dashboard/notifications/notification-task-bridge';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';

function apiRow(overrides: Partial<ApiNotificationResponse> = {}): ApiNotificationResponse {
  return {
    id: 'notif-health-1',
    eventType: 'BATTERY_CRITICAL',
    domain: 'VEHICLE_HEALTH',
    severity: 'CRITICAL',
    status: 'OPEN',
    entity: { type: 'VEHICLE', id: 'veh-1', displayLabel: 'AB-CD 1' },
    titleKey: 'notification.title.batteryCritical',
    bodyKey: 'notification.body.batteryCritical',
    templateParams: { plate: 'AB-CD 1' },
    action: { type: 'OPEN_VEHICLE', target: { vehicleId: 'veh-1' } },
    source: { type: 'runtime', ref: 'battery' },
    firstSeenAt: '2026-07-10T10:00:00.000Z',
    lastSeenAt: '2026-07-10T10:00:00.000Z',
    occurrenceCount: 1,
    resolvedAt: null,
    expiresAt: null,
    createdAt: '2026-07-10T10:00:00.000Z',
    updatedAt: '2026-07-10T10:00:00.000Z',
    userReceipt: {
      readAt: null,
      acknowledgedAt: null,
      snoozedUntil: null,
      hiddenAt: null,
    },
    availableActions: ['read', 'acknowledge', 'resolve', 'open_entity'],
    ...overrides,
  };
}

function healthItem(): ActionQueueItem {
  return mapNotificationApiToActionQueueItem(apiRow(), 'de');
}

describe('action queue decouple', () => {
  const env = import.meta.env;

  beforeEach(() => {
    env.VITE_NOTIFICATIONS_V2 = 'on';
    env.VITE_ACTION_QUEUE_DECOUPLED = 'on';
    env.VITE_NOTIFICATIONS_V2_BRIDGES = 'off';
  });

  afterEach(() => {
    env.VITE_NOTIFICATIONS_V2 = 'off';
    env.VITE_ACTION_QUEUE_DECOUPLED = 'off';
    env.VITE_NOTIFICATIONS_V2_BRIDGES = 'off';
  });

  it('exposes decouple flag when V2 and env on', () => {
    expect(shouldDecoupleActionQueueFromNotifications()).toBe(true);
  });

  it('maps personal acknowledge without org RESOLVED status', () => {
    const row = apiRow({
      status: 'OPEN',
      userReceipt: {
        readAt: '2026-07-10T11:00:00.000Z',
        acknowledgedAt: '2026-07-10T11:00:00.000Z',
        snoozedUntil: null,
        hiddenAt: null,
      },
    });
    expect(isPersonallyAcknowledged(row)).toBe(true);
    expect(isOrgResolvedNotification(row)).toBe(false);
    expect(mapNotificationLifecycleFromApi(row)).toBe('acknowledged');
    const item = mapNotificationApiToActionQueueItem(row, 'de');
    expect(item.queue?.lifecycleStatus).toBe('acknowledged');
  });

  it('creates task prefill with notificationId and dedup key once', () => {
    const prefill = buildNotificationTaskPrefill(healthItem(), []);
    expect(prefill?.metadata.notificationId).toBe('notif-health-1');
    expect(prefill?.metadata.notificationTaskDedupKey).toBe(
      notificationTaskDedupKey('notif-health-1'),
    );
  });

  it('keeps notification inbox separate from operative handover work queue', () => {
    const inbox = [healthItem()];
    const work = buildOperationalHandoverWorkQueue({
      locale: 'de',
      fleetById: new Map(),
      pickupItems: [
        {
          bookingId: 'b-1',
          vehicleId: 'v-1',
          vehicle: 'VW Golf',
          plate: 'WOB-L 1',
          customer: 'Max',
          station: 'Haupt',
          startDate: new Date().toISOString(),
          endDate: '',
          time: '10:00',
          done: false,
          isOverdue: false,
          needsCleaning: false,
          hasAlert: false,
        },
      ],
      returnItems: [],
    });

    const inboxIds = new Set(inbox.map((i) => i.id));
    const overlap = work.filter((w) => inboxIds.has(w.id));
    expect(overlap).toHaveLength(0);
    expect(work.some((w) => w.cta === 'start-handover-pickup')).toBe(true);
    expect(inbox.every((i) => i.source === 'notifications-v2')).toBe(true);
  });

  it('does not duplicate the same notification id in inbox list', () => {
    const row = apiRow();
    const inbox = [
      mapNotificationApiToActionQueueItem(row, 'de'),
      mapNotificationApiToActionQueueItem(row, 'de'),
    ];
    const unique = new Set(inbox.map((i) => i.id));
    expect(unique.size).toBe(1);
  });
});
