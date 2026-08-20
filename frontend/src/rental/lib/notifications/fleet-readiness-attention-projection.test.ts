import { describe, expect, it } from 'vitest';
import {
  fleetReadinessGroupToActionQueueGroup,
  projectFleetReadinessPresentationItems,
  projectFleetReadinessVehicleGroups,
} from './fleet-readiness-attention-projection';
import { minimalActionQueueItem } from './fixtures/action-queue-item.fixture';

describe('projectFleetReadinessVehicleGroups', () => {
  it('groups items by vehicle (req 4)', () => {
    const items = [
      minimalActionQueueItem('cause-a', { vehicleId: 'veh-a', issueType: 'ACTIVE_DTC' }),
      minimalActionQueueItem('cause-b', { vehicleId: 'veh-a', issueType: 'TIRE_CRITICAL' }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.vehicleId).toBe('veh-a');
    expect(groups[0]?.causes.map((row) => row.id)).toEqual(['cause-a', 'cause-b']);
  });

  it('separates aggregate and causes for the same vehicle (req 5)', () => {
    const items = [
      minimalActionQueueItem('agg', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        severity: 'warning',
      }),
      minimalActionQueueItem('cause', {
        vehicleId: 'veh-a',
        issueType: 'ACTIVE_DTC',
        severity: 'critical',
      }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.aggregateEventType).toBe('VEHICLE_NOT_READY');
    expect(groups[0]?.aggregateItem?.id).toBe('agg');
    expect(groups[0]?.causes.map((row) => row.id)).toEqual(['cause']);
    expect(groups[0]?.severity).toBe('critical');
  });

  it('handles aggregate-only vehicles as a single leaf projection (req 6)', () => {
    const items = [
      minimalActionQueueItem('agg-only', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
      }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    expect(groups[0]?.causes).toHaveLength(0);

    const projected = fleetReadinessGroupToActionQueueGroup(groups[0]!);
    expect(projected.kind).toBe('leaf');
    expect(projected.id).toBe('agg-only');
  });

  it('handles unevaluable-only vehicles (req 7)', () => {
    const items = [
      minimalActionQueueItem('unevaluable', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_READINESS_UNEVALUABLE',
        severity: 'warning',
      }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    expect(groups[0]?.aggregateEventType).toBe('VEHICLE_READINESS_UNEVALUABLE');
    expect(groups[0]?.causes).toHaveLength(0);

    const projected = fleetReadinessGroupToActionQueueGroup(groups[0]!);
    expect(projected.kind).toBe('leaf');
    expect(projected.id).toBe('unevaluable');
  });

  it('isolates multiple vehicles into separate groups (req 8)', () => {
    const items = [
      minimalActionQueueItem('agg-a', { vehicleId: 'veh-a', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('cause-a', { vehicleId: 'veh-a', issueType: 'ACTIVE_DTC' }),
      minimalActionQueueItem('agg-b', { vehicleId: 'veh-b', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('cause-b', { vehicleId: 'veh-b', issueType: 'TIRE_CRITICAL' }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    expect(groups.map((group) => group.vehicleId).sort()).toEqual(['veh-a', 'veh-b']);
    expect(groups.find((group) => group.vehicleId === 'veh-a')?.causes).toHaveLength(1);
    expect(groups.find((group) => group.vehicleId === 'veh-b')?.causes).toHaveLength(1);
  });
});

describe('projectFleetReadinessPresentationItems', () => {
  it('projects grouped vehicles and preserves non-vehicle rows', () => {
    const items = [
      minimalActionQueueItem('agg-a', { vehicleId: 'veh-a', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('cause-a', { vehicleId: 'veh-a', issueType: 'ACTIVE_DTC' }),
      minimalActionQueueItem('fleet-wide', { vehicleId: undefined, category: 'operations' }),
    ];

    const projected = projectFleetReadinessPresentationItems(items);
    expect(projected.some((row) => row.kind === 'group' && row.id === 'fleet-readiness:veh-a')).toBe(true);
    expect(projected.some((row) => row.kind === 'leaf' && row.id === 'fleet-wide')).toBe(true);
  });
});
