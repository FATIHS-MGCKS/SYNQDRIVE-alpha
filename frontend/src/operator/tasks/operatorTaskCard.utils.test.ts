import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskDetail, TaskAvailableActions } from '../../lib/api';
import {
  buildOperatorTaskCardActionPlan,
  buildOperatorTaskCardModel,
  inferTaskAvailableActions,
  shouldShowOperatorTaskPriority,
} from './operatorTaskCard.utils';

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
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: null,
    assignedUserName: null,
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
    ...partial,
  };
}

function withActions(base: ApiTask, availableActions: TaskAvailableActions): ApiTaskDetail {
  return { ...base, availableActions };
}

describe('operatorTaskCard.utils', () => {
  it('shows priority only when critical, high, or overdue', () => {
    expect(shouldShowOperatorTaskPriority(task({ id: '1', title: 'A', type: 'TIRE_CHECK' }))).toBe(false);
    expect(
      shouldShowOperatorTaskPriority(
        task({ id: '2', title: 'B', type: 'TIRE_CHECK', priority: 'CRITICAL' }),
      ),
    ).toBe(true);
    expect(
      shouldShowOperatorTaskPriority(task({ id: '3', title: 'C', type: 'TIRE_CHECK', isOverdue: true })),
    ).toBe(true);
  });

  it('renders checklist blocker before completion is allowed', () => {
    const model = buildOperatorTaskCardModel(
      task({
        id: 'checklist',
        title: 'Buchung vorbereiten',
        type: 'BOOKING_PREPARATION',
        status: 'IN_PROGRESS',
        checklist: [
          {
            id: 'c1',
            title: 'Pflichtdokumente vollständig',
            description: '',
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
          },
        ],
      }),
    );

    expect(model.checklist?.blocked).toBe(true);
    expect(model.checklist?.blockerLabel).toContain('Pflichtpunkte');

    const plan = buildOperatorTaskCardActionPlan(
      task({
        id: 'checklist',
        title: 'Buchung vorbereiten',
        type: 'BOOKING_PREPARATION',
        status: 'IN_PROGRESS',
        bookingId: 'booking-1',
        checklist: [
          {
            id: 'c1',
            title: 'Pflichtdokumente vollständig',
            description: '',
            sortOrder: 0,
            isDone: false,
            isRequired: true,
            completedAt: null,
            completedByUserId: null,
          },
        ],
      }),
    );

    expect(plan.primary?.kind).toBe('open-booking');
    expect(plan.secondaries.some((action) => action.kind === 'complete')).toBe(false);
  });

  it('maps status-specific primary actions', () => {
    expect(
      buildOperatorTaskCardActionPlan(task({ id: 'open', title: 'Offen', type: 'TIRE_CHECK' })).primary,
    ).toMatchObject({ kind: 'start', label: 'Starten' });
    expect(
      buildOperatorTaskCardActionPlan(
        task({ id: 'waiting', title: 'Wartend', type: 'TIRE_CHECK', status: 'WAITING' }),
      ).primary,
    ).toMatchObject({ kind: 'resume', label: 'Fortsetzen' });
    expect(
      buildOperatorTaskCardActionPlan(
        task({ id: 'progress', title: 'Laufend', type: 'TIRE_CHECK', status: 'IN_PROGRESS' }),
      ).primary,
    ).toMatchObject({ kind: 'complete', label: 'Erledigen' });
  });

  it('uses type-specific primary actions', () => {
    expect(
      buildOperatorTaskCardActionPlan(
        task({
          id: 'doc',
          title: 'Dokumente',
          type: 'DOCUMENT_REVIEW',
          bookingId: 'booking-abc123',
        }),
      ).primary,
    ).toMatchObject({ kind: 'open-document-package', label: 'Dokumentenpaket öffnen' });

    expect(
      buildOperatorTaskCardActionPlan(
        task({
          id: 'invoice',
          title: 'Rechnung prüfen',
          type: 'INVOICE_REQUIRED',
          invoiceId: 'inv-1',
        }),
      ).primary,
    ).toMatchObject({ kind: 'open-invoice', label: 'Rechnung öffnen' });
  });

  it('respects backend availableActions permissions', () => {
    const base = task({ id: 'perm', title: 'Perm', type: 'TIRE_CHECK', status: 'IN_PROGRESS' });
    const denied = withActions(base, {
      start: { enabled: false },
      moveToWaiting: { enabled: false },
      resume: { enabled: false },
      complete: { enabled: false, disabledReason: 'Keine Berechtigung' },
      cancel: { enabled: false },
      comment: { enabled: true },
      overrideCompletion: { enabled: false },
    });

    const plan = buildOperatorTaskCardActionPlan(denied);
    expect(plan.primary).toMatchObject({ kind: 'open-task', label: 'Aufgabe öffnen' });
    expect(plan.secondaries.map((row) => row.kind)).toEqual(['comment']);
  });

  it('allows override completion only with manage permission inference', () => {
    const blocked = task({
      id: 'override',
      title: 'Override',
      type: 'BOOKING_PREPARATION',
      status: 'IN_PROGRESS',
      checklistProgress: {
        totalItems: 1,
        completedItems: 0,
        requiredItems: 1,
        completedRequiredItems: 0,
        remainingRequiredItems: 1,
        progressPercent: 0,
        hasChecklist: true,
        areRequiredItemsComplete: false,
        canCompleteByChecklist: false,
        completionBlockers: ['REQUIRED_CHECKLIST_ITEMS_OPEN'],
      },
    });

    expect(inferTaskAvailableActions(blocked, false).complete.enabled).toBe(false);
    expect(inferTaskAvailableActions(blocked, true).overrideCompletion.enabled).toBe(true);
  });

  it('hides actions for auto-resolved tasks', () => {
    const plan = buildOperatorTaskCardActionPlan(
      task({
        id: 'auto',
        title: 'Auto',
        type: 'INVOICE_REQUIRED',
        status: 'DONE',
        completionMode: 'AUTO_RESOLVED',
      }),
    );
    expect(plan.primary).toBeNull();
    expect(plan.secondaries).toEqual([]);
  });

  it('flags missing linked object without fabricating labels', () => {
    const model = buildOperatorTaskCardModel(
      task({
        id: 'missing',
        title: 'Fehlendes Objekt',
        type: 'VEHICLE_SERVICE',
        vehicleId: 'vehicle-1',
        linkedObjects: [
          {
            type: 'VEHICLE',
            id: 'vehicle-1',
            primaryLabel: 'Fahrzeug nicht verfügbar',
            iconKey: 'vehicle',
            action: { type: 'OPEN_VEHICLE', vehicleId: 'vehicle-1' },
            isAvailable: false,
            unavailableReason: 'Fahrzeug gelöscht',
          },
        ],
      }),
    );

    expect(model.objectLine).toBeNull();
    expect(model.objectUnavailable).toBe(true);
  });
});
