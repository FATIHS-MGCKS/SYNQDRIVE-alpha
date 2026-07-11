import { describe, expect, it } from 'vitest';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import { NOTIFICATION_TEST_NOW_MS } from '../notificationEngine.fixtures';
import {
  buildNotificationHeadlineTitle,
  buildNotificationSummaryFromGroup,
  buildNotificationSummaryFromItem,
} from './notification-summary-view-model';

function baseItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'n-1',
    source: 'notifications-v2',
    severity: 'warning',
    category: 'health',
    title: 'Reifen prüfen',
    reason: 'Profiltiefe unter Schwellwert',
    timeSortMs: NOTIFICATION_TEST_NOW_MS,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    isOverdue: false,
    issueType: 'TIRE_CRITICAL',
    vehicleId: 'veh-1',
    groupKey: 'vehicle:veh-1',
    groupType: 'vehicle-health',
    entityContextParams: {
      plate: 'WOB L 7503',
      make: 'Volkswagen',
      model: 'Tiguan',
      year: 2026,
    },
    queue: {
      severity: 'warning',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'vehicle-health',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: '2026-07-08T18:02:00.000Z',
      firstSeenAt: '2026-07-08T18:02:00.000Z',
      lastSeenAt: '2026-07-10T18:02:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-08T18:02:00.000Z',
      entityType: 'vehicle',
      entityId: 'veh-1',
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
      semanticKey: 'VEHICLE:veh-1:VEHICLE_HEALTH:TIRE_CRITICAL',
      sortMs: NOTIFICATION_TEST_NOW_MS,
      issueType: 'tire_critical',
      conditionCode: 'TIRE_CRITICAL',
    },
    ...overrides,
  };
}

describe('buildNotificationHeadlineTitle', () => {
  it('formats plate · make model year', () => {
    expect(buildNotificationHeadlineTitle(baseItem())).toBe('WOB L 7503 · Volkswagen Tiguan 2026');
  });
});

describe('buildNotificationSummaryFromItem', () => {
  it('builds compact summary without occurrence meta', () => {
    const summary = buildNotificationSummaryFromItem(baseItem(), 'de', NOTIFICATION_TEST_NOW_MS);
    expect(summary).not.toBeNull();
    expect(summary!.headlineTitle).toBe('WOB L 7503 · Volkswagen Tiguan 2026');
    expect(summary!.eyebrowLabel).toBe('Fahrzeugzustand');
    expect(summary!.lastSeenLabel).toContain('zuletzt');
    expect(summary!.showIconCount).toBe(false);
    expect(summary!.iconCount).toBe(1);
  });
});

describe('buildNotificationSummaryFromGroup', () => {
  it('shows icon count badge for grouped vehicle health', () => {
    const tire = baseItem({ id: 'n-tire', title: 'Reifen prüfen' });
    const brake = baseItem({
      id: 'n-brake',
      title: 'Bremsen prüfen',
      issueType: 'BRAKE_CRITICAL',
      module: 'brakes',
      queue: {
        ...baseItem().queue!,
        conditionCode: 'BRAKE_CRITICAL',
        issueType: 'brake_critical',
      },
    });

    const group: ActionQueueGroupItem = {
      kind: 'group',
      id: 'group-vehicle:veh-1',
      groupKey: 'vehicle:veh-1',
      groupType: 'vehicle-health',
      severity: 'warning',
      category: 'health',
      title: 'WOB L 7503 · Volkswagen Tiguan 2026',
      subtitle: '2 aktive Gesundheitshinweise',
      entityLabel: 'WOB L 7503',
      vehicleId: 'veh-1',
      priority: 50,
      children: [
        {
          id: 'child-n-tire',
          itemId: 'n-tire',
          severity: 'warning',
          category: 'health',
          title: 'Reifen prüfen',
          timeSortMs: NOTIFICATION_TEST_NOW_MS,
          priority: 50,
          cta: 'open-vehicle',
        },
        {
          id: 'child-n-brake',
          itemId: 'n-brake',
          severity: 'warning',
          category: 'health',
          title: 'Bremsen prüfen',
          timeSortMs: NOTIFICATION_TEST_NOW_MS,
          priority: 50,
          cta: 'open-vehicle',
        },
      ],
    };

    const itemsById = new Map<string, ActionQueueItem>([
      ['n-tire', tire],
      ['n-brake', brake],
    ]);

    const summary = buildNotificationSummaryFromGroup(group, itemsById, 'de', NOTIFICATION_TEST_NOW_MS);
    expect(summary).not.toBeNull();
    expect(summary!.iconCount).toBe(2);
    expect(summary!.showIconCount).toBe(true);
    expect(summary!.headlineTitle).toBe('WOB L 7503 · Volkswagen Tiguan 2026');
  });
});
