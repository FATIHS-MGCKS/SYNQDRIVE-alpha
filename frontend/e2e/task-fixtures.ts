/**
 * Playwright fixtures for Task Management E2E (rental global page).
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';
import type {
  ApiTask,
  ApiTaskDetail,
  ApiTaskSummary,
  TaskBucket,
} from '../src/lib/tasks/types';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-task-e2e';
export const TASK_OPEN_ID = 'task-open-e2e';
export const TASK_IN_PROGRESS_ID = 'task-in-progress-e2e';
export const TASK_CHECKLIST_ID = 'task-checklist-e2e';
export const TASK_BRAKE_ID = 'task-brake-e2e';
export const TASK_DONE_MANUAL_ID = 'task-done-manual-e2e';
export const TASK_DONE_AUTO_ID = 'task-done-auto-e2e';
export const TASK_DONE_SUPERSEDED_ID = 'task-done-superseded-e2e';
export const TASK_DONE_LEGACY_ID = 'task-done-legacy-e2e';

export const mockUser = {
  id: 'user-task-e2e',
  email: 'tasks@synqdrive.eu',
  name: 'Task E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Task E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    tasks: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    invoices: { read: true, write: true, manage: true },
  },
};

interface TaskMockState {
  tasks: Map<string, ApiTask>;
  completeAttempts: number;
  failNextComplete: boolean;
}

const state: TaskMockState = {
  tasks: new Map(),
  completeAttempts: 0,
  failNextComplete: false,
};

function baseListTask(over: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: TEST_ORG_ID,
    description: 'E2E Beschreibung',
    category: 'Booking',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: 'veh-e2e-1',
    bookingId: 'booking-e2e-1',
    customerId: 'cust-e2e-1',
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-task-e2e',
    assignedUserName: 'Task E2E',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: {},
    isOverdue: false,
    dueDate: '2026-07-15T14:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    bucket: 'TODAY',
    linkedObjects: [
      {
        type: 'VEHICLE',
        id: 'veh-e2e-1',
        primaryLabel: 'M-AB 1234',
        secondaryLabel: 'VW Golf',
        iconKey: 'vehicle',
        action: { type: 'OPEN_VEHICLE', vehicleId: 'veh-e2e-1' },
        isAvailable: true,
      },
      {
        type: 'BOOKING',
        id: 'booking-e2e-1',
        primaryLabel: 'BK-E2E-1001',
        secondaryLabel: 'Anna Schmidt',
        iconKey: 'booking',
        action: { type: 'OPEN_BOOKING', bookingId: 'booking-e2e-1' },
        isAvailable: true,
      },
    ],
    ...over,
  };
}

function detailFromList(task: ApiTask, overrides?: Partial<ApiTaskDetail>): ApiTaskDetail {
  const openRequired = (task.checklist ?? []).filter((item) => item.isRequired && !item.isDone);
  const terminal = task.status === 'DONE' || task.status === 'CANCELLED';
  const completionMode =
    overrides?.summary?.completionMode ??
    (task.status === 'DONE'
      ? task.id === TASK_DONE_AUTO_ID
        ? 'AUTO_RESOLVED'
        : task.id === TASK_DONE_SUPERSEDED_ID
          ? 'SUPERSEDED'
          : 'MANUAL'
      : null);

  return {
    ...task,
    checklist: task.checklist ?? [],
    comments: task.comments ?? [
      {
        id: 'comment-1',
        userId: 'user-task-e2e',
        body: 'Erste Notiz aus Erstellung',
        createdAt: '2026-07-14T09:00:00.000Z',
      },
    ],
    timeline: [
      {
        id: 'evt-1',
        type: 'CREATED',
        actorUserId: 'user-task-e2e',
        oldValue: null,
        newValue: 'OPEN',
        metadata: null,
        createdAt: '2026-07-14T08:00:00.000Z',
      },
    ],
    summary: {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      priority: task.priority,
      sourceType: task.sourceType,
      humanReadableSource: 'Manuell',
      completionMode,
    },
    reason: {
      title: 'Ursache',
      description: task.description,
      basis: 'Automatisch erkannt',
      detectedAt: task.createdAt,
    },
    nextAction: {
      label: terminal ? 'Abgeschlossen' : task.status === 'OPEN' ? 'Starten' : 'Erledigen',
      description: terminal ? null : 'Nächster operativer Schritt',
      actionType: terminal ? 'NONE' : task.status === 'OPEN' ? 'START' : 'COMPLETE',
      targetType: 'TASK',
      targetId: task.id,
      enabled: !terminal,
      disabledReason: openRequired.length > 0 ? 'Pflichtpunkte offen' : null,
    },
    linkedObjects: task.linkedObjects ?? [],
    checklistProgress: {
      totalItems: task.checklist?.length ?? 0,
      completedItems: task.checklist?.filter((i) => i.isDone).length ?? 0,
      requiredItems: task.checklist?.filter((i) => i.isRequired).length ?? 0,
      completedRequiredItems:
        task.checklist?.filter((i) => i.isRequired && i.isDone).length ?? 0,
      remainingRequiredItems: openRequired.length,
      progressPercent: task.checklist?.length ? 50 : null,
      hasChecklist: Boolean(task.checklist?.length),
      areRequiredItemsComplete: openRequired.length === 0,
      canCompleteByChecklist: terminal || openRequired.length === 0,
      completionBlockers: openRequired.length > 0 ? ['REQUIRED_CHECKLIST_ITEMS_OPEN'] : [],
    },
    assignment: {
      assignedUser: { id: 'user-task-e2e', displayName: 'Task E2E' },
      createdBy: { id: 'user-task-e2e', displayName: 'Task E2E' },
      responsibleRoleLabel: null,
    },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.createdAt,
      dueDate: task.dueDate,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt,
      isActive: !terminal,
      isOverdue: Boolean(task.isOverdue),
      bucket: (task.bucket as TaskBucket) ?? 'TODAY',
    },
    completion: {
      completionMode,
      resolutionCode: null,
      resolutionNote: task.resolutionNote,
      completedBy: terminal ? { id: 'user-task-e2e', displayName: 'Task E2E' } : null,
      supersededByTaskId: task.id === TASK_DONE_SUPERSEDED_ID ? TASK_OPEN_ID : null,
    },
    technicalMetadata: {
      source: task.source,
      dedupKey: task.dedupKey,
      metadata: task.metadata ?? {},
    },
    availableActions: {
      start: { enabled: task.status === 'OPEN' },
      moveToWaiting: { enabled: task.status === 'OPEN' || task.status === 'IN_PROGRESS' },
      resume: { enabled: task.status === 'WAITING' },
      complete: {
        enabled:
          !terminal &&
          (task.status === 'IN_PROGRESS' || task.status === 'WAITING') &&
          openRequired.length === 0,
        disabledReason: openRequired.length > 0 ? 'Pflichtpunkte offen' : undefined,
      },
      cancel: { enabled: !terminal },
      comment: { enabled: !terminal },
      overrideCompletion: {
        enabled: !terminal && openRequired.length > 0,
      },
    },
    ...overrides,
  };
}

function seedTasks() {
  state.tasks = new Map([
    [
      TASK_OPEN_ID,
      baseListTask({
        id: TASK_OPEN_ID,
        title: 'Reifen prüfen E2E',
        type: 'TIRE_CHECK',
        status: 'OPEN',
        bucket: 'TODAY',
        checklist: [],
      }),
    ],
    [
      TASK_IN_PROGRESS_ID,
      baseListTask({
        id: TASK_IN_PROGRESS_ID,
        title: 'Ölwechsel E2E',
        type: 'CUSTOM',
        status: 'IN_PROGRESS',
        bucket: 'TODAY',
        startedAt: '2026-07-15T09:30:00.000Z',
        checklist: [],
      }),
    ],
    [
      TASK_CHECKLIST_ID,
      baseListTask({
        id: TASK_CHECKLIST_ID,
        title: 'Buchung vorbereiten E2E',
        type: 'BOOKING_PREPARATION',
        status: 'IN_PROGRESS',
        bucket: 'TODAY',
        startedAt: '2026-07-15T10:00:00.000Z',
        checklist: [
          {
            id: 'ci-req',
            title: 'Kunde identifizieren',
            description: '',
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
          },
        ],
      }),
    ],
    [
      TASK_BRAKE_ID,
      baseListTask({
        id: TASK_BRAKE_ID,
        title: 'Bremsen prüfen E2E',
        type: 'BRAKE_CHECK',
        status: 'IN_PROGRESS',
        bucket: 'NOW',
        priority: 'HIGH',
        startedAt: '2026-07-15T09:00:00.000Z',
        checklist: [],
      }),
    ],
    [
      TASK_DONE_MANUAL_ID,
      baseListTask({
        id: TASK_DONE_MANUAL_ID,
        title: 'Manuell erledigt',
        type: 'CUSTOM',
        status: 'DONE',
        bucket: 'COMPLETED',
        completedAt: '2026-07-15T11:00:00.000Z',
      }),
    ],
    [
      TASK_DONE_AUTO_ID,
      baseListTask({
        id: TASK_DONE_AUTO_ID,
        title: 'Automatisch aufgelöst',
        type: 'INVOICE_REQUIRED',
        status: 'DONE',
        bucket: 'COMPLETED',
        completedAt: '2026-07-15T11:30:00.000Z',
        resolutionNote: '[Auto-resolved] Zahlung verbucht',
      }),
    ],
    [
      TASK_DONE_SUPERSEDED_ID,
      baseListTask({
        id: TASK_DONE_SUPERSEDED_ID,
        title: 'Ersetzt durch Nachfolger',
        type: 'BOOKING_PREPARATION',
        status: 'DONE',
        bucket: 'COMPLETED',
        completedAt: '2026-07-15T12:00:00.000Z',
        resolutionNote: '[Superseded] Neue Aufgabe erstellt',
      }),
    ],
    [
      TASK_DONE_LEGACY_ID,
      baseListTask({
        id: TASK_DONE_LEGACY_ID,
        title: 'Legacy DONE mit offener Checkliste',
        type: 'BOOKING_PICKUP',
        status: 'DONE',
        bucket: 'COMPLETED',
        completedAt: '2026-06-01T10:00:00.000Z',
        checklist: [
          {
            id: 'legacy-open',
            title: 'Offener Legacy-Schritt',
            description: '',
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
          },
        ],
      }),
    ],
  ]);
}

export function resetTaskMockState() {
  state.completeAttempts = 0;
  state.failNextComplete = false;
  seedTasks();
}

function summary(): ApiTaskSummary {
  return {
    open: 3,
    active: 3,
    inProgress: 2,
    waiting: 0,
    done: 4,
    cancelled: 0,
    dueToday: 2,
    overdue: 0,
    critical: 1,
    assignedToMe: 2,
    byStatus: { OPEN: 1, IN_PROGRESS: 2, DONE: 4 },
    byPriority: { NORMAL: 2, HIGH: 1 },
    buckets: {
      NOW: 1,
      TODAY: 2,
      UPCOMING: 0,
      PLANNED: 0,
      OVERDUE: 0,
      UNASSIGNED: 0,
      ALL_OPEN: 3,
      COMPLETED: 4,
    },
    timezone: 'Europe/Berlin',
  };
}

function filterTasks(url: string): ApiTask[] {
  const parsed = new URL(url);
  const bucket = parsed.searchParams.get('bucket') as TaskBucket | null;
  const search = parsed.searchParams.get('search')?.toLowerCase() ?? '';
  const assignedUserId = parsed.searchParams.get('assignedUserId');
  let rows = [...state.tasks.values()];

  if (bucket === 'COMPLETED') {
    rows = rows.filter((task) => task.status === 'DONE' || task.status === 'CANCELLED');
  } else if (bucket === 'ALL_OPEN') {
    rows = rows.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');
  } else if (bucket) {
    rows = rows.filter((task) => task.bucket === bucket && task.status !== 'DONE' && task.status !== 'CANCELLED');
  } else {
    rows = rows.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');
  }

  if (assignedUserId) {
    rows = rows.filter((task) => task.assignedUserId === assignedUserId);
  }

  if (search) {
    rows = rows.filter(
      (task) =>
        task.title.toLowerCase().includes(search) ||
        task.linkedObjects?.some((obj) => obj.primaryLabel.toLowerCase().includes(search)),
    );
  }

  return rows;
}

export async function installTaskMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks/summary`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary()) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks`) && method === 'GET' && !url.match(/\/tasks\/[^/?]+/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filterTasks(url)),
      });
    }

    const detailMatch = url.match(/\/organizations\/[^/]+\/tasks\/([^/?]+)$/);
    if (detailMatch && method === 'GET') {
      const task = state.tasks.get(detailMatch[1]);
      if (!task) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
      }
      const detail = detailFromList(task);
      if (task.id === TASK_DONE_LEGACY_ID) {
        detail.summary.completionMode = null;
        detail.completion.completionMode = null;
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
    }

    const startMatch = url.match(/\/tasks\/([^/]+)\/start/);
    if (startMatch && method === 'PATCH') {
      const task = state.tasks.get(startMatch[1]);
      if (!task) return route.fulfill({ status: 404, body: '{}' });
      const updated = {
        ...task,
        status: 'IN_PROGRESS' as const,
        startedAt: '2026-07-15T10:00:00.000Z',
      };
      state.tasks.set(task.id, updated);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(detailFromList(updated)),
      });
    }

    const completeMatch = url.match(/\/tasks\/([^/]+)\/complete/);
    if (completeMatch && method === 'PATCH') {
      state.completeAttempts += 1;
      if (state.failNextComplete) {
        state.failNextComplete = false;
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Abschluss fehlgeschlagen (E2E)' }),
        });
      }
      const task = state.tasks.get(completeMatch[1]);
      if (!task) return route.fulfill({ status: 404, body: '{}' });
      const body = route.request().postDataJSON() as { overrideIncompleteChecklist?: boolean } | null;
      const openRequired = (task.checklist ?? []).filter((item) => item.isRequired && !item.isDone);
      if (openRequired.length > 0 && !body?.overrideIncompleteChecklist) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Die Aufgabe kann noch nicht abgeschlossen werden.',
            code: 'TASK_REQUIRED_CHECKLIST_INCOMPLETE',
          }),
        });
      }
      const updated = {
        ...task,
        status: 'DONE' as const,
        completedAt: '2026-07-15T12:30:00.000Z',
        bucket: 'COMPLETED' as TaskBucket,
        checklist: task.checklist?.map((item) => ({ ...item, isDone: true })),
      };
      state.tasks.set(task.id, updated);
      const completedDetail = detailFromList(updated);
      completedDetail.summary.completionMode = 'MANUAL';
      completedDetail.completion.completionMode = 'MANUAL';
      completedDetail.completion.completedBy = { id: 'user-task-e2e', displayName: 'Task E2E' };
      if (body?.overrideIncompleteChecklist) {
        completedDetail.resolutionNote = body.overrideReason ?? completedDetail.resolutionNote;
      }
      const requestBody = body as {
        resolutionCode?: string;
        resolutionNote?: string;
        overrideReason?: string;
      } | null;
      if (requestBody?.resolutionCode) {
        completedDetail.completion.resolutionCode = requestBody.resolutionCode;
      }
      if (requestBody?.resolutionNote) {
        completedDetail.completion.resolutionNote = requestBody.resolutionNote;
        completedDetail.resolutionNote = requestBody.resolutionNote;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(completedDetail),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-1', name: 'Berlin Mitte' }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/members`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'user-task-e2e', name: 'Task E2E', email: 'tasks@synqdrive.eu' }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'veh-e2e-1', license: 'M-AB 1234', model: 'VW Golf', station: 'Berlin Mitte' }],
          meta: { total: 1 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/pickups`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/returns`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'booking-e2e-1', bookingNumber: 'BK-E2E-1001' }],
          meta: { total: 1 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/customers`) && method === 'GET' && !url.includes('/customers/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/service-cases`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vendors`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'veh-e2e-1',
            vehicleName: 'VW Golf',
            make: 'VW',
            model: 'Golf',
            licensePlate: 'M-AB 1234',
            license: 'M-AB 1234',
            lat: 52.52,
            lng: 13.405,
            status: 'Available',
          },
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicles: [] }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/counts')
            ? {
                totalActive: 0,
                unread: 0,
                critical: 0,
                warning: 0,
                info: 0,
                resolvedRecent: 0,
                byDomain: {},
              }
            : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
        ),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/users`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'user-task-e2e', name: 'Task E2E', email: 'tasks@synqdrive.eu' }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/support/unread-count`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/activity-log`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    if (url.includes('/dashboard-insights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    return route.continue();
  });
}

export async function navigateToTasksView(page: Page) {
  const heading = page.getByRole('heading', { name: /^(Aufgaben|Tasks)$/ });
  if (await heading.isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  const tasksLabel = /^(Aufgaben|Tasks)$/;

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: tasksLabel }).click();
  } else {
    await page.getByRole('button', { name: tasksLabel }).click();
  }

  await heading.waitFor({ state: 'visible', timeout: 30000 });
}

export async function openTasksPage(page: Page, options?: { theme?: 'light' | 'dark' }) {
  resetTaskMockState();
  await page.addInitScript(
    ({ token, user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    { token: 'task-e2e-token', user: mockUser, locale: 'de', theme: options?.theme },
  );
  await installTaskMocks(page);
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  await navigateToTasksView(page);
}

export function taskCardLocator(page: Page, title: string) {
  return page.locator('[data-testid="task-work-item-card"]').filter({ hasText: title });
}

export function taskActionBar(page: Page) {
  return page.getByTestId('task-detail-action-bar-desktop');
}

export async function clickTaskAction(page: Page, label: string | RegExp) {
  const bar = taskActionBar(page);
  await expect(bar).toBeVisible({ timeout: 15000 });
  const button = bar.getByRole('button', { name: label });
  await expect(button).toBeEnabled({ timeout: 15000 });
  await button.click();
}

export async function openCompleteDialog(page: Page) {
  await clickTaskAction(page, 'Erledigen');
  await expect(page.getByTestId('task-complete-dialog')).toBeVisible({ timeout: 15000 });
}

export async function submitCompleteDialog(page: Page) {
  const dialog = page.getByTestId('task-complete-dialog');
  await dialog.getByRole('button', { name: 'Abschließen' }).click();
}

export async function openTaskDetail(page: Page, title: string) {
  await taskCardLocator(page, title).click();
  const body = page.getByTestId('task-detail-body');
  await expect(body).toBeVisible({ timeout: 15000 });
  await expect(body.getByText('Verknüpfte Objekte')).toBeVisible({ timeout: 15000 });
  await expect(
    page
      .getByTestId('task-detail-action-bar-desktop')
      .or(page.getByTestId('task-completion-summary')),
  ).toBeVisible({ timeout: 15000 });
}

export function setFailNextComplete() {
  state.failNextComplete = true;
}

export function getCompleteAttempts() {
  return state.completeAttempts;
}

export async function assertNoVisibleUuids(page: Page) {
  const text = await page.locator('body').innerText();
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  expect(text.match(uuidPattern) ?? []).toEqual([]);
}

seedTasks();
