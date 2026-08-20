// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationGroupCard } from './NotificationGroupCard';
import {
  acknowledgeViaMoreActions,
  expandNotificationGroup,
  snoozeViaMoreActions,
} from './notification-lifecycle-test-helpers';
import {
  fleetReadinessGroupToActionQueueGroup,
  projectFleetReadinessVehicleGroups,
} from '../../../lib/notifications/fleet-readiness-attention-projection';
import { minimalLifecycleActionQueueItem } from '../../../lib/notifications/fixtures/action-queue-item.fixture';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';

function t(key: TranslationKey): string {
  return en[key] ?? String(key);
}

function renderCard(
  group: ActionQueueGroupItem,
  itemsById: Map<string, ActionQueueItem>,
  resolveItemLifecycleHandlers: (itemId: string) => {
    onAcknowledge?: () => void;
    onSnooze?: () => void;
  },
): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      createElement(NotificationGroupCard, {
        group,
        itemsById,
        locale: 'en',
        referenceNowMs: Date.now(),
        t,
        onItemCta: () => {},
        resolveItemLifecycleHandlers,
      }),
    );
  });

  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
  };
}

describe('NotificationGroupCard grouped lifecycle mutations', () => {
  it('invokes acknowledge with the grouped cause canonical notification id', () => {
    const cause = minimalLifecycleActionQueueItem('cause-1', {
      vehicleId: 'veh-a',
      issueType: 'TIRE_CRITICAL',
    });
    const aggregate = minimalLifecycleActionQueueItem('agg', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_NOT_READY',
    });
    const groups = projectFleetReadinessVehicleGroups([aggregate, cause]);
    const group = fleetReadinessGroupToActionQueueGroup(groups[0]!);
    expect(group.kind).toBe('group');

    const acknowledge = vi.fn();
    const itemsById = new Map<string, ActionQueueItem>([
      [aggregate.id, aggregate],
      [cause.id, cause],
    ]);

    const { container, unmount } = renderCard(
      group as ActionQueueGroupItem,
      itemsById,
      (itemId) => ({
        onAcknowledge: () => acknowledge(itemId),
      }),
    );

    expandNotificationGroup(container);
    // Children order: [aggregate, cause] — target cause row.
    acknowledgeViaMoreActions(1, container);
    expect(acknowledge).toHaveBeenCalledWith('cause-1');
    unmount();
  });

  it('invokes snooze with the grouped cause canonical notification id', () => {
    const cause = minimalLifecycleActionQueueItem('cause-2', {
      vehicleId: 'veh-a',
      issueType: 'SERVICE_OVERDUE',
    });
    const aggregate = minimalLifecycleActionQueueItem('agg', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_NOT_READY',
    });
    const groups = projectFleetReadinessVehicleGroups([aggregate, cause]);
    const group = fleetReadinessGroupToActionQueueGroup(groups[0]!);

    const snooze = vi.fn();
    const itemsById = new Map<string, ActionQueueItem>([
      [aggregate.id, aggregate],
      [cause.id, cause],
    ]);

    const { container, unmount } = renderCard(
      group as ActionQueueGroupItem,
      itemsById,
      (itemId) => ({
        onSnooze: () => snooze(itemId),
      }),
    );

    expandNotificationGroup(container);
    snoozeViaMoreActions(1, container);
    expect(snooze).toHaveBeenCalledWith('cause-2');
    unmount();
  });

  it('keeps coexisting NOT_READY and UNEVALUABLE individually actionable', () => {
    const notReady = minimalLifecycleActionQueueItem('not-ready', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_NOT_READY',
    });
    const unevaluable = minimalLifecycleActionQueueItem('unevaluable', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_READINESS_UNEVALUABLE',
    });
    const groups = projectFleetReadinessVehicleGroups([notReady, unevaluable]);
    const group = fleetReadinessGroupToActionQueueGroup(groups[0]!);

    const acknowledged: string[] = [];
    const itemsById = new Map<string, ActionQueueItem>([
      [notReady.id, notReady],
      [unevaluable.id, unevaluable],
    ]);

    const { container, unmount } = renderCard(
      group as ActionQueueGroupItem,
      itemsById,
      (itemId) => ({
        onAcknowledge: () => acknowledged.push(itemId),
      }),
    );

    expandNotificationGroup(container);
    acknowledgeViaMoreActions(0, container);
    acknowledgeViaMoreActions(1, container);

    expect(acknowledged.sort()).toEqual(['not-ready', 'unevaluable']);
    unmount();
  });

  it('keeps header aggregate actionable when concrete causes exist', () => {
    const aggregate = minimalLifecycleActionQueueItem('agg-only', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_READINESS_UNEVALUABLE',
    });
    const cause = minimalLifecycleActionQueueItem('cause', {
      vehicleId: 'veh-a',
      issueType: 'ACTIVE_DTC',
    });
    const groups = projectFleetReadinessVehicleGroups([aggregate, cause]);
    const group = fleetReadinessGroupToActionQueueGroup(groups[0]!);
    expect(group.kind).toBe('group');
    if (group.kind === 'group') {
      expect(group.children.some((child) => child.itemId === 'agg-only')).toBe(true);
    }

    const acknowledge = vi.fn();
    const itemsById = new Map<string, ActionQueueItem>([
      [aggregate.id, aggregate],
      [cause.id, cause],
    ]);

    const { container, unmount } = renderCard(
      group as ActionQueueGroupItem,
      itemsById,
      (itemId) => ({
        onAcknowledge: itemId === 'agg-only' ? () => acknowledge(itemId) : undefined,
      }),
    );

    expandNotificationGroup(container);
    acknowledgeViaMoreActions(0, container);
    expect(acknowledge).toHaveBeenCalledWith('agg-only');
    unmount();
  });

  it('never routes vehicle A mutations to vehicle B notifications', () => {
    const vehA = minimalLifecycleActionQueueItem('cause-a', {
      vehicleId: 'veh-a',
      issueType: 'TIRE_CRITICAL',
    });
    const vehB = minimalLifecycleActionQueueItem('cause-b', {
      vehicleId: 'veh-b',
      issueType: 'TIRE_CRITICAL',
    });
    const groups = projectFleetReadinessVehicleGroups([vehA, vehB]);
    expect(groups).toHaveLength(2);

    const groupA = fleetReadinessGroupToActionQueueGroup(groups.find((g) => g.vehicleId === 'veh-a')!);
    const acknowledged: string[] = [];
    const itemsById = new Map<string, ActionQueueItem>([
      [vehA.id, vehA],
      [vehB.id, vehB],
    ]);

    const { container, unmount } = renderCard(
      groupA as ActionQueueGroupItem,
      itemsById,
      (itemId) => ({
        onAcknowledge: () => acknowledged.push(itemId),
      }),
    );

    expandNotificationGroup(container);
    acknowledgeViaMoreActions(0, container);
    expect(acknowledged).toEqual(['cause-a']);
    unmount();
  });
});
