import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import {
  augmentPrimaryTabCountsWithHealthItems,
  mergeV2NotificationsWithVehicleHealth,
  mergeV2WithSupplemental,
  supplementalQueueItems,
} from './merge-v2-with-vehicle-health';

function item(
  id: string,
  overrides: Partial<ActionQueueItem> = {},
): ActionQueueItem {
  return {
    id,
    semanticKey: `vehicle:${id}:error_codes:active`,
    issueType: 'error_codes_active',
    source: 'operational-issue',
    severity: 'warning',
    category: 'health',
    title: `Fehlercode — ${id}`,
    reason: 'P0675',
    entityLabel: id,
    timeSortMs: 1000,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    queue: {
      severity: 'warning',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'vehicle-health',
      source: 'runtime',
      legacySource: 'rental-health',
      occurredAt: null,
      firstSeenAt: null,
      lastSeenAt: null,
      resolvedAt: null,
      createdAt: null,
      entityType: 'vehicle',
      entityId: id,
      actionType: 'open-vehicle-module',
      actionTarget: { vehicleId: id, module: 'error_codes' },
      semanticKey: `vehicle:${id}:error_codes:active`,
      sortMs: 1000,
      issueType: 'error_codes_active',
      conditionCode: 'error_codes_active',
    },
    vehicleId: id,
    ...overrides,
  };
}

describe('mergeV2NotificationsWithVehicleHealth', () => {
  it('appends rental-health warnings missing from V2 API', () => {
    const v2 = [item('v-notif', { semanticKey: 'notif:station', category: 'operations', queue: undefined })];
    const health = [
      item('veh-1'),
      item('veh-2', { semanticKey: 'vehicle:veh-2:tires:monitor', issueType: 'tire_monitor' }),
    ];
    const merged = mergeV2NotificationsWithVehicleHealth(v2, health);
    expect(merged).toHaveLength(3);
  });

  it('does not duplicate when V2 already carries the same health semantic key', () => {
    const key = 'vehicle:veh-1:error_codes:active';
    const v2 = [item('veh-1', { id: 'n1', semanticKey: key })];
    const health = [item('veh-1')];
    const merged = mergeV2NotificationsWithVehicleHealth(v2, health);
    expect(merged).toHaveLength(1);
  });

  it('skips bridge health when V2 already has any health notification for the vehicle', () => {
    const v2 = [
      item('veh-1', {
        id: 'n1',
        semanticKey: 'VEHICLE:veh-1:VEHICLE_HEALTH:ACTIVE_DTC',
        issueType: 'ACTIVE_DTC',
      }),
    ];
    const health = [
      item('veh-1', { semanticKey: 'vehicle:veh-1:health:tires_monitor', issueType: 'tire_monitor' }),
    ];
    const merged = mergeV2NotificationsWithVehicleHealth(v2, health);
    expect(merged).toHaveLength(1);
    expect(merged[0].semanticKey).toBe('VEHICLE:veh-1:VEHICLE_HEALTH:ACTIVE_DTC');
  });
});

describe('mergeV2WithSupplemental', () => {
  it('appends derived operational insights missing from V2 API', () => {
    const v2 = [item('v-notif', { semanticKey: 'notif:station', category: 'operations', queue: undefined })];
    const derived = [
      {
        id: 'derived-vehicles-without-tariff',
        semanticKey: 'fleet:operations:vehicles_without_tariff',
        source: 'derived-operations' as const,
        severity: 'critical' as const,
        category: 'operations' as const,
        title: '3 Fahrzeug(e) ohne Tarif',
        reason: 'Nicht buchbar',
        timeSortMs: 2000,
        priority: 90,
        tone: 'critical' as const,
        cta: 'open-price-tariffs' as const,
        isOverdue: false,
      },
    ];
    const merged = mergeV2WithSupplemental(v2, derived);
    expect(merged).toHaveLength(2);
    expect(merged.some((row) => row.id === 'derived-vehicles-without-tariff')).toBe(true);
  });

  it('dedupes supplemental rows already present in V2 by semantic key', () => {
    const key = 'fleet:operations:vehicles_without_tariff';
    const v2 = [item('n1', { semanticKey: key, category: 'operations', queue: undefined })];
    const derived = [
      {
        id: 'derived-vehicles-without-tariff',
        semanticKey: key,
        source: 'derived-operations' as const,
        severity: 'critical' as const,
        category: 'operations' as const,
        title: '3 Fahrzeug(e) ohne Tarif',
        reason: 'Nicht buchbar',
        timeSortMs: 2000,
        priority: 90,
        tone: 'critical' as const,
        cta: 'open-price-tariffs' as const,
        isOverdue: false,
      },
    ];
    expect(supplementalQueueItems(v2, derived)).toHaveLength(0);
  });
});

describe('augmentPrimaryTabCountsWithHealthItems', () => {
  it('adds warning/critical counts for supplemental health items', () => {
    const counts = augmentPrimaryTabCountsWithHealthItems(
      { all: 4, critical: 0, warning: 1, resolved: 0 },
      [item('veh-1'), item('veh-2', { severity: 'critical', queue: { ...item('x').queue!, severity: 'critical' } })],
    );
    expect(counts.all).toBe(6);
    expect(counts.warning).toBe(2);
    expect(counts.critical).toBe(1);
  });
});
