import { describe, expect, it } from 'vitest';
import {
  collectFleetReadinessRepresentedNotificationIds,
  fleetReadinessGroupToActionQueueGroup,
  projectFleetReadinessPresentationItems,
  projectFleetReadinessVehicleGroups,
  resolveFleetReadinessGroupPriority,
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
    expect(groups[0]?.primaryAggregate?.issueType).toBe('VEHICLE_NOT_READY');
    expect(groups[0]?.primaryAggregate?.id).toBe('agg');
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
    expect(groups[0]?.primaryAggregate?.issueType).toBe('VEHICLE_READINESS_UNEVALUABLE');
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

describe('simultaneous readiness aggregates (P2.4 coexistence)', () => {
  it('A. represents NOT_READY + UNEVALUABLE on one vehicle without hiding either', () => {
    const items = [
      minimalActionQueueItem('not-ready', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        title: 'Vehicle not ready — WOB L 1',
      }),
      minimalActionQueueItem('unevaluable', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_READINESS_UNEVALUABLE',
        title: 'Readiness unevaluable — WOB L 1',
      }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.primaryAggregate?.id).toBe('unevaluable');
    expect(groups[0]?.preservedNotReadyAggregate?.id).toBe('not-ready');

    const projected = fleetReadinessGroupToActionQueueGroup(groups[0]!);
    expect(projected.kind).toBe('group');
    if (projected.kind === 'group') {
      expect(projected.title).toContain('unevaluable');
      expect(projected.children.map((child) => child.itemId)).toEqual(['not-ready', 'unevaluable']);
    }
  });

  it('B. NOT_READY + UNEVALUABLE + one concrete cause stay in one vehicle context', () => {
    const items = [
      minimalActionQueueItem('not-ready', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        title: 'Vehicle not ready — WOB L 1',
      }),
      minimalActionQueueItem('unevaluable', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_READINESS_UNEVALUABLE',
        title: 'Readiness unevaluable — WOB L 1',
      }),
      minimalActionQueueItem('cause', {
        vehicleId: 'veh-a',
        issueType: 'TIRE_CRITICAL',
        title: 'Tire critical — WOB L 1',
      }),
    ];

    const projected = projectFleetReadinessPresentationItems(items);
    expect(projected.filter((row) => row.kind === 'group')).toHaveLength(1);

    const group = projected.find((row) => row.kind === 'group' && row.id === 'fleet-readiness:veh-a');
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') {
      expect(group.title).toContain('unevaluable');
      expect(group.children.map((child) => child.itemId)).toEqual(['not-ready', 'unevaluable', 'cause']);
    }
  });

  it('C. coexistence on vehicle A does not affect vehicle B grouping', () => {
    const items = [
      minimalActionQueueItem('not-ready-a', { vehicleId: 'veh-a', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('unevaluable-a', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_READINESS_UNEVALUABLE',
      }),
      minimalActionQueueItem('not-ready-b', { vehicleId: 'veh-b', issueType: 'VEHICLE_NOT_READY' }),
    ];

    const groups = projectFleetReadinessVehicleGroups(items);
    const vehicleA = groups.find((group) => group.vehicleId === 'veh-a');
    const vehicleB = groups.find((group) => group.vehicleId === 'veh-b');

    expect(vehicleA?.preservedNotReadyAggregate?.id).toBe('not-ready-a');
    expect(vehicleA?.primaryAggregate?.id).toBe('unevaluable-a');
    expect(vehicleB?.preservedNotReadyAggregate).toBeUndefined();
    expect(vehicleB?.primaryAggregate?.id).toBe('not-ready-b');
  });

  it('D. no canonical notification disappears without explicit presentation representation', () => {
    const items = [
      minimalActionQueueItem('not-ready', { vehicleId: 'veh-a', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('unevaluable', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_READINESS_UNEVALUABLE',
      }),
      minimalActionQueueItem('cause', { vehicleId: 'veh-a', issueType: 'SERVICE_OVERDUE' }),
      minimalActionQueueItem('fleet-wide', { vehicleId: undefined, issueType: 'STATION_SHORTAGE' }),
    ];

    const represented = collectFleetReadinessRepresentedNotificationIds(items);
    for (const item of items) {
      expect(represented.has(item.id)).toBe(true);
    }
  });
});

describe('resolveFleetReadinessGroupPriority', () => {
  it('preserves explicit aggregate priority', () => {
    const group = {
      vehicleId: 'veh-a',
      label: 'WOB L 1',
      primaryAggregate: minimalActionQueueItem('agg', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        priority: 77,
      }),
      causes: [],
      severity: 'warning' as const,
    };

    expect(resolveFleetReadinessGroupPriority(group, [])).toBe(77);
  });

  it('uses critical fallback when aggregate priority is absent', () => {
    const group = {
      vehicleId: 'veh-a',
      label: 'WOB L 1',
      primaryAggregate: minimalActionQueueItem('agg', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        priority: undefined,
      }),
      causes: [
        minimalActionQueueItem('cause', {
          vehicleId: 'veh-a',
          issueType: 'ACTIVE_DTC',
          severity: 'critical',
        }),
      ],
      severity: 'critical' as const,
    };

    const projected = fleetReadinessGroupToActionQueueGroup(group);
    expect(projected.kind).toBe('group');
    if (projected.kind === 'group') {
      expect(projected.priority).toBe(100);
    }
  });

  it('uses non-critical fallback when aggregate priority is absent', () => {
    const group = {
      vehicleId: 'veh-a',
      label: 'WOB L 1',
      primaryAggregate: minimalActionQueueItem('agg', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        priority: undefined,
      }),
      causes: [
        minimalActionQueueItem('cause', {
          vehicleId: 'veh-a',
          issueType: 'ACTIVE_DTC',
          severity: 'warning',
        }),
      ],
      severity: 'warning' as const,
    };

    const projected = fleetReadinessGroupToActionQueueGroup(group);
    expect(projected.kind).toBe('group');
    if (projected.kind === 'group') {
      expect(projected.priority).toBe(50);
    }
  });
});

