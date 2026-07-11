import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiNotificationResponse } from './notification-api.types';
import {
  dedupeNotificationsById,
  mapNotificationApiList,
  mapNotificationApiToActionQueueItem,
} from './map-notification-api-to-view-model';
import { mapApiCountsToTabCounts } from './map-api-counts-to-tab-counts';
import {
  compareNotificationQueuesShadow,
} from './notification-shadow-compare';
import {
  getNotificationsV2Mode,
  isNotificationsV2Active,
  isNotificationsV2Shadow,
  shouldFetchV2NotificationsInBackground,
  shouldUseV2NotificationSource,
} from './notifications-v2-flag';
import {
  isKnownApiActionType,
  mapApiActionToLegacyCta,
  navigateNotificationV2Action,
} from './notification-v2-action-router';
import { buildUnifiedActionQueue } from '../../components/dashboard/actionQueueBuilder';
import { baseQueueInput } from '../../components/dashboard/notificationEngine.fixtures';
import { WOB_PLATE, WOB_VEHICLE_ID } from '../../components/dashboard/notificationEngine.fixtures';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';

function apiRow(overrides: Partial<ApiNotificationResponse> = {}): ApiNotificationResponse {
  return {
    id: 'notif-001',
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    domain: 'DRIVING_ANALYSIS',
    severity: 'WARNING',
    status: 'OPEN',
    entity: { type: 'VEHICLE', id: WOB_VEHICLE_ID, displayLabel: WOB_PLATE },
    titleKey: 'notification.drivingAssessment.degraded.title',
    bodyKey: 'notification.drivingAssessment.degraded.body',
    templateParams: { plate: WOB_PLATE, label: WOB_PLATE },
    action: {
      type: 'OPEN_VEHICLE',
      target: { vehicleId: WOB_VEHICLE_ID },
    },
    source: { type: 'runtime', ref: 'driving-assessment' },
    firstSeenAt: '2026-07-08T08:00:00.000Z',
    lastSeenAt: '2026-07-10T11:00:00.000Z',
    occurrenceCount: 2,
    resolvedAt: null,
    expiresAt: null,
    createdAt: '2026-07-08T08:00:00.000Z',
    updatedAt: '2026-07-10T11:00:00.000Z',
    userReceipt: {
      readAt: null,
      acknowledgedAt: null,
      snoozedUntil: null,
      hiddenAt: null,
    },
    availableActions: ['read', 'acknowledge', 'snooze', 'open_entity'],
    ...overrides,
  };
}

describe('notifications-v2 flag', () => {
  const env = import.meta.env;

  afterEach(() => {
    import.meta.env.VITE_NOTIFICATIONS_V2 = env.VITE_NOTIFICATIONS_V2;
  });

  it('defaults to off', () => {
    import.meta.env.VITE_NOTIFICATIONS_V2 = undefined;
    expect(getNotificationsV2Mode()).toBe('off');
    expect(shouldUseV2NotificationSource()).toBe(false);
    expect(shouldFetchV2NotificationsInBackground()).toBe(false);
  });

  it('supports shadow mode', () => {
    import.meta.env.VITE_NOTIFICATIONS_V2 = 'shadow';
    expect(getNotificationsV2Mode()).toBe('shadow');
    expect(isNotificationsV2Shadow()).toBe(true);
    expect(shouldFetchV2NotificationsInBackground()).toBe(true);
    expect(shouldUseV2NotificationSource()).toBe(false);
  });

  it('supports on mode', () => {
    import.meta.env.VITE_NOTIFICATIONS_V2 = 'on';
    expect(isNotificationsV2Active()).toBe(true);
    expect(shouldUseV2NotificationSource()).toBe(true);
  });
});

describe('mapNotificationApiToActionQueueItem', () => {
  it('maps WOB L 7503 from API DTO without synthetic id in title', () => {
    const item = mapNotificationApiToActionQueueItem(apiRow(), 'de');
    expect(item.id).toBe('notif-001');
    expect(item.source).toBe('notifications-v2');
    expect(item.entityLabel).toBe(WOB_PLATE);
    expect(item.title).not.toMatch(/notif-/);
    expect(item.timeSortMs).toBe(Date.parse('2026-07-10T11:00:00.000Z'));
    expect(item.queue?.severity).toBe('warning');
    expect(item.vehicleId).toBe(WOB_VEHICLE_ID);
  });

  it('sorts by lastSeenAt not Date.now', () => {
    const older = mapNotificationApiToActionQueueItem(
      apiRow({ id: 'a', lastSeenAt: '2026-07-01T10:00:00.000Z' }),
      'en',
    );
    const newer = mapNotificationApiToActionQueueItem(
      apiRow({ id: 'b', lastSeenAt: '2026-07-10T10:00:00.000Z' }),
      'en',
    );
    const sorted = dedupeNotificationsById([older, newer]);
    expect(sorted[0]?.id).toBe('b');
    expect(sorted[1]?.id).toBe('a');
  });

  it('falls back safely for unknown template keys', () => {
    const item = mapNotificationApiToActionQueueItem(
      apiRow({
        titleKey: 'notification.unknown.key',
        bodyKey: 'notification.unknown.body',
        templateParams: { plate: WOB_PLATE },
      }),
      'de',
    );
    expect(item.title).toBe(WOB_PLATE);
  });

  it('handles unknown action type without throwing', () => {
    const item = mapNotificationApiToActionQueueItem(
      apiRow({ action: { type: 'OPEN_UNKNOWN' as never, target: {} } }),
      'en',
    );
    expect(item.cta).toBe('open-rental');
    expect(isKnownApiActionType('OPEN_UNKNOWN')).toBe(false);
  });

  it('localizes DE/EN via template keys', () => {
    const row = apiRow({
      titleKey: 'notification.title.stationShortage',
      bodyKey: 'notification.body.stationShortage',
      templateParams: { label: 'Hannover Mitte', stationName: 'Hannover Mitte' },
    });
    const de = mapNotificationApiToActionQueueItem(row, 'de');
    const en = mapNotificationApiToActionQueueItem(row, 'en');
    expect(de.title).toContain('Hannover');
    expect(en.title).toContain('Hannover');
    expect(de.title).not.toBe(en.title);
  });
});

