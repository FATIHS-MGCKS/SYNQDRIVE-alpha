// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const TASK_TITLE = 'Ölwechsel prüfen';
const ALERT_TITLE = 'Fahrzeug blockiert';
const ALERT_MESSAGE = 'Backend runtime alert text';
const VEHICLE_LABEL = 'Audi A7 55 TFSI';
const VEHICLE_PLATE = 'KS-FS-1234';

let mockSnapshot = {
  dueNow: [] as unknown[],
  pickupsToday: [] as unknown[],
  returnsToday: [] as unknown[],
  totalOpenTasksCount: 0,
  blockedVehicles: [] as unknown[],
  taskFeed: {
    buckets: {} as Record<string, unknown>,
    canViewUnassigned: false,
  },
};

let mockOrgId = 'org-1';
let mockOrgLoading = false;
let mockError: string | null = null;
let mockBookingsError: string | null = null;
let mockBookingsLoading = false;
let mockTasksLoading = false;
let mockIsStale = false;
let mockOffline = false;
const mockReload = vi.fn();
const mockOpenSheet = vi.fn();
const mockSetActiveTab = vi.fn();
const mockOpenHandover = vi.fn();

let mockAlerts: Array<{
  id: string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  bookingId?: string;
}> = [];

vi.mock('../../rental/RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: mockOrgId,
    orgName: 'F.S Mobility Services',
    loading: mockOrgLoading,
    userRole: 'ADMIN',
    hasPermission: () => true,
  }),
}));

vi.mock('../../rental/FleetContext', () => ({
  useFleetVehicles: () => ({ fleetVehicles: [] }),
}));

vi.mock('../hooks/useOperatorToday', () => ({
  useOperatorToday: () => ({
    orgId: mockOrgId,
    orgLoading: mockOrgLoading,
    snapshot: mockSnapshot,
    bookingsLoading: mockBookingsLoading,
    tasksLoading: mockTasksLoading,
    error: mockError,
    bookingsError: mockBookingsError,
    isStale: mockIsStale,
    offline: mockOffline,
    reload: mockReload,
  }),
}));

vi.mock('../hooks/useOperatorOperationalAlerts', () => ({
  useOperatorOperationalAlerts: () => ({ alerts: mockAlerts }),
}));

vi.mock('../hooks/useOperatorTabletLayout', () => ({
  useOperatorTabletLayout: () => false,
}));

vi.mock('../context/OperatorShellContext', () => ({
  useOperatorShell: () => ({
    openSheet: mockOpenSheet,
    setActiveTab: mockSetActiveTab,
    setPendingTasksBookingId: vi.fn(),
    setSelectedVehicleId: vi.fn(),
  }),
}));

vi.mock('../handover/OperatorHandoverProvider', () => ({
  useOperatorHandover: () => ({ openHandover: mockOpenHandover }),
}));

vi.mock('../tasks/OperatorTaskCardConnected', () => ({
  OperatorTaskCardConnected: ({ task }: { task: { id: string; title: string } }) => {
    const React = require('react');
    return React.createElement('div', { 'data-task-id': task.id }, task.title);
  },
}));

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { buildBucketSlice } from '../hooks/operatorTodayFeed.utils';
import type { ApiTask } from '../../lib/api';
import { OperatorTodayTaskFeed } from '../components/OperatorTodayTaskFeed';
import { OperatorTodayView } from './OperatorTodayView';
import {
  operatorTodayBucketTitle,
  operatorTodayCreateBookingLabel,
  operatorTodayEmptyTitle,
  operatorTodayHeaderTitle,
  operatorTodayStaleOfflineTitle,
} from '../lib/operator-today-i18n';

const P245_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorTodayView.tsx',
  'operator/views/operatorTodayView.utils.ts',
  'operator/components/OperatorTodayTaskFeed.tsx',
  'operator/lib/operator-today-i18n.ts',
];

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
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    bucket: partial.bucket,
    ...partial,
  };
}

