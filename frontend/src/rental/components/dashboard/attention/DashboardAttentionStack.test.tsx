// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAttentionStack } from './DashboardAttentionStack';
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
          ready: 4,
          total: 5,
          readyPercent: 80,
          notReady: 1,
          unevaluable: 0,
          unknown: 0,
        },
        loading: false,
        error: null,
        refresh: async () => {},
      },
    },
    pickupItems: [],
    returnItems: [],
    handleConfirmPickup: vi.fn(),
    handleConfirmReturn: vi.fn(),
    isRefreshing: false,
    ...overrides,
  } as DashboardViewModel;
}

describe('DashboardAttentionStack', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders a single notification card with scope tabs and counts', () => {
    const vm = minimalVm();
    vm.dashboardAttention!.operations.entries = [
      { kind: 'leaf', id: 'ops-1' } as never,
      { kind: 'leaf', id: 'ops-2' } as never,
    ];
    vm.dashboardAttention!.fleetReadiness.entries = [{ kind: 'leaf', id: 'fleet-1' } as never];

    act(() => {
      root.render(
        createElement(DashboardAttentionStack, {
          vm,
          handlers: {},
          t,
          locale: 'en',
          layout: 'sidebar',
        }),
      );
    });

    expect(container.querySelectorAll('[data-testid="dashboard-attention-stack"]')).toHaveLength(1);
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(container.textContent).toContain(en['notification.panelTitle']);
    expect(container.textContent).toContain(en['notification.tab.operations']);
    expect(container.textContent).toContain(en['nav.fleet']);
    expect(container.textContent).toContain(en['dashboardAttention.operations.subtitle']);
    expect(container.textContent).not.toContain(en['dashboardAttention.fleetReadiness.subtitle']);

    const operationsTab = container.querySelector('[data-testid="dashboard-attention-scope-operations"]');
    const fleetTab = container.querySelector('[data-testid="dashboard-attention-scope-fleet"]');
    expect(operationsTab?.getAttribute('aria-selected')).toBe('true');
    expect(fleetTab?.getAttribute('aria-selected')).toBe('false');
    expect(operationsTab?.textContent).toContain('2');
    expect(fleetTab?.textContent).toContain('1');
  });

  it('switches to fleet notifications when fleet tab is selected', () => {
    act(() => {
      root.render(
        createElement(DashboardAttentionStack, {
          vm: minimalVm(),
          handlers: {},
          t,
          locale: 'en',
        }),
      );
    });

    const fleetTab = container.querySelector('[data-testid="dashboard-attention-scope-fleet"]') as HTMLButtonElement;
    act(() => {
      fleetTab.click();
    });

    expect(fleetTab.getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).toContain(en['dashboardAttention.fleetReadiness.subtitle']);
    expect(container.textContent).not.toContain(en['dashboardAttention.operations.subtitle']);
    expect(container.textContent).toContain('4 of 5 ready');
  });

  it('shows zero fleet count and preserves empty fleet state', () => {
    act(() => {
      root.render(
        createElement(DashboardAttentionStack, {
          vm: minimalVm(),
          handlers: {},
          t,
          locale: 'en',
        }),
      );
    });

    const fleetTab = container.querySelector('[data-testid="dashboard-attention-scope-fleet"]') as HTMLButtonElement;
    expect(fleetTab.textContent).toContain('0');

    act(() => {
      fleetTab.click();
    });

    expect(container.textContent).toContain(en['notification.empty.noneActive']);
  });
});
