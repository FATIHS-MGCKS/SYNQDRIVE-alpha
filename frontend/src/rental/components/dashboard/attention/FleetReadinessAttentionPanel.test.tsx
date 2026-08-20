// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FleetReadinessAttentionPanel } from './FleetReadinessAttentionPanel';
import type { DashboardViewModel } from '../dashboardTypes';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';

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

function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let value: string = en[key] ?? String(key);
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(val));
    }
  }
  return value;
}

function minimalVm(overrides: Partial<DashboardViewModel> = {}): DashboardViewModel {
  return {
    dashboardAttention: {
      splitActive: true,
      operations: {
        items: [],
        entries: [],
        loading: false,
        error: null,
        errorCode: null,
        total: 0,
        refresh: async () => {},
        mutations: {
          markRead: async () => {},
          markUnread: async () => {},
          acknowledge: async () => {},
          snooze: async () => {},
          unsnooze: async () => {},
          resolveNotification: async () => {},
          archiveNotification: async () => {},
          loadMore: async () => {},
          hasMore: false,
        },
      },
      fleetReadiness: {
        items: [],
        entries: [],
        loading: false,
        error: null,
        errorCode: null,
        total: 0,
        refresh: async () => {},
        mutations: {
          markRead: async () => {},
          markUnread: async () => {},
          acknowledge: async () => {},
          snooze: async () => {},
          unsnooze: async () => {},
          resolveNotification: async () => {},
          archiveNotification: async () => {},
          loadMore: async () => {},
          hasMore: false,
        },
      },
      fleetSummary: {
        summary: {
          total: 47,
          ready: 42,
          notReady: 3,
          unevaluable: 1,
          unknown: 1,
          readyPercent: 89,
        },
        loading: false,
        error: null,
        refresh: async () => {},
      },
    },
    pickupItems: [],
    returnItems: [],
    handleConfirmPickup: () => {},
    handleConfirmReturn: () => {},
    ...overrides,
  } as DashboardViewModel;
}

function renderPanel(vm: DashboardViewModel): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      createElement(FleetReadinessAttentionPanel, {
        vm,
        handlers: {},
        t,
        locale: 'en',
        referenceNowMs: Date.now(),
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

describe('FleetReadinessAttentionPanel', () => {
  it('displays canonical fleet summary values without recomputation (req 9)', () => {
    const { container, unmount } = renderPanel(minimalVm());

    expect(container.textContent).toContain('42 of 47 ready');
    expect(container.textContent).toContain('89% ready');
    expect(container.textContent).toContain('3 not ready');
    expect(container.textContent).toContain('1 unevaluable');
    expect(container.textContent).toContain('1 unknown');
    unmount();
  });

  it('shows summary unavailable while fleet notifications can still render (req 11)', () => {
    const vm = minimalVm({
      dashboardAttention: {
        ...minimalVm().dashboardAttention!,
        fleetSummary: {
          summary: null,
          loading: false,
          error: new Error('summary failed'),
          refresh: async () => {},
        },
        fleetReadiness: {
          ...minimalVm().dashboardAttention!.fleetReadiness,
          items: [
            {
              id: 'fleet-1',
              source: 'notifications-v2',
              severity: 'warning',
              category: 'health',
              title: 'Vehicle not ready',
              reason: 'reason',
              timeSortMs: 1000,
              priority: 50,
              tone: 'warning',
              cta: 'open-vehicle',
              vehicleId: 'veh-a',
              isOverdue: false,
              entityContextParams: { plate: 'WOB L 1' },
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
                actionTarget: { type: 'open-vehicle', vehicleId: 'veh-a' },
                semanticKey: 'vehicle:veh-a:vehicle_not_ready',
                sortMs: 1000,
                issueType: 'VEHICLE_NOT_READY',
              },
            },
          ],
          entries: [
            {
              kind: 'leaf',
              id: 'fleet-1',
              source: 'notifications-v2',
              severity: 'warning',
              category: 'health',
              title: 'Vehicle not ready',
              reason: 'reason',
              timeSortMs: 1000,
              priority: 50,
              tone: 'warning',
              cta: 'open-vehicle',
              vehicleId: 'veh-a',
              isOverdue: false,
              entityContextParams: { plate: 'WOB L 1' },
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
                actionTarget: { type: 'open-vehicle', vehicleId: 'veh-a' },
                semanticKey: 'vehicle:veh-a:vehicle_not_ready',
                sortMs: 1000,
                issueType: 'VEHICLE_NOT_READY',
              },
            },
          ],
        },
      },
    });

    const { container, unmount } = renderPanel(vm);

    expect(container.textContent).toContain('Fleet readiness summary unavailable.');
    expect(container.textContent).toContain('WOB L 1');
    unmount();
  });
});
