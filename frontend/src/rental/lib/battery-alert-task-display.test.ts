import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../components/dashboard/dashboardTypes';
import { resolveNotificationIssueCopy } from '../components/dashboard/notifications/notification-issue-copy';

function batteryCriticalItem(): ActionQueueItem {
  return {
    id: 'n-battery-1',
    source: 'notifications-v2',
    severity: 'critical',
    category: 'health',
    title: 'Batterie kritisch — BAT-1',
    reason: '12V-Batterie: Werkstattprüfung erforderlich',
    timeSortMs: 0,
    priority: 90,
    tone: 'critical',
    cta: 'open-vehicle',
    isOverdue: false,
    issueType: 'BATTERY_CRITICAL',
    entityLabel: 'BAT-1',
    entityContextParams: { plate: 'BAT-1' },
    queue: {
      severity: 'critical',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'vehicle-health',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: '2026-07-16T12:00:00.000Z',
      firstSeenAt: '2026-07-16T12:00:00.000Z',
      lastSeenAt: '2026-07-16T12:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-16T12:00:00.000Z',
      entityType: 'vehicle',
      entityId: 'veh-bat',
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId: 'veh-bat' },
      semanticKey: 'battery_critical:veh-bat',
      sortMs: 0,
      issueType: 'battery_critical',
      conditionCode: 'BATTERY_CRITICAL',
    },
  };
}

describe('battery alert display copy', () => {
  it('localizes BATTERY_CRITICAL headline without inventing SOH percentages', () => {
    const copy = resolveNotificationIssueCopy(batteryCriticalItem(), 'de');
    expect(copy.headline).toBe('Batterie kritisch');
    expect(copy.headline.toLowerCase()).not.toContain('soh');
    expect(copy.detail).toContain('12V');
  });
});
