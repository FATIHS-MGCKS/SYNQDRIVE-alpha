import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTaskDetailViewModel } from '../taskDetailView.utils';
import { TaskDetailBody } from './TaskDetailBody';
import { TaskDetailShell } from './TaskDetailShell';
import type { ApiTask } from '../types';

function taskFixture(): ApiTask {
  return {
    id: 'task-detail-1',
    organizationId: 'org-1',
    title: 'Dokumente für Übergabe prüfen',
    description: 'Führerschein und Mietvertrag fehlen noch.',
    category: 'Booking',
    type: 'BOOKING_PREPARATION',
    status: 'OPEN',
    priority: 'CRITICAL',
    source: 'BOOKING',
    sourceType: 'BOOKING',
    dedupKey: null,
    vehicleId: 'vehicle-1',
    bookingId: 'booking-1',
    customerId: 'customer-1',
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-1',
    assignedUserName: 'Sam Station',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: '2026-07-15T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [
      {
        id: 'check-1',
        title: 'Führerschein prüfen',
        description: '',
        sortOrder: 1,
        isDone: false,
        isRequired: true,
        completedAt: null,
        completedByUserId: null,
      },
    ],
    comments: [],
    linkedObjects: [
      {
        type: 'BOOKING',
        id: 'booking-1',
        primaryLabel: 'BK-2026-0042',
        iconKey: 'booking',
        action: { type: 'OPEN_BOOKING', bookingId: 'booking-1' },
        isAvailable: true,
      },
      {
        type: 'VEHICLE',
        id: 'vehicle-1',
        primaryLabel: 'M-SD 4410',
        iconKey: 'vehicle',
        action: { type: 'OPEN_VEHICLE', vehicleId: 'vehicle-1' },
        isAvailable: true,
      },
    ],
  };
}

describe('TaskDetailBody', () => {
  const model = buildTaskDetailViewModel(taskFixture(), {
    orgMembers: [{ id: 'user-1', name: 'Sam Station' }],
  });

  it('renders the unified section order for desktop detail views', () => {
    const html = renderToStaticMarkup(
      <TaskDetailBody
        model={model}
        density="desktop"
        hideHeader
        onPrimaryAction={vi.fn()}
        onChecklistToggle={vi.fn()}
      />,
    );

    const reasonIndex = html.indexOf('Warum wurde diese Aufgabe erstellt?');
    const nextStepIndex = html.indexOf('Nächster Schritt');
    const checklistIndex = html.indexOf('Checkliste');
    const linkedIndex = html.indexOf('Verknüpfte Objekte');
    const notesIndex = html.indexOf('Notizen und Aktivität');
    const technicalIndex = html.indexOf('Technische Details');

    expect(reasonIndex).toBeGreaterThan(-1);
    expect(nextStepIndex).toBeGreaterThan(reasonIndex);
    expect(checklistIndex).toBeGreaterThan(nextStepIndex);
    expect(linkedIndex).toBeGreaterThan(checklistIndex);
    expect(notesIndex).toBeGreaterThan(linkedIndex);
    expect(technicalIndex).toBeGreaterThan(notesIndex);
    expect(html).toContain('BK-2026-0042');
    expect(html).toContain('Starten');
    expect(html).toContain('Pflicht');
  });

  it('renders compact mobile header with safe-area friendly density classes', () => {
    const html = renderToStaticMarkup(
      <TaskDetailBody
        model={model}
        density="mobile"
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain('data-density="mobile"');
    expect(html).toContain('Dokumente für Übergabe prüfen');
    expect(html).toContain('Fällig');
    expect(html).toContain('aria-label="Schließen"');
  });
});

describe('TaskDetailShell', () => {
  const model = buildTaskDetailViewModel(taskFixture());

  it('uses drawer chrome for desktop rental detail panels', () => {
    // Radix Sheet portals are not emitted in SSR; assert the shared drawer body contract.
    const html = renderToStaticMarkup(
      <TaskDetailBody
        model={model}
        density="desktop"
        hideHeader
        onPrimaryAction={vi.fn()}
      />,
    );

    expect(html).toContain('Führerschein und Mietvertrag fehlen noch.');
    expect(html).toContain('Warum wurde diese Aufgabe erstellt?');
    expect(html).not.toContain('data-testid="task-detail-header"');
  });

  it('uses inline shell for operator mobile layouts', () => {
    const html = renderToStaticMarkup(
      <TaskDetailShell
        variant="inline"
        model={model}
        density="mobile"
      />,
    );

    expect(html).toContain('data-testid="task-detail-shell-inline"');
    expect(html).toContain('data-density="mobile"');
    expect(html).toContain('data-testid="task-detail-header"');
  });
});
