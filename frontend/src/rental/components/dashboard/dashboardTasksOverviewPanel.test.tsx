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
      previewTasks: [{
        id: 't1',
        title: 'Test',
        description: '',
        category: '',
        type: 'CUSTOM',
        status: 'OPEN',
        priority: 'NORMAL',
        organizationId: 'org-1',
        source: null,
        sourceType: 'MANUAL',
        dedupKey: null,
        vehicleId: null,
        bookingId: null,
        customerId: null,
        vendorId: null,
        alertId: null,
        documentId: null,
        fineId: null,
        invoiceId: null,
        serviceCaseId: null,
        assignedUserId: null,
        estimatedCostCents: null,
        actualCostCents: null,
        resolutionNote: null,
        blocksVehicleAvailability: false,
        metadata: null,
        isOverdue: false,
        dueDate: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      loading: false,
      countsLoading: false,
      previewLoading: false,
      previewReady: true,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      listComplete: true,
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
      countsLoading: true,
      previewLoading: true,
      previewReady: false,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      listComplete: false,
    });

    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    expect(container.querySelector('[data-testid="dashboard-tasks-overview-open-count-loading"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="dashboard-tasks-overview-loading"]')).not.toBeNull();
    expect(container.textContent).not.toContain('0 open');
    expect(container.textContent).not.toContain(en['dashboardTasksOverview.openTasksSubtitle']);
    expect(container.textContent).not.toContain(en['dashboardTasksOverview.subtitleLoading']);
  });

  it('shows preview loading without rendering partial preview rows', () => {
    mockOverview.mockReturnValue({
      counts: { open: 3, overdue: 1, today: 1, inProgress: 0, unassigned: 1 },
      previewTasks: [],
      loading: true,
      countsLoading: false,
      previewLoading: true,
      previewReady: false,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      listComplete: false,
    });

    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    expect(container.querySelector('[data-testid="dashboard-tasks-overview-preview"]')).toBeNull();
    expect(container.querySelector('[data-testid="dashboard-tasks-overview-preview-loading"]')).not.toBeNull();
    expect(container.textContent).toContain(en['dashboardTasksOverview.openCountShort'].replace('{count}', '3'));
    expect(container.textContent).not.toContain(en['dashboardTasksOverview.openTasksSubtitle'].replace('{count}', '3'));
  });

  it('shows error state without zero-count chips', () => {
    mockOverview.mockReturnValue({
      counts: null,
      previewTasks: [],
      loading: false,
      countsLoading: false,
      previewLoading: false,
      previewReady: false,
      error: 'failed',
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      listComplete: false,
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
      countsLoading: false,
      previewLoading: false,
      previewReady: true,
      error: null,
      reload: vi.fn(),
      canViewUnassigned: true,
      stationScoped: false,
      listComplete: true,
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

  it('uses notification panel typography tokens for header and CTA', () => {
    const panelSrc = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './DashboardTasksOverviewPanel.tsx'),
      'utf8',
    );

    expect(panelSrc).toContain('TasksOverviewHeader');
    expect(panelSrc).toContain('TaskPreviewCard');
    expect(panelSrc).not.toContain('DashboardPanelHeader');
  });

  it('renders header metrics in a four-column grid', () => {
    act(() => {
      root.render(createElement(DashboardTasksOverviewPanel, { vm: minimalVm() }));
    });

    const grid = container.querySelector('[data-testid="dashboard-tasks-overview-status-chips"]');
    expect(grid?.className).toContain('grid-cols-4');
  });

  it('passes task navigation options through onOpenTasks', () => {
    const onOpenTasks = vi.fn();
    act(() => {
      root.render(
        createElement(DashboardTasksOverviewPanel, {
          vm: minimalVm(),
          onOpenTasks,
        }),
      );
    });

    expect(onOpenTasks).not.toHaveBeenCalled();
  });
});

describe('DashboardView integration contract', () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');

  it('renders tasks overview below controlFinanceGrid in standard layout only', () => {
    expect(dashboardViewSrc).toMatch(/controlFinanceGrid[\s\S]*DashboardTasksOverviewPanel/);
    const focusBranch = dashboardViewSrc.match(
      /if \(vm\.operatorFocusMode\) \{[\s\S]*?\n {2}\}\n\n {2}return/,
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
    expect(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './useDashboardTasksOverview.ts'), 'utf8')).toMatch(
      /shouldPaginateList/,
    );
  });
});
