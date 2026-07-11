import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import { groupActionQueueEntries } from '../../components/dashboard/actionQueueGrouping';
import { enrichNotificationGroupingList } from './enrich-notification-grouping';

function vehicleItem(
  id: string,
  vehicleId: string,
  eventType: string,
  title: string,
  overrides: Partial<ActionQueueItem> = {},
): ActionQueueItem {
  return {
    id,
    vehicleId,
    issueType: eventType,
    source: 'notifications-v2',
    severity: 'warning',
    category: eventType.includes('UTILIZATION') ? 'operations' : 'health',
    title,
    reason: title,
    entityLabel: 'KS MS 661',
    timeSortMs: 1000,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    isOverdue: false,
    queue: {
      severity: 'warning',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: eventType.includes('UTILIZATION') ? 'operations' : 'vehicle-health',
      source: 'runtime',
      legacySource: 'notifications-v2',
      occurredAt: '2026-07-11T10:00:00.000Z',
      firstSeenAt: '2026-07-11T10:00:00.000Z',
      lastSeenAt: '2026-07-11T10:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-11T10:00:00.000Z',
      entityType: 'vehicle',
      entityId: vehicleId,
      actionType: 'open-vehicle',
      actionTarget: { type: 'open-vehicle', vehicleId },
      semanticKey: `VEHICLE:${vehicleId}:x:${eventType}`,
      sortMs: 1000,
      issueType: eventType.toLowerCase(),
      conditionCode: eventType,
    },
    ...overrides,
  };
}

describe('enrichNotificationGroupingList', () => {
  it('assigns vehicle groupKey for vehicle-scoped notifications', () => {
    const [enriched] = enrichNotificationGroupingList(
      [vehicleItem('n1', 'veh-1', 'ACTIVE_DTC', 'P0675')],
      'de',
    );
    expect(enriched.groupKey).toBe('vehicle:veh-1');
    expect(enriched.groupType).toBe('vehicle-health');
    expect(enriched.module).toBe('error_codes');
  });
});

describe('notification panel grouping', () => {
  it('groups multiple notifications for the same vehicle', () => {
    const items = enrichNotificationGroupingList(
      [
        vehicleItem('n1', 'veh-1', 'ACTIVE_DTC', 'P0675'),
        vehicleItem('n2', 'veh-1', 'TIRE_CRITICAL', 'Reifendruck-Warnung'),
        vehicleItem('n3', 'veh-2', 'LOW_UTILIZATION', 'Geringe Auslastung'),
      ],
      'de',
    );
    const entries = groupActionQueueEntries(items, 'de');
    expect(entries).toHaveLength(2);
    const vehicleGroup = entries.find((e) => e.kind === 'group' && e.groupKey === 'vehicle:veh-1');
    expect(vehicleGroup?.kind).toBe('group');
    if (vehicleGroup?.kind === 'group') {
      expect(vehicleGroup.children).toHaveLength(2);
      expect(vehicleGroup.title).toBe('KS MS 661');
    }
    const leaf = entries.find((e) => e.kind === 'leaf');
    expect(leaf?.kind).toBe('leaf');
  });

  it('uses Meldungen subtitle for mixed vehicle health + ops', () => {
    const items = enrichNotificationGroupingList(
      [
        vehicleItem('n1', 'veh-1', 'TIRE_CRITICAL', 'Reifen'),
        vehicleItem('n2', 'veh-1', 'LOW_UTILIZATION', 'Auslastung', {
          category: 'operations',
          queue: {
            ...vehicleItem('n1', 'veh-1', 'LOW_UTILIZATION', '').queue!,
            domain: 'operations',
          },
        }),
      ],
      'de',
    );
    const entries = groupActionQueueEntries(items, 'de');
    const group = entries.find((e) => e.kind === 'group');
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') {
      expect(group.subtitle).toBe('2 Meldungen');
    }
  });
});
