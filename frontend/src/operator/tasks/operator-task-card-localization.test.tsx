// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { ApiTask } from '../../lib/api';
import { OperatorTaskCard } from './OperatorTaskCard';
import {
  operatorTaskCardActionLabel,
  operatorTaskCardAssigneePrefix,
  operatorTaskCardOpenAriaLabel,
  operatorTaskCardOverdueLabel,
  operatorTaskCardStatusLabel,
} from '../lib/operator-task-card-i18n';

const TASK_TITLE = 'Ölwechsel prüfen';
const TASK_TITLE_2 = 'Bremsen vorne kontrollieren';
const ASSIGNEE_NAME = 'Max Mustermann';
const VEHICLE_LINE = 'Audi A7 55 TFSI · BK-2026-00421';

const P246_ENFORCE_CLEAN_EXACT = [
  'operator/tasks/OperatorTaskCard.tsx',
  'operator/tasks/operatorTaskCard.utils.ts',
  'operator/tasks/OperatorTaskCardConnected.tsx',
  'operator/lib/operator-task-card-i18n.ts',
];

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: '',
    category: 'Custom',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
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
    assignedUserName: ASSIGNEE_NAME,
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
    linkedObjects: [
      {
        type: 'VEHICLE',
        id: 'vehicle-1',
        primaryLabel: 'KS-FS-1234',
        iconKey: 'vehicle',
        action: { type: 'OPEN_VEHICLE', vehicleId: 'vehicle-1' },
        isAvailable: true,
      },
      {
        type: 'BOOKING',
        id: 'booking-abc123',
        primaryLabel: 'BK-2026-00421',
        iconKey: 'booking',
        action: { type: 'OPEN_BOOKING', bookingId: 'booking-abc123' },
        isAvailable: true,
      },
    ],
    ...partial,
  };
}

function isP246EnforceCleanPath(relPath: string): boolean {
  return P246_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p246ScopedFindings() {
  return inventory.findings.filter((finding) => isP246EnforceCleanPath(finding.file));
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

describe('operator task card row localization (P2.2.46)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('has zero P246 enforce-clean scanner debt', () => {
    expect(p246ScopedFindings()).toHaveLength(0);
  });

  it('renders German task card chrome with dynamic task content preserved', () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(OperatorTaskCard, {
        task: task({ id: 'task-1', title: TASK_TITLE, type: 'TIRE_CHECK' }),
        onOpen: () => undefined,
        onAction: async () => undefined,
      }),
    );

    expect(container.textContent).toContain(TASK_TITLE);
    expect(container.textContent).toContain(ASSIGNEE_NAME);
    expect(container.textContent).toContain(operatorTaskCardAssigneePrefix('de'));
    expect(container.textContent).toContain(operatorTaskCardActionLabel('de', 'start'));
    expect(container.textContent).toContain('KS-FS-1234 · BK-2026-00421');

    cleanup();
  });

  it('renders English task card chrome', () => {
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorTaskCard, {
        task: task({ id: 'task-2', title: TASK_TITLE_2, type: 'TIRE_CHECK', status: 'WAITING' }),
        onOpen: () => undefined,
        onAction: async () => undefined,
      }),
    );

    expect(container.textContent).toContain(TASK_TITLE_2);
    expect(container.textContent).toContain(operatorTaskCardActionLabel('en', 'resume'));
    expect(container.textContent).toContain(operatorTaskCardStatusLabel('en', 'WAITING'));

    cleanup();
  });

  it('preserves task identity and order across locale switch', async () => {
    const tasks = [
      task({ id: 'task-a', title: TASK_TITLE, type: 'TIRE_CHECK' }),
      task({ id: 'task-b', title: TASK_TITLE_2, type: 'BRAKE_CHECK' }),
    ];

    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, {
        children: createElement(
          'div',
          null,
          tasks.map((row) =>
            createElement(OperatorTaskCard, {
              key: row.id,
              task: row,
              onOpen: () => undefined,
            }),
          ),
        ),
      }),
    );

    const openButtons = () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label]')).filter(
        (button) => button.getAttribute('aria-label')?.includes(TASK_TITLE),
      );

    expect(openButtons()[0]?.getAttribute('aria-label')).toBe(
      operatorTaskCardOpenAriaLabel('de', TASK_TITLE),
    );
    expect(container.textContent).toContain(TASK_TITLE);
    expect(container.textContent).toContain(TASK_TITLE_2);

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(openButtons()[0]?.getAttribute('aria-label')).toBe(
      operatorTaskCardOpenAriaLabel('en', TASK_TITLE),
    );
    expect(container.textContent).toContain(TASK_TITLE);
    expect(container.textContent).toContain(TASK_TITLE_2);
    expect(container.textContent).not.toContain('operator.task.card.');

    cleanup();
  });

  it('preserves overdue machine state and localized overdue label', () => {
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorTaskCard, {
        task: task({
          id: 'task-overdue',
          title: TASK_TITLE,
          type: 'TIRE_CHECK',
          isOverdue: true,
          status: 'OPEN',
        }),
        onOpen: () => undefined,
      }),
    );

    expect(container.textContent).toContain(operatorTaskCardOverdueLabel('en'));
    expect(container.textContent).not.toContain('OPEN');

    cleanup();
  });

  it('does not render raw translation keys', () => {
    const { container, cleanup } = renderWithLocale(
      'en',
      createElement(OperatorTaskCard, {
        task: task({ id: 'task-raw', title: TASK_TITLE, type: 'TIRE_CHECK' }),
        onOpen: () => undefined,
      }),
    );

    expect(container.textContent).not.toContain('operator.task.card.');
    expect(container.textContent).not.toContain('tasks.filter.status.');

    cleanup();
  });
});
