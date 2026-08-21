// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTask } from '../../../../lib/api';
import { TaskPreviewCard } from './TaskPreviewCard';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';

function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let value: string = en[key] ?? String(key);
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(val));
    }
  }
  return value;
}

function task(over: Partial<ApiTask> = {}): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Zahlungseingang prüfen',
    description: 'Bitte Zahlung gegen Rechnung prüfen.',
    category: 'Maintenance',
    type: 'INVOICE_REQUIRED',
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
    invoiceId: 'inv-1',
    serviceCaseId: null,
    assignedUserId: null,
    assignedUserName: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: true,
    bucket: 'OVERDUE',
    dueDate: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedObjects: [{
      type: 'INVOICE',
      id: 'inv-1',
      primaryLabel: 'Rechnung FMS-2026-0004',
      secondaryLabel: null,
      iconKey: 'invoice',
      action: { type: 'OPEN_INVOICE', invoiceId: 'inv-1' },
      isAvailable: true,
    }],
    ...over,
  };
}

describe('TaskPreviewCard', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onOpenTask = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onOpenTask.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderCard(over: Partial<ApiTask> = {}) {
    act(() => {
      root.render(
        createElement(TaskPreviewCard, {
          task: task(over),
          vehicleById: new Map([
            ['veh-1', { id: 'veh-1', license: 'KS FH 660E', model: 'Model 3' } as never],
          ]),
          t,
          locale: 'de-DE',
          onOpenTask,
        }),
      );
    });
  }

  it('starts collapsed without description or linked object', () => {
    renderCard();
    const card = container.querySelector('[data-testid="dashboard-task-preview-card"]');
    expect(card?.getAttribute('data-expanded')).toBe('false');
    expect(container.textContent).toContain('Zahlungseingang prüfen');
    expect(container.textContent).toContain(en['dashboardTasksOverview.notAssigned']);
    expect(container.textContent).not.toContain('Bitte Zahlung gegen Rechnung');
    expect(container.textContent).not.toContain('KS FH 660E');
    expect(container.textContent).toContain(en['dashboardTasksOverview.priorityHigh']);
    expect(container.textContent).toContain(en['dashboardTasksOverview.dueOverdue']);
    expect(container.querySelectorAll('[class*="uppercase"]').length).toBe(0);
  });

  it('applies critical priority surface for HIGH tasks', () => {
    renderCard({ priority: 'HIGH' });
    const card = container.querySelector('[data-testid="dashboard-task-preview-card"]');
    expect(card?.getAttribute('data-priority')).toBe('High');
    expect(card?.className).toContain('--status-critical');
  });

  it('keeps overdue due label independent from medium priority tone', () => {
    renderCard({ priority: 'NORMAL', isOverdue: true, invoiceId: null, type: 'CUSTOM' });
    expect(container.textContent).toContain(en['dashboardTasksOverview.priorityMedium']);
    expect(container.textContent).toContain(en['dashboardTasksOverview.dueOverdue']);
    const card = container.querySelector('[data-testid="dashboard-task-preview-card"]');
    expect(card?.className).toContain('--status-watch');
  });

  it('shows high priority with neutral no-due-date label', () => {
    renderCard({ priority: 'HIGH', isOverdue: false, dueDate: null });
    expect(container.textContent).toContain(en['dashboardTasksOverview.priorityHigh']);
    expect(container.textContent).toContain(en['dashboardTasksOverview.noDueDate']);
    const card = container.querySelector('[data-testid="dashboard-task-preview-card"]');
    expect(card?.className).toContain('--status-critical');
  });

  it('expands on chevron click and shows description + linked object', () => {
    renderCard();
    const chevron = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    act(() => {
      chevron.click();
    });
    expect(container.querySelector('[data-expanded="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Bitte Zahlung gegen Rechnung');
    expect(container.textContent).toContain('Rechnung FMS-2026-0004');
  });

  it('collapses again when chevron is toggled', () => {
    renderCard();
    const chevron = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    act(() => {
      chevron.click();
    });
    const collapse = container.querySelector('button[aria-expanded="true"]') as HTMLButtonElement;
    act(() => {
      collapse.click();
    });
    expect(container.querySelector('[data-expanded="false"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Bitte Zahlung gegen Rechnung');
  });

  it('shows assignee in collapsed state', () => {
    renderCard({ assignedUserId: 'user-1', assignedUserName: 'Max Mustermann' });
    expect(container.textContent).toContain('Max Mustermann');
    expect(container.textContent).toContain(
      en['dashboardTasksOverview.assignedTo'].replace('{name}', 'Max Mustermann'),
    );
  });

  it('open task CTA navigates without expanding', () => {
    renderCard();
    const chevron = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    act(() => {
      chevron.click();
    });
    const openButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes(en['dashboardTasksOverview.openTask']),
    ) as HTMLButtonElement;
    act(() => {
      openButton.click();
    });
    expect(onOpenTask).toHaveBeenCalledWith('task-1');
  });

  it('chevron toggle does not open task', () => {
    renderCard();
    const chevron = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    act(() => {
      chevron.click();
    });
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it('wires chevron aria-controls to the detail panel id', () => {
    renderCard();
    const chevron = container.querySelector('button[aria-expanded="false"]') as HTMLButtonElement;
    expect(chevron.getAttribute('aria-controls')).toBe('dashboard-task-preview-task-1');
    expect(document.getElementById('dashboard-task-preview-task-1')).not.toBeNull();
  });
});
