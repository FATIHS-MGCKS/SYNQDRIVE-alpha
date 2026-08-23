// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { ApiTask } from '../../lib/api';
import {
  operatorVehicleQuickViewTaskPriorityLabel,
  operatorVehicleQuickViewTaskStatusLabel,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorVehicleQuickViewTasks } from './OperatorVehicleQuickViewTasks';

const P227_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewTasks.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

function isP227EnforceCleanPath(relPath: string): boolean {
  return P227_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p227ScopedFindings() {
  return inventory.findings.filter((finding) => isP227EnforceCleanPath(finding.file));
}

function taskFixture(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Check left rear mirror — customer note 42',
    description: 'Distinctive operator description',
    category: 'fahrzeug',
    type: 'CUSTOM',
    status: 'OPEN',
    priority: 'HIGH',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: 'veh-1',
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-9',
    assignedUserName: 'Alex Operator',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: '2026-08-25T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
    ...overrides,
  };
}

const mixedTasks: ApiTask[] = [
  taskFixture({
    id: 'task-a',
    title: 'Task A — low open',
    status: 'OPEN',
    priority: 'LOW',
    isOverdue: false,
    dueDate: '2026-08-30T10:00:00.000Z',
  }),
  taskFixture({
    id: 'task-b',
    title: 'Task B — overdue critical',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    isOverdue: true,
    dueDate: '2026-08-10T10:00:00.000Z',
  }),
  taskFixture({
    id: 'task-c',
    title: 'Task C — waiting normal',
    status: 'WAITING',
    priority: 'NORMAL',
    isOverdue: false,
    dueDate: '2026-08-28T10:00:00.000Z',
  }),
];

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

function renderTasks(
  locale: 'de' | 'en',
  props: Partial<ComponentProps<typeof OperatorVehicleQuickViewTasks>> = {},
) {
  const onCreateTask = vi.fn();
  const onOpenTask = vi.fn();
  const view = renderWithLocale(
    locale,
    createElement(OperatorVehicleQuickViewTasks, {
      tasks: mixedTasks,
      loading: false,
      onCreateTask,
      onOpenTask,
      ...props,
    }),
  );
  return { ...view, onCreateTask, onOpenTask };
}

function LocaleSwitchHarness({
  tasks,
  onOpenTask,
}: {
  tasks: ApiTask[];
  onOpenTask: (task: ApiTask) => void;
}) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', onClick: () => setLocale(locale === 'de' ? 'en' : 'de') },
      'toggle-locale',
    ),
    createElement(OperatorVehicleQuickViewTasks, {
      tasks,
      loading: false,
      onCreateTask: () => undefined,
      onOpenTask,
    }),
  );
}

describe('operator Vehicle Quick View Open Tasks localization (P2.2.27)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  describe('enforce-clean inventory', () => {
    it('reports zero P227 scoped findings', () => {
      expect(p227ScopedFindings()).toHaveLength(0);
    });
  });

  describe('EN presentation', () => {
    it('renders section chrome and task row labels in English', () => {
      const view = renderTasks('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.tasks.sectionTitle']);
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.tasks.new']);
      expect(view.container.textContent).toContain('Low');
      expect(view.container.textContent).toContain('Critical');
      expect(view.container.textContent).toContain('Medium');
      expect(view.container.textContent).toContain(en['status.overdue']);
    });

    it('renders localized empty state', () => {
      const view = renderTasks('en', { tasks: [] });
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(en['operator.vehicleQuickView.tasks.empty']);
    });
  });

  describe('DE presentation', () => {
    it('renders section chrome and task row labels in German', () => {
      const view = renderTasks('de');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.tasks.sectionTitle']);
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.tasks.new']);
      expect(view.container.textContent).toContain('Niedrig');
      expect(view.container.textContent).toContain('Kritisch');
      expect(view.container.textContent).toContain('Mittel');
      expect(view.container.textContent).toContain(de['status.overdue']);
    });

    it('renders localized empty state', () => {
      const view = renderTasks('de', { tasks: [] });
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain(de['operator.vehicleQuickView.tasks.empty']);
    });
  });

  describe('machine value regressions', () => {
    it('keeps priority presentation driven by machine priority values', () => {
      const view = renderTasks('en');
      cleanup = view.cleanup;
      expect(view.container.textContent).toContain('Low');
      expect(view.container.textContent).toContain('Critical');
      expect(view.container.textContent).toContain('Medium');
    });

    it('maps status labels through canonical keys without changing machine status', () => {
      expect(operatorVehicleQuickViewTaskStatusLabel('en', 'OPEN', false)).toBe(
        en['tasks.filter.status.OPEN'],
      );
      expect(operatorVehicleQuickViewTaskStatusLabel('de', 'WAITING', false)).toBe(
        de['tasks.filter.status.WAITING'],
      );
      expect(operatorVehicleQuickViewTaskStatusLabel('en', 'IN_PROGRESS', true)).toBe(
        en['status.overdue'],
      );
    });

    it('maps priority labels through canonical keys', () => {
      expect(operatorVehicleQuickViewTaskPriorityLabel('en', 'CRITICAL')).toBe(
        en['tasks.filter.priority.CRITICAL'],
      );
      expect(operatorVehicleQuickViewTaskPriorityLabel('de', 'NORMAL')).toBe(
        de['tasks.filter.priority.NORMAL'],
      );
    });
  });

  describe('dynamic data preservation', () => {
    it('preserves task titles across locale switch on same mount', () => {
      const onOpenTask = vi.fn();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      window.localStorage.setItem('synqdrive.locale', 'de');
      act(() => {
        root.render(
          createElement(LanguageProvider, null, createElement(LocaleSwitchHarness, { tasks: mixedTasks, onOpenTask })),
        );
      });
      cleanup = () => {
        act(() => root.unmount());
        container.remove();
      };

      expect(container.textContent).toContain('Task A — low open');
      expect(container.textContent).toContain(de['operator.vehicleQuickView.tasks.sectionTitle']);

      act(() => {
        container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).toContain('Task A — low open');
      expect(container.textContent).toContain(en['operator.vehicleQuickView.tasks.sectionTitle']);
    });
  });

  describe('navigation regression', () => {
    it('passes the same task object to onOpenTask regardless of locale', () => {
      const viewDe = renderTasks('de');
      const rowDe = viewDe.container.querySelectorAll('button[aria-label]')[0] as HTMLButtonElement;
      rowDe?.click();
      expect(viewDe.onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-a' }));
      viewDe.cleanup();

      const viewEn = renderTasks('en');
      cleanup = viewEn.cleanup;
      const rowEn = viewEn.container.querySelectorAll('button[aria-label]')[0] as HTMLButtonElement;
      rowEn?.click();
      expect(viewEn.onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-a' }));
    });
  });

  describe('sort order preservation', () => {
    it('renders tasks in supplied order under EN and DE', () => {
      const viewEn = renderTasks('en');
      const titlesEn = [...viewEn.container.querySelectorAll('p.text-sm.font-semibold')].map(
        (node) => node.textContent,
      );
      viewEn.cleanup();

      const viewDe = renderTasks('de');
      cleanup = viewDe.cleanup;
      const titlesDe = [...viewDe.container.querySelectorAll('p.text-sm.font-semibold')].map(
        (node) => node.textContent,
      );

      expect(titlesEn).toEqual([
        'Task A — low open',
        'Task B — overdue critical',
        'Task C — waiting normal',
      ]);
      expect(titlesDe).toEqual(titlesEn);
    });
  });
});
