import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskDetail } from './types';
import {
  buildTaskDetailViewModel,
  inferTaskChecklistProgress,
  sanitizeReasonBasis,
} from './taskDetailView.utils';

function baseTask(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: 'Reifenprofil unter Mindesttiefe.',
    category: 'Maintenance',
    status: 'OPEN',
    priority: 'HIGH',
    source: 'INSIGHT_HEALTH',
    sourceType: 'HEALTH',
    dedupKey: 'dedup-1',
    vehicleId: 'vehicle-1',
    bookingId: 'booking-1',
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-1',
    assignedUserName: 'Alex Operator',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: {
      detectedAt: '2026-07-14T08:00:00.000Z',
      evidenceSummary: 'Sensor meldet 2,1 mm',
    },
    isOverdue: true,
    dueDate: '2026-07-15T14:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [
      {
        id: 'c1',
        title: 'Reifen prüfen',
        description: 'Alle vier Räder',
        sortOrder: 1,
        isDone: false,
        isRequired: true,
        completedAt: null,
        completedByUserId: null,
      },
    ],
    comments: [],
    timeline: [],
    linkedObjects: [
      {
        type: 'VEHICLE',
        id: 'vehicle-1',
        primaryLabel: 'M-AB 1234',
        secondaryLabel: 'VW Golf',
        iconKey: 'vehicle',
        action: { type: 'OPEN_VEHICLE', vehicleId: 'vehicle-1' },
        isAvailable: true,
      },
    ],
    ...partial,
  };
}

function normalizedDetail(
  task: ApiTask,
  overrides?: Partial<Pick<ApiTaskDetail, 'reason' | 'nextAction' | 'linkedObjects' | 'summary'>>,
): ApiTaskDetail {
  return {
    ...task,
    summary: {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      priority: task.priority,
      sourceType: task.sourceType,
      humanReadableSource: 'Fahrzeug-Health',
      completionMode: null,
      ...overrides?.summary,
    },
    reason: {
      title: 'Reifen prüfen / wechseln',
      description: task.description,
      detectedAt: '2026-07-14T08:00:00.000Z',
      basis: 'Quelle: INSIGHT_HEALTH · Sensor meldet 2,1 mm',
      ...overrides?.reason,
    },
    nextAction: {
      label: 'Starten',
      description: 'Beginnen Sie mit der Bearbeitung.',
      actionType: 'START',
      targetType: 'TASK',
      targetId: task.id,
      enabled: true,
      disabledReason: null,
      ...overrides?.nextAction,
    },
    linkedObjects: overrides?.linkedObjects ?? task.linkedObjects ?? [],
    checklistProgress: inferTaskChecklistProgress(task),
    assignment: {
      assignedUser: { id: 'user-1', displayName: 'Alex Operator' },
      createdBy: { id: 'system', displayName: 'System' },
      responsibleRoleLabel: 'Werkstatt',
    },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.activatesAt ?? task.createdAt,
      dueDate: task.dueDate,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      isActive: true,
      isOverdue: task.isOverdue,
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
      dedupKey: task.dedupKey,
      metadata: task.metadata,
    },
    availableActions: {
      start: { enabled: true },
      moveToWaiting: { enabled: false },
      resume: { enabled: false },
      complete: { enabled: false, disabledReason: 'Offene Pflichtpunkte in der Checkliste.' },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: false },
    },
  };
}

describe('buildTaskDetailViewModel', () => {
  it('maps normalized backend sections without technical source codes in the reason area', () => {
    const task = normalizedDetail(baseTask({ id: 'task-1', title: 'Reifen prüfen', type: 'TIRE_CHECK' }));
    const model = buildTaskDetailViewModel(task, {
      orgMembers: [{ id: 'user-1', name: 'Alex Operator' }],
    });

    expect(model.reason.headline).toBe('Reifen prüfen / wechseln');
    expect(model.reason.description).toContain('Reifenprofil');
    expect(model.reason.basis).toBe('Sensor meldet 2,1 mm');
    expect(model.reason.basis).not.toContain('INSIGHT_HEALTH');
    expect(model.reason.humanReadableSource).toBe('Fahrzeug-Health');
    expect(model.nextStep?.primaryActionLabel).toBe('Starten');
    expect(model.linkedObjects[0]?.primaryLabel).toBe('M-AB 1234');
    expect(model.technical.rows.some((row) => row.label === 'Rohquelle')).toBe(true);
  });

  it('uses backend nextAction disabledReason without frontend inference', () => {
    const task = normalizedDetail(
      baseTask({ id: 'task-2', title: 'HU', type: 'VEHICLE_INSPECTION', status: 'IN_PROGRESS' }),
      {
        nextAction: {
          label: 'Abschließen',
          description: 'Offene Pflichtpunkte in der Checkliste.',
          actionType: 'COMPLETE',
          targetType: 'TASK',
          targetId: 'task-2',
          enabled: false,
          disabledReason: 'Offene Pflichtpunkte in der Checkliste.',
        },
      },
    );

    const model = buildTaskDetailViewModel(task);
    expect(model.nextStep?.enabled).toBe(false);
    expect(model.nextStep?.disabledReason).toBe('Offene Pflichtpunkte in der Checkliste.');
  });

  it('orders linked objects for invoice and document task scenarios', () => {
    const task = normalizedDetail(
      baseTask({ id: 'task-3', title: 'Rechnung erstellen', type: 'INVOICE_REQUIRED' }),
      {
        linkedObjects: [
          {
            type: 'INVOICE',
            id: 'inv-1',
            primaryLabel: 'FSM-2026-0042',
            iconKey: 'invoice',
            action: { type: 'OPEN_INVOICE', invoiceId: 'inv-1' },
            isAvailable: true,
          },
          {
            type: 'BOOKING',
            id: 'book-1',
            primaryLabel: 'BK-2026-0042',
            iconKey: 'booking',
            action: { type: 'OPEN_BOOKING', bookingId: 'book-1' },
            isAvailable: true,
          },
          {
            type: 'CUSTOMER',
            id: 'cust-1',
            primaryLabel: 'Erika Beispiel',
            iconKey: 'customer',
            action: { type: 'OPEN_CUSTOMER', customerId: 'cust-1' },
            isAvailable: true,
          },
        ],
      },
    );

    const model = buildTaskDetailViewModel(task);
    expect(model.linkedObjects.map((row) => row.type)).toEqual(['BOOKING', 'CUSTOMER', 'INVOICE']);
  });
});

describe('sanitizeReasonBasis', () => {
  it('removes technical source code fragments from basis text', () => {
    expect(sanitizeReasonBasis('Quelle: INSIGHT_HEALTH · Sensor meldet 2,1 mm')).toBe(
      'Sensor meldet 2,1 mm',
    );
  });
});

describe('inferTaskChecklistProgress', () => {
  it('infers checklist blockers for open required items', () => {
    const progress = inferTaskChecklistProgress(
      baseTask({ id: 'task-3', title: 'Check', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );

    expect(progress.hasChecklist).toBe(true);
    expect(progress.canCompleteByChecklist).toBe(false);
    expect(progress.remainingRequiredItems).toBe(1);
  });
});