describe('V2 single source path', () => {
  it('V2 list has only notifications-v2 source', () => {
    const items = mapNotificationApiList([apiRow(), apiRow({ id: 'notif-002', eventType: 'STATION_SHORTAGE', domain: 'OPERATIONS' })], 'de');
    expect(items.every((i) => i.source === 'notifications-v2')).toBe(true);
  });

  it('V1 path still merges insights — V2 path does not', () => {
    const v1 = buildUnifiedActionQueue(
      baseQueueInput({
        insights: [
          {
            id: 'insight-station',
            type: 'STATION_SHORTAGE',
            severity: 'WARNING',
            priority: 50,
            title: 'Station shortage',
            message: 'Test',
            entityScope: 'STATION',
            entityIds: ['st-1'],
            isGrouped: false,
            groupCount: 1,
            createdAt: '2026-07-10T10:00:00.000Z',
          },
        ],
      }),
    );
    expect(v1.some((i) => i.source === 'dashboard-insights')).toBe(true);

    const v2 = mapNotificationApiList([apiRow()], 'de');
    expect(v2.some((i) => i.source === 'dashboard-insights')).toBe(false);
    expect(v2).toHaveLength(1);
  });
});

describe('mapApiCountsToTabCounts', () => {
  it('uses counts endpoint fields not page estimates', () => {
    const tabs = mapApiCountsToTabCounts({
      totalActive: 12,
      unread: 5,
      critical: 2,
      warning: 4,
      info: 6,
      resolvedRecent: 1,
      byDomain: {
        OPERATIONS: 3,
        BOOKINGS: 2,
        VEHICLE_HEALTH: 4,
        DRIVING_ANALYSIS: 1,
        SYSTEM: 2,
      },
    });
    expect(tabs.all).toBe(12);
    expect(tabs.critical).toBe(2);
    expect(tabs.operations).toBe(5);
    expect(tabs.vehicle).toBe(5);
    expect(tabs.notifications).toBe(2);
  });
});

describe('shadow compare', () => {
  it('detects missing and extra semantic keys without logging titles', () => {
    const v1: ActionQueueItem[] = [
      {
        id: 'v1-1',
        semanticKey: 'VEHICLE:veh-1:vehicle-health:ERROR',
        source: 'dashboard-insights',
        severity: 'critical',
        category: 'health',
        title: 'Secret title',
        reason: 'Secret reason',
        timeSortMs: 1,
        priority: 1,
        tone: 'critical',
        cta: 'open-vehicle',
        isOverdue: false,
        queue: {
          severity: 'critical',
          lifecycleStatus: 'open',
          readStatus: 'unread',
          domain: 'vehicle-health',
          source: 'health',
          legacySource: 'dashboard-insights',
          occurredAt: '2026-07-10T10:00:00.000Z',
          firstSeenAt: '2026-07-10T10:00:00.000Z',
          lastSeenAt: '2026-07-10T10:00:00.000Z',
          resolvedAt: null,
          createdAt: '2026-07-10T10:00:00.000Z',
          entityType: 'vehicle',
          entityId: 'veh-1',
          actionType: 'open-vehicle',
          actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
          semanticKey: 'VEHICLE:veh-1:vehicle-health:ERROR',
          sortMs: 1,
          issueType: 'error',
          conditionCode: 'ERROR',
        },
      },
    ];
    const v2 = mapNotificationApiList(
      [apiRow({ id: 'v2-only', eventType: 'TECHNICAL_OBSERVATION_ACTIVE' })],
      'en',
    );
    const result = compareNotificationQueuesShadow(v1, v2);
    expect(result.missingInV2.length).toBeGreaterThan(0);
    expect(result.extraInV2.length).toBeGreaterThan(0);
    expect(result.missingInV2[0]).not.toContain('Secret');
  });
});

describe('CTA routing', () => {
  it('routes OPEN_VEHICLE from backend action target', () => {
    const item = mapNotificationApiToActionQueueItem(apiRow(), 'en');
    const openVehicle = vi.fn();
    const handled = navigateNotificationV2Action(item, { onOpenVehicleById: openVehicle });
    expect(handled).toBe(true);
    expect(openVehicle).toHaveBeenCalledWith(WOB_VEHICLE_ID);
  });

  it('unknown API action falls back to open-rental legacy CTA', () => {
    expect(mapApiActionToLegacyCta('OPEN_WEIRD' as never)).toBe('open-rental');
  });
});

describe('defensive dedupe by id', () => {
  it('keeps one row per notification id', () => {
    const items = dedupeNotificationsById([
      mapNotificationApiToActionQueueItem(apiRow(), 'de'),
      mapNotificationApiToActionQueueItem(apiRow(), 'de'),
    ]);
    expect(items).toHaveLength(1);
  });
});
