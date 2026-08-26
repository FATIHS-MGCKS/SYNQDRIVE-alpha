// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { ApiTask, ApiTaskSummary } from '../../lib/api';
import {
  operatorTasksTabCreateFabAria,
  operatorTasksTabFilterChipLabel,
  operatorTasksTabListTitle,
  operatorTasksTabScopeToggleLabel,
  operatorTasksTabSummaryLabel,
} from '../lib/operator-tasks-tab-i18n';

const TASK_TITLE = 'Ölwechsel prüfen';
const TASK_TITLE_2 = 'Bremsen vorne kontrollieren';

const mockTaskSummary: ApiTaskSummary = {
  open: 3,
  active: 3,
  inProgress: 0,
  waiting: 0,
  done: 0,
  cancelled: 0,
  dueToday: 1,
  overdue: 2,
  critical: 0,
  assignedToMe: 1,
  byStatus: { OPEN: 3 },
  byPriority: { NORMAL: 3 },
};

let mockTasks: ApiTask[] = [];
let mockTasksLoading = false;
let mockTasksError: string | null = null;
const mockReloadTasks = vi.fn();
const mockOpenSheet = vi.fn();

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        list: vi.fn(),
      },
    },
  };
});

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../../rental/FleetContext', () => ({
  useFleetVehicles: () => ({ fleetVehicles: [] }),
}));

vi.mock('../context/OperatorDataContext', () => ({
  useOperatorData: () => ({
    taskSummary: mockTaskSummary,
    tasksLoading: mockTasksLoading,
    tasksError: mockTasksError,
    reloadTasks: mockReloadTasks,
  }),
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    openSheet: mockOpenSheet,
    pendingTasksBookingId: null,
    setPendingTasksBookingId: vi.fn(),
  }),
}));

vi.mock('../hooks/useOperatorTabletLayout', () => ({
  useOperatorTabletLayout: () => false,
}));

vi.mock('../tasks/operatorTask.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../tasks/operatorTask.utils')>();
  return {
    ...actual,
    getOperatorUserId: () => 'user-1',
  };
});

import { api } from '../../lib/api';

let OperatorTasksView: (typeof import('./OperatorTasksView'))['OperatorTasksView'];

beforeAll(async () => {
  ({ OperatorTasksView } = await import('./OperatorTasksView'));
});

vi.mock('../tasks/OperatorTaskCardConnected', () => ({
  OperatorTaskCardConnected: ({ task }: { task: { id: string; title: string } }) => {
    const React = require('react');
    return React.createElement('div', { 'data-task-id': task.id }, task.title);
  },
}));

vi.mock('../tasks/OperatorTaskDetail', () => ({
  OperatorTaskDetail: () => {
    const React = require('react');
    return React.createElement('div', { 'data-testid': 'task-detail' }, 'detail');
  },
}));

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: '',
    category: 'Custom',
    type: 'BOOKING_PREPARATION',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'BOOKING',
    dedupKey: null,
    vehicleId: null,
    bookingId: 'booking-abc123',
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-1',
    assignedUserName: 'Max Mustermann',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: '2026-07-15T14:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...partial,
  };
}

const P247_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorTasksView.tsx',
  'operator/lib/operator-tasks-tab-i18n.ts',
];

