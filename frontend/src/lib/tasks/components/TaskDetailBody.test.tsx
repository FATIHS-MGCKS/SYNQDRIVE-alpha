import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildTaskDetailViewModel } from '../taskDetailView.utils';
import { TaskDetailBody } from './TaskDetailBody';
import type { ApiTask, ApiTaskDetail } from '../types';
import { inferTaskChecklistProgress } from '../taskDetailView.utils';

function normalizedTaskFixture(): ApiTaskDetail {
  const task: ApiTask = {
    id: 'task-detail-1',
    organizationId: 'org-1',
    title: 'Dokumente für Übergabe prüfen mit sehr langem deutschen Aufgabentitel für Mobile Layout',
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
        primaryLabel: 'BK-2026-0042 mit sehr langem Buchungslabel für Truncation Test',
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

  return {
    ...task,
    summary: {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      priority: task.priority,
      sourceType: task.sourceType,
      humanReadableSource: 'Buchung',
      completionMode: null,
    },
    reason: {
      title: 'Buchungsvorbereitung',
      description: task.description,
      detectedAt: '2026-07-14T08:00:00.000Z',
      basis: 'Dokumentenpaket unvollständig',
    },
    nextAction: {
      label: 'Starten',
      description: 'Mit der Vorbereitung beginnen.',
      actionType: 'START',
      targetType: 'TASK',
      targetId: task.id,
      enabled: false,
      disabledReason: 'Die Aufgabe ist noch nicht aktiv.',
    },
    linkedObjects: task.linkedObjects ?? [],
    checklistProgress: inferTaskChecklistProgress(task),
    assignment: {
      assignedUser: { id: 'user-1', displayName: 'Sam Station' },
      createdBy: { id: 'system', displayName: 'System' },
      responsibleRoleLabel: null,
    },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.createdAt,
      dueDate: task.dueDate,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      isActive: true,
      isOverdue: false,
      bucket: 'TODAY',
    },
    completion: {
      completionMode: null,
      resolutionCode: null,
      resolutionNote: null,
      completedBy: null,
      supersededByTaskId: null,
    },
    timeline: [],
    technicalMetadata: {
      source: task.source,
      dedupKey: null,
      metadata: null,
    },
    availableActions: {
      start: { enabled: false, disabledReason: 'Die Aufgabe ist noch nicht aktiv.' },
      moveToWaiting: { enabled: false },
      resume: { enabled: false },
      complete: { enabled: false },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: false },
    },
  };
}

describe('TaskDetailBody', () => {
  const model = buildTaskDetailViewModel(normalizedTaskFixture());

  it('renders normalized reason, next step and linked objects in order', () => {
    const html = renderToStaticMarkup(
      <TaskDetailBody
        model={model}
        density="desktop"
        hideHeader
        onPrimaryAction={vi.fn()}
        onLinkedObjectClick={vi.fn()}
        onChecklistToggle={vi.fn()}
      />,
    );

    const reasonIndex = html.indexOf('Warum wurde diese Aufgabe erstellt?');
    const nextStepIndex = html.indexOf('Nächster Schritt');
    const linkedIndex = html.indexOf('Verknüpfte Objekte');

    expect(reasonIndex).toBeGreaterThan(-1);
    expect(nextStepIndex).toBeGreaterThan(reasonIndex);
    expect(linkedIndex).toBeGreaterThan(nextStepIndex);
    expect(html).toContain('Auslöser: Buchung');
    expect(html).toContain('Dokumentenpaket unvollständig');
    expect(html).not.toContain('INSIGHT_');
    expect(html).toContain('Die Aufgabe ist noch nicht aktiv.');
    expect(html).toContain('truncate');
    expect(html).toContain('BK-2026-0042 mit sehr langem Buchungslabel');
  });

  it('renders compact mobile header with safe-area friendly density classes', () => {
    const html = renderToStaticMarkup(
      <TaskDetailBody model={model} density="mobile" onClose={vi.fn()} />,
    );

    expect(html).toContain('data-density="mobile"');
    expect(html).toContain('Dokumente für Übergabe prüfen mit sehr langem deutschen Aufgabentitel');
    expect(html).toContain('aria-label="Schließen"');
  });
});
