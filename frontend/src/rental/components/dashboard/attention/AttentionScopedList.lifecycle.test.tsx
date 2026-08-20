// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AttentionScopedList } from './AttentionScopedList';
import {
  acknowledgeViaMoreActions,
  expandNotificationGroup,
  expandNotificationLeafDetails,
} from '../notifications/notification-lifecycle-test-helpers';
import { projectFleetReadinessPresentationItems } from '../../../lib/notifications/fleet-readiness-attention-projection';
import { minimalLifecycleActionQueueItem } from '../../../lib/notifications/fixtures/action-queue-item.fixture';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { ActionQueueItem, DashboardViewModel } from '../dashboardTypes';

vi.mock('../../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../../../context/RentalEntityNavigationContext', () => ({
  useRentalEntityNavigation: () => ({}),
}));

vi.mock('../../../../lib/api', () => ({
  api: {
    vendors: { list: vi.fn().mockResolvedValue([]) },
  },
}));

function t(key: TranslationKey): string {
  return en[key] ?? String(key);
}

function minimalVm(): DashboardViewModel {
  return {
    pickupItems: [],
    returnItems: [],
    handleConfirmPickup: () => {},
    handleConfirmReturn: () => {},
  } as unknown as DashboardViewModel;
}

const lifecycleMutations = (overrides: {
  acknowledge?: (id: string) => void | Promise<void>;
  snooze?: (id: string) => void | Promise<void>;
} = {}) => ({
  markRead: async () => {},
  markUnread: async () => {},
  acknowledge: async (id: string) => {
    await overrides.acknowledge?.(id);
  },
  snooze: async (id: string) => {
    await overrides.snooze?.(id);
  },
  unsnooze: async () => {},
  resolveNotification: async () => {},
  archiveNotification: async () => {},
  loadMore: async () => {},
  hasMore: false,
});

describe('AttentionScopedList leaf lifecycle behavior', () => {
  it('still wires leaf acknowledge to the canonical notification id', () => {
    const item = minimalLifecycleActionQueueItem('leaf-1', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_NOT_READY',
    });
    const acknowledge = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(
        createElement(AttentionScopedList, {
          entries: [{ ...item, kind: 'leaf' }],
          itemsById: new Map([[item.id, item]]),
          loading: false,
          error: false,
          errorCode: null,
          emptyVariant: 'none-active',
          vm: minimalVm(),
          handlers: {},
          mutations: lifecycleMutations({ acknowledge }),
          t,
          locale: 'en',
          referenceNowMs: Date.now(),
        }),
      );
    });

    expandNotificationLeafDetails(container);
    acknowledgeViaMoreActions(0, container);
    expect(acknowledge).toHaveBeenCalledWith('leaf-1');

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});

describe('AttentionScopedList grouped fleet readiness lifecycle', () => {
  it('wires grouped acknowledge through AttentionScopedList mutations', () => {
    const aggregate = minimalLifecycleActionQueueItem('agg', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_NOT_READY',
    });
    const cause = minimalLifecycleActionQueueItem('cause', {
      vehicleId: 'veh-a',
      issueType: 'TIRE_CRITICAL',
    });
    const items: ActionQueueItem[] = [aggregate, cause];
    const entries = projectFleetReadinessPresentationItems(items);
    const acknowledge = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(
        createElement(AttentionScopedList, {
          entries,
          itemsById: new Map(items.map((row) => [row.id, row])),
          loading: false,
          error: false,
          errorCode: null,
          emptyVariant: 'none-active',
          vm: minimalVm(),
          handlers: {},
          mutations: lifecycleMutations({ acknowledge }),
          t,
          locale: 'en',
          referenceNowMs: Date.now(),
        }),
      );
    });

    expandNotificationGroup(container);
    // Children: [agg, cause] — target cause row.
    acknowledgeViaMoreActions(1, container);
    expect(acknowledge).toHaveBeenCalledWith('cause');

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});