function isP245EnforceCleanPath(relPath: string): boolean {
  return P245_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p245ScopedFindings() {
  return inventory.findings.filter((finding) => isP245EnforceCleanPath(finding.file));
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(
      createElement(MemoryRouter, null, createElement(LanguageProvider, null, ui)),
    );
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

describe('operator today tab chrome localization (P2.2.45)', () => {
  afterEach(() => {
    mockAlerts = [];
    mockSnapshot = {
      dueNow: [],
      pickupsToday: [],
      returnsToday: [],
      totalOpenTasksCount: 0,
      blockedVehicles: [],
      taskFeed: { buckets: {}, canViewUnassigned: false },
    };
    mockOrgId = 'org-1';
    mockOrgLoading = false;
    mockError = null;
    mockBookingsError = null;
    mockBookingsLoading = false;
    mockTasksLoading = false;
    mockIsStale = false;
    mockOffline = false;
    vi.clearAllMocks();
  });

  it('has zero P245 enforce-clean scanner debt', () => {
    expect(p245ScopedFindings()).toHaveLength(0);
  });

  it('renders German Today chrome with dynamic alert content preserved', () => {
    mockAlerts = [
      {
        id: 'alert-1',
        title: ALERT_TITLE,
        message: ALERT_MESSAGE,
        severity: 'CRITICAL',
        bookingId: 'booking-1',
      },
    ];
    mockSnapshot.taskFeed.buckets = {
      NOW: buildBucketSlice({
        bucket: 'NOW',
        tasks: [task({ id: 'task-1', title: TASK_TITLE, bucket: 'NOW' })],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 5,
      }),
    };

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorTodayView));

    expect(container.textContent).toContain(operatorTodayHeaderTitle('de'));
    expect(container.textContent).toContain(operatorTodayCreateBookingLabel('de'));
    expect(container.textContent).toContain(operatorTodayBucketTitle('de', 'NOW'));
    expect(container.textContent).toContain(TASK_TITLE);
    expect(container.textContent).toContain(ALERT_TITLE);
    expect(container.textContent).toContain(ALERT_MESSAGE);

    cleanup();
  });

  it('renders English Today chrome', () => {
    mockSnapshot.taskFeed.buckets = {
      TODAY: buildBucketSlice({
        bucket: 'TODAY',
        tasks: [task({ id: 'task-2', title: TASK_TITLE, bucket: 'TODAY' })],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 5,
      }),
    };

    const { container, cleanup } = renderWithLocale('en', createElement(OperatorTodayView));

    expect(container.textContent).toContain(operatorTodayHeaderTitle('en'));
    expect(container.textContent).toContain(operatorTodayBucketTitle('en', 'TODAY'));
    expect(container.textContent).toContain(TASK_TITLE);

    cleanup();
  });

  it('preserves bucket order and task IDs across locale switch', async () => {
    mockSnapshot.taskFeed.buckets = {
      NOW: buildBucketSlice({
        bucket: 'NOW',
        tasks: [
          task({ id: 'task-a', title: TASK_TITLE, bucket: 'NOW' }),
          task({ id: 'task-b', title: 'Second task', bucket: 'NOW' }),
        ],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 5,
      }),
      PLANNED: buildBucketSlice({
        bucket: 'PLANNED',
        tasks: [task({ id: 'task-c', title: 'Planned task', bucket: 'PLANNED' })],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 3,
      }),
    };

    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, {
        children: createElement(OperatorTodayTaskFeed, {
          buckets: mockSnapshot.taskFeed.buckets as never,
          canViewUnassigned: false,
          vehicleById: new Map(),
          plannedOpen: true,
          onPlannedOpenChange: vi.fn(),
          onOpenTask: vi.fn(),
          onReload: vi.fn(),
          renderEntry: (entry) =>
            createElement('div', {
              'data-task-id': entry.task.id,
              key: entry.task.id,
            }),
        }),
      }),
    );

    const deOrder = Array.from(container.querySelectorAll('[data-task-id]')).map((el) =>
      el.getAttribute('data-task-id'),
    );
    expect(deOrder).toEqual(['task-a', 'task-b', 'task-c']);
    expect(container.textContent).toContain(operatorTodayBucketTitle('de', 'NOW'));

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const enOrder = Array.from(container.querySelectorAll('[data-task-id]')).map((el) =>
      el.getAttribute('data-task-id'),
    );
    expect(enOrder).toEqual(['task-a', 'task-b', 'task-c']);
    expect(container.textContent).toContain(operatorTodayBucketTitle('en', 'NOW'));

    cleanup();
  });

  it('preserves empty-state predicate and localized copy', () => {
    mockAlerts = [];
    const { container, cleanup } = renderWithLocale('de', createElement(OperatorTodayView));

    expect(container.textContent).toContain(operatorTodayEmptyTitle('de'));

    cleanup();
  });

  it('preserves stale banner visibility and offline copy', () => {
    mockOffline = true;
    mockSnapshot.taskFeed.buckets = {
      NOW: buildBucketSlice({
        bucket: 'NOW',
        tasks: [task({ id: 'task-1', title: TASK_TITLE, bucket: 'NOW' })],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 5,
      }),
    };

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorTodayView));

    expect(container.textContent).toContain(operatorTodayStaleOfflineTitle('de'));

    cleanup();
  });

  it('preserves create-booking callback across locales', () => {
    const { container, cleanup } = renderWithLocale('en', createElement(OperatorTodayView));

    const createButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(operatorTodayCreateBookingLabel('en')),
    );
    act(() => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockOpenSheet).toHaveBeenCalledWith({ type: 'booking-create' });

    cleanup();
  });

  it('preserves blocked vehicle dynamic labels raw', () => {
    mockSnapshot.blockedVehicles = [
      { vehicleId: 'veh-1', label: VEHICLE_LABEL, plate: VEHICLE_PLATE, station: 'Station Kassel' },
    ];
    mockSnapshot.taskFeed.buckets = {
      NOW: buildBucketSlice({
        bucket: 'NOW',
        tasks: [task({ id: 'task-1', title: TASK_TITLE, bucket: 'NOW' })],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 5,
      }),
    };

    const { container, cleanup } = renderWithLocale('de', createElement(OperatorTodayView));

    expect(container.textContent).toContain(`${VEHICLE_LABEL} · ${VEHICLE_PLATE}`);
    expect(container.textContent).toContain('Station Kassel');

    cleanup();
  });

  it('does not render raw translation keys', () => {
    mockSnapshot.taskFeed.buckets = {
      NOW: buildBucketSlice({
        bucket: 'NOW',
        tasks: [task({ id: 'task-1', title: TASK_TITLE, bucket: 'NOW' })],
        loading: false,
        error: null,
        summary: null,
        previewLimit: 5,
      }),
    };

    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorTodayView),
    );
    const text = container.textContent ?? '';

    expect(text).not.toContain('operator.today.');
    expect(text).not.toMatch(/\bNOW\b|\bTODAY\b|\bUPCOMING\b/);

    cleanup();
  });
});