function isP247EnforceCleanPath(relPath: string): boolean {
  return P247_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p247ScopedFindings() {
  return inventory.findings.filter((finding) => isP247EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function LocaleSwitchHarness({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    children,
  );
}

describe('operator tasks tab chrome localization (P2.2.47)', () => {
  beforeEach(() => {
    vi.mocked(api.tasks.list).mockImplementation(async () => ({
      data: mockTasks,
      meta: { limit: 50, nextCursor: null },
    }));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    mockTasks = [];
    mockTasksLoading = false;
    mockTasksError = null;
    vi.clearAllMocks();
  });

  it('has zero P247 enforce-clean scanner debt', () => {
    expect(p247ScopedFindings()).toHaveLength(0);
  });

  it('renders German Tasks tab chrome with dynamic task content preserved', async () => {
    mockTasks = [
      task({ id: 'task-1', title: TASK_TITLE }),
      task({ id: 'task-2', title: TASK_TITLE_2 }),
    ];

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorTasksView));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(vi.mocked(api.tasks.list).mock.calls.length).toBeGreaterThan(0);
    const listResult = await vi.mocked(api.tasks.list).mock.results[0]?.value;
    expect(listResult?.data?.length).toBe(2);

    await act(async () => {
      await vi.waitFor(() => {
        expect(container.querySelector('[data-task-id]')).toBeTruthy();
      });
    });

    expect(container.textContent).toContain(operatorTasksTabListTitle('de', 'all', true));
    expect(container.textContent).toContain(operatorTasksTabSummaryLabel('de', 'open'));
    expect(container.textContent).toContain(operatorTasksTabFilterChipLabel('de', 'today'));
    expect(container.textContent).toContain(TASK_TITLE);
    expect(container.textContent).toContain(TASK_TITLE_2);

    const taskNodes = container.querySelectorAll('[data-task-id]');
    expect(Array.from(taskNodes).map((node) => node.getAttribute('data-task-id'))).toEqual([
      'task-1',
      'task-2',
    ]);

    cleanup();
  });

  it('renders English Tasks tab chrome', async () => {
    mockTasks = [task({ id: 'task-1', title: TASK_TITLE })];

    const { container, cleanup } = renderWithLocale('en', createElement(OperatorTasksView));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toContain(TASK_TITLE);
      });
    });

    expect(container.textContent).toContain(operatorTasksTabListTitle('en', 'all', true));
    expect(container.textContent).toContain(operatorTasksTabFilterChipLabel('en', 'booking'));
    expect(container.textContent).toContain(TASK_TITLE);

    cleanup();
  });

  it('preserves filter selection and task order across locale switch', async () => {
    mockTasks = [
      task({ id: 'task-a', title: TASK_TITLE, isOverdue: true }),
      task({ id: 'task-b', title: TASK_TITLE_2 }),
    ];

    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, { children: createElement(OperatorTasksView) }),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(container.querySelector('[data-task-id]')).toBeTruthy();
      });
    });

    const overdueChip = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(operatorTasksTabFilterChipLabel('de', 'overdue')),
    );
    expect(overdueChip).toBeTruthy();

    await act(async () => {
      overdueChip?.click();
      await Promise.resolve();
    });

    const taskIdsBefore = Array.from(container.querySelectorAll('[data-task-id]')).map((node) =>
      node.getAttribute('data-task-id'),
    );
    expect(taskIdsBefore).toEqual(['task-a']);

    const toggle = container.querySelector('button');
    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(operatorTasksTabFilterChipLabel('en', 'overdue'));
    expect(container.textContent).toContain(TASK_TITLE);

    const taskIdsAfter = Array.from(container.querySelectorAll('[data-task-id]')).map((node) =>
      node.getAttribute('data-task-id'),
    );
    expect(taskIdsAfter).toEqual(['task-a']);

    cleanup();
  });

  it('uses stable machine keys for summary row and filter chips', async () => {
    mockTasks = [task({ id: 'task-1', title: TASK_TITLE })];

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorTasksView));

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).not.toMatch(/key=\{s\.label\}/);
    expect(container.textContent).toContain(operatorTasksTabScopeToggleLabel('de', 'all'));

    cleanup();
  });

  it('localizes FAB aria without leaking raw keys', async () => {
    mockTasks = [];

    const { container, cleanup } = renderWithLocale('en', createElement(OperatorTasksView));

    await act(async () => {
      await Promise.resolve();
    });

    const fab = container.querySelector('button[aria-label]');
    expect(fab?.getAttribute('aria-label')).toBe(operatorTasksTabCreateFabAria('en'));
    expect(container.textContent).not.toContain('operator.tasks.tab.');

    cleanup();
  });
});
