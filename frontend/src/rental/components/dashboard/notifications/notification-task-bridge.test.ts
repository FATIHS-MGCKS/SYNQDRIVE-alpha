import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../dashboardTypes';
import {
  buildNotificationDetailViewModel,
  buildNotificationTaskPrefill,
  canCreateTaskFromNotification,
} from './notification-task-bridge';

function healthItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'n-health',
    source: 'notifications-v2',
    severity: 'critical',
    category: 'health',
    title: 'Batterie kritisch',
    reason: 'Ladespannung unter Schwellwert',
    timeSortMs: Date.now(),
    priority: 80,
    tone: 'critical',
    cta: 'open-vehicle',
    isOverdue: false,
    issueType: 'BATTERY_CRITICAL',
    vehicleId: 'veh-1',
    module: 'battery',
    queue: {
      severity: 'critical',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'vehicle-health',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: '2026-07-10T18:02:00.000Z',
      firstSeenAt: '2026-07-10T18:02:00.000Z',
      lastSeenAt: '2026-07-10T18:02:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-10T18:02:00.000Z',
      entityType: 'vehicle',
      entityId: 'veh-1',
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
      semanticKey: 'VEHICLE:veh-1:VEHICLE_HEALTH:BATTERY_CRITICAL',
      sortMs: Date.now(),
      issueType: 'battery_critical',
      conditionCode: 'BATTERY_CRITICAL',
    },
    ...overrides,
  };
}

describe('notification task bridge', () => {
  it('allows task creation for active vehicle-health notifications', () => {
    expect(canCreateTaskFromNotification(healthItem())).toBe(true);
    expect(
      canCreateTaskFromNotification(
        healthItem({
          queue: { ...healthItem().queue!, lifecycleStatus: 'resolved' },
        }),
      ),
    ).toBe(false);
  });

  it('builds health task prefill from notification', () => {
    const prefill = buildNotificationTaskPrefill(healthItem(), []);
    expect(prefill).not.toBeNull();
    expect(prefill!.sourceType).toBe('HEALTH');
    expect(prefill!.priority).toBe('CRITICAL');
    expect(prefill!.metadata.origin).toBe('NOTIFICATION_PANEL');
    expect(prefill!.metadata.notificationId).toBe('n-health');
  });

  it('exposes create task CTA in detail view model', () => {
    const detail = buildNotificationDetailViewModel(healthItem(), 'de');
    expect(detail.showCreateTask).toBe(true);
    expect(detail.createTaskLabel).toBe('Aufgabe erstellen');
    expect(detail.issueTitle).toBe('Batterie kritisch');
  });
});