describe('aggregate actionability in expanded groups', () => {
  it('keeps single aggregate + causes actionable via aggregate child row', () => {
    const items = [
      minimalActionQueueItem('agg', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        title: 'Vehicle not ready — WOB L 1',
      }),
      minimalActionQueueItem('cause', {
        vehicleId: 'veh-a',
        issueType: 'TIRE_CRITICAL',
      }),
    ];

    const projected = projectFleetReadinessPresentationItems(items);
    const group = projected.find((row) => row.kind === 'group');
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') {
      expect(group.children.map((child) => child.itemId)).toEqual(['agg', 'cause']);
    }
  });
});

describe('grouped lifecycle-action reachability audit', () => {
  it('keeps coexisting aggregate notifications reachable via group child itemIds', () => {
    const items = [
      minimalActionQueueItem('not-ready', { vehicleId: 'veh-a', issueType: 'VEHICLE_NOT_READY' }),
      minimalActionQueueItem('unevaluable', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_READINESS_UNEVALUABLE',
      }),
    ];

    const projected = projectFleetReadinessPresentationItems(items);
    const group = projected.find((row) => row.kind === 'group');
    expect(group?.kind).toBe('group');
    if (group?.kind === 'group') {
      const childIds = new Set(group.children.map((child) => child.itemId));
      expect(childIds.has('not-ready')).toBe(true);
      expect(childIds.has('unevaluable')).toBe(true);
    }
  });
});

describe('pagination-boundary partial context (P32-F01)', () => {
  it('aggregate-only page 1 shows incomplete group context before loadMore, then merges cause', () => {
    const page1Items = [
      minimalActionQueueItem('agg-a', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        severity: 'warning',
      }),
    ];

    const beforeLoadMore = projectFleetReadinessPresentationItems(page1Items, {
      hasMoreUnloadedPages: true,
    });
    expect(beforeLoadMore).toHaveLength(1);

    const groupBefore = beforeLoadMore[0];
    expect(groupBefore?.kind).toBe('group');
    if (groupBefore?.kind === 'group') {
      expect(groupBefore.id).toBe('fleet-readiness:veh-a');
      expect(groupBefore.fleetCausesMayBeIncomplete).toBe(true);
      expect(groupBefore.subtitle).toBe('');
      expect(groupBefore.children.map((child) => child.itemId)).toEqual(['agg-a']);
    }

    const page2Items = [
      ...page1Items,
      minimalActionQueueItem('cause-critical', {
        vehicleId: 'veh-a',
        issueType: 'TIRE_CRITICAL',
        severity: 'critical',
      }),
    ];

    const afterLoadMore = projectFleetReadinessPresentationItems(page2Items, {
      hasMoreUnloadedPages: false,
    });
    const vehiclePresentations = afterLoadMore.filter(
      (row) => row.kind === 'group' && row.id === 'fleet-readiness:veh-a',
    );
    expect(vehiclePresentations).toHaveLength(1);

    const groupAfter = vehiclePresentations[0];
    expect(groupAfter?.kind).toBe('group');
    if (groupAfter?.kind === 'group') {
      expect(groupAfter.fleetCausesMayBeIncomplete).toBe(false);
      expect(groupAfter.severity).toBe('critical');
      expect(groupAfter.subtitle).toBe('1');
      expect(groupAfter.children.map((child) => child.itemId)).toEqual(['agg-a', 'cause-critical']);
    }
  });

  it('single loaded cause with more pages does not imply exhaustive vehicle context', () => {
    const page1Items = [
      minimalActionQueueItem('cause-only', {
        vehicleId: 'veh-a',
        issueType: 'TIRE_CRITICAL',
        severity: 'critical',
      }),
    ];

    const beforeLoadMore = projectFleetReadinessPresentationItems(page1Items, {
      hasMoreUnloadedPages: true,
    });
    expect(beforeLoadMore).toHaveLength(1);

    const groupBefore = beforeLoadMore[0];
    expect(groupBefore?.kind).toBe('group');
    if (groupBefore?.kind === 'group') {
      expect(groupBefore.fleetCausesMayBeIncomplete).toBe(true);
      expect(groupBefore.subtitle).toBe('');
      expect(groupBefore.children.map((child) => child.itemId)).toEqual(['cause-only']);
    }

    const afterLoadMore = projectFleetReadinessPresentationItems(page1Items, {
      hasMoreUnloadedPages: false,
    });
    const groupAfter = afterLoadMore[0];
    expect(groupAfter?.kind).toBe('group');
    if (groupAfter?.kind === 'group') {
      expect(groupAfter.fleetCausesMayBeIncomplete).toBe(false);
      expect(groupAfter.subtitle).toBe('1');
    }
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
