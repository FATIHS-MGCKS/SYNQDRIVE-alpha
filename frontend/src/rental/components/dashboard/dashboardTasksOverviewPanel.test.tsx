// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardTasksOverviewPanel } from './DashboardTasksOverviewPanel';
import type { DashboardViewModel } from './dashboardTypes';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';

const mockOverview = vi.fn();
const mockUseRentalOrg = vi.fn();

vi.mock('./useDashboardTasksOverview', () => ({
  useDashboardTasksOverview: (...args: unknown[]) => mockOverview(...args),
}));

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => mockUseRentalOrg(),
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

function minimalVm(): DashboardViewModel {
  return {
    locale: 'de',
    t,
    selectedStationId: null,
    selectedStationName: null,
    fleetVehicles: [],
  } as unknown as DashboardViewModel;
}

describe('DashboardTasksOverviewPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-1',
      userRole: 'ORG_ADMIN',
      hasPermission: () => true,
    });
    mockOverview.mockReturnValue({
      counts: { open: 2, overdue: 1, today: 1, inProgress: 0, unassigned: 1 },
      previewTasks: [{ id: 't1', title: 'Test', status: 'OPEN', priority: 'NORMAL' }],
      loading: false,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      countsComplete: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('does not render without tasks.read permission', () => {
    mockUseRentalOrg.mockReturnValue({
      orgId: 'org-1',
      userRole: 'ORG_USER',
      hasPermission: () => false,
    });

    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    expect(container.querySelector('[data-testid="dashboard-tasks-overview-panel"]')).toBeNull();
  });

  it('shows loading state without zero-count subtitle', () => {
    mockOverview.mockReturnValue({
      counts: null,
      previewTasks: [],
      loading: true,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      countsComplete: false,
    });

    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    expect(container.textContent).toContain(en['dashboardTasksOverview.subtitleLoading']);
    expect(container.querySelector('[data-testid="dashboard-tasks-overview-loading"]')).not.toBeNull();
    expect(container.textContent).not.toContain('0 offen');
  });

  it('shows error state without zero-count chips', () => {
    mockOverview.mockReturnValue({
      counts: null,
      previewTasks: [],
      loading: false,
      error: 'failed',
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      countsComplete: true,
    });

    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    expect(container.textContent).toContain(en['dashboardTasksOverview.error']);
    expect(container.querySelector('[data-testid="dashboard-tasks-overview-status-chips"]')).toBeNull();
  });

  it('shows empty state when open count is zero', () => {
    mockOverview.mockReturnValue({
      counts: { open: 0, overdue: 0, today: 0, inProgress: 0, unassigned: 0 },
      previewTasks: [],
      loading: false,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      countsComplete: true,
    });

    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    expect(container.textContent).toContain(en['dashboardTasksOverview.emptyTitle']);
    expect(container.textContent).toContain(en['dashboardTasksOverview.emptyDescription']);
  });

  it('passes selectedStationId into overview hook for station-scoped mode', () => {
    act(() => {
      root.render(
        createElement(DashboardTasksOverviewPanel, {
          vm: { ...minimalVm(), selectedStationId: 'st-1' } as DashboardViewModel,
        }),
      );
    });

    expect(mockOverview).toHaveBeenCalledWith(
      expect.objectContaining({ selectedStationId: 'st-1' }),
    );
  });
});

describe('DashboardView integration contract', () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');

  it('renders tasks overview below controlFinanceGrid in standard layout only', () => {
    expect(dashboardViewSrc).toMatch(/controlFinanceGrid[\s\S]*DashboardTasksOverviewPanel/);
    const focusBranch = dashboardViewSrc.match(
      /if \(vm\.operatorFocusMode\) \{[\s\S]*?\n  \}\n\n  return/,
    )?.[0];
    expect(focusBranch).toBeTruthy();
    expect(focusBranch).not.toContain('DashboardTasksOverviewPanel');
  });

  it('does not alter existing mobile order slots', () => {
    const shellSrc = readFileSync(resolve(testDir, './dashboardShell.tsx'), 'utf8');
    expect(shellSrc).toMatch(/controlKpiSlot:[\s\S]*order-1/);
    expect(shellSrc).toMatch(/notificationsSlot:[\s\S]*order-2/);
    expect(shellSrc).toMatch(/financeSlot:[\s\S]*order-3/);
  });
});

describe('useDashboardTasksOverview station vs org-wide wiring', () => {
  it('disables summary query when station is selected', async () => {
    const { useDashboardTasksOverview } = await import('./useDashboardTasksOverview');
    expect(typeof useDashboardTasksOverview).toBe('function');
    expect(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './useDashboardTasksOverview.ts'), 'utf8')).toMatch(
      /enabled: queryEnabled && !stationScoped/,
    );
  });
});
