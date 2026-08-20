import { describe, expect, it } from 'vitest';
import {
  characterizeCrossScopeAttentionIsolation,
  projectScopedAttentionItems,
} from './dashboard-attention-routing';
import { minimalActionQueueItem } from './fixtures/action-queue-item.fixture';

describe('projectScopedAttentionItems', () => {
  it('keeps OPERATIONS-domain rows in FLEET_READINESS projection (no client reroute)', () => {
    const operationsDomainInFleetScope = minimalActionQueueItem('ops-domain-in-fleet', {
      vehicleId: 'veh-a',
      category: 'operations',
      issueType: 'STATION_SHORTAGE',
      queue: {
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
        entityId: 'veh-a',
        actionType: 'open-vehicle',
        actionTarget: { vehicleId: 'veh-a' },
        semanticKey: 'vehicle:veh-a:station_shortage',
        sortMs: 1000,
        issueType: 'STATION_SHORTAGE',
      },
    });

    const projected = projectScopedAttentionItems([operationsDomainInFleetScope], 'FLEET_READINESS');

    const group = projected.find((row) => row.kind === 'group' && row.id === 'fleet-readiness:veh-a');
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') {
      expect(group.children.some((child) => child.id === 'ops-domain-in-fleet')).toBe(true);
    }
  });

  it('passes OPERATIONS scoped items through without fleet grouping', () => {
    const operationsItem = minimalActionQueueItem('ops-1', {
      category: 'operations',
      issueType: 'STATION_SHORTAGE',
      queue: undefined,
    });

    const projected = projectScopedAttentionItems([operationsItem], 'OPERATIONS');
    expect(projected).toHaveLength(1);
    expect(projected[0]?.kind).toBe('leaf');
    expect(projected[0]?.id).toBe('ops-1');
  });
});

describe('characterizeCrossScopeAttentionIsolation', () => {
  it('characterizes disjoint scoped sets as isolated', () => {
    const operationsItems = [
      minimalActionQueueItem('ops-1', { category: 'operations', issueType: 'STATION_SHORTAGE' }),
      minimalActionQueueItem('ops-2', { category: 'handover', issueType: 'PICKUP_OVERDUE' }),
    ];
    const fleetItems = [
      minimalActionQueueItem('fleet-1', { vehicleId: 'veh-a', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('fleet-2', { vehicleId: 'veh-a', issueType: 'ACTIVE_DTC' }),
    ];

    const isolation = characterizeCrossScopeAttentionIsolation(operationsItems, fleetItems);

    expect(isolation.overlappingIds).toEqual([]);
    expect(isolation.operationsExclusiveCount).toBe(2);
    expect(isolation.fleetExclusiveCount).toBe(2);
  });

  it('surfaces overlap when the same notification id appears in both scoped sets', () => {
    const shared = minimalActionQueueItem('shared-id', { issueType: 'VEHICLE_NOT_READY' });
    const isolation = characterizeCrossScopeAttentionIsolation([shared], [shared]);

    expect(isolation.overlappingIds).toEqual(['shared-id']);
    expect(isolation.operationsExclusiveCount).toBe(0);
    expect(isolation.fleetExclusiveCount).toBe(0);
  });
});
