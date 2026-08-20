// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPanel } from './NotificationPanel';
import {
  acknowledgeViaMoreActions,
  expandNotificationGroup,
} from './notification-lifecycle-test-helpers';
import { minimalLifecycleActionQueueItem } from '../../../lib/notifications/fixtures/action-queue-item.fixture';
import { enrichNotificationGroupingList } from '../../../lib/notifications/enrich-notification-grouping';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';
import type { ActionQueueItem, DashboardViewModel } from '../dashboardTypes';

vi.mock('../../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: TranslationKey) => en[key] ?? String(key),
    locale: 'en',
  }),
}));

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

function minimalVm(actionQueue: ActionQueueItem[], mutations: {
  acknowledge?: (id: string) => void | Promise<void>;
}): DashboardViewModel {
  return {
    pickupItems: [],
    returnItems: [],
    handleConfirmPickup: () => {},
    handleConfirmReturn: () => {},
    locale: 'en',
    dataTrust: {
      overallStatus: 'live',
      lastRefreshLabel: 'just now',
      domains: [
        {
          id: 'booking',
          label: 'Bookings',
          status: 'live',
          detail: '',
          timestampLabel: '',
          computable: true,
        },
        {
          id: 'handover',
          label: 'Handover',
          status: 'live',
          detail: '',
          timestampLabel: '',
          computable: true,
        },
      ],
    },
    actionQueue,
    actionQueueLoading: false,
    actionQueueError: false,
    notificationPrimaryTabCounts: { all: actionQueue.length, critical: 0, warning: actionQueue.length, resolved: 0 },
    notificationMutations: {
      markRead: async () => {},
      markUnread: async () => {},
      acknowledge: async (id: string) => {
        await mutations.acknowledge?.(id);
      },
      snooze: async () => {},
      unsnooze: async () => {},
      resolveNotification: async () => {},
      archiveNotification: async () => {},
      loadMore: async () => {},
      hasMore: false,
    },
  } as unknown as DashboardViewModel;
}

describe('NotificationPanel operator-focus grouped lifecycle parity (P32-F03)', () => {
  it('wires grouped child acknowledge through resolveItemLifecycleHandlers', () => {
    const referenceNowMs = Date.now();
    const aggregate = minimalLifecycleActionQueueItem('agg', {
      vehicleId: 'veh-a',
      issueType: 'VEHICLE_NOT_READY',
    });
    const cause = minimalLifecycleActionQueueItem('cause-tire', {
      vehicleId: 'veh-a',
      issueType: 'TIRE_CRITICAL',
    });
    const enriched = enrichNotificationGroupingList([aggregate, cause], 'en', referenceNowMs);
    const acknowledge = vi.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    act(() => {
      root.render(
        createElement(NotificationPanel, {
          vm: minimalVm(enriched, { acknowledge }),
          handlers: {},
        }),
      );
    });

    expandNotificationGroup(container.querySelector('article') as HTMLElement);
    acknowledgeViaMoreActions(0, container.querySelector('article') as HTMLElement);
    expect(acknowledge).toHaveBeenCalledWith('cause-tire');

    act(() => {
      root.unmount();
      container.remove();
    });
  });
});
