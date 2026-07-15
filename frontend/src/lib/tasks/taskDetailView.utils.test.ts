import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskDetail } from './types';
import { buildTaskDetailViewModel, inferTaskChecklistProgress } from './taskDetailView.utils';

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
      {
        id: 'c2',
        title: 'Protokoll hochladen',
        description: '',
        sortOrder: 2,
        isDone: true,
        isRequired: false,
        completedAt: '2026-07-14T09:00:00.000Z',
        completedByUserId: 'user-1',
      },
    ],
    comments: [
      {
        id: 'comment-1',
        userId: 'user-1',
        body: 'Reifen bestellt',
        createdAt: '2026-07-14T10:00:00.000Z',
      },
    ],
    timeline: [
      {
        id: 'ev-1',
        type: 'CREATED',
        actorUserId: null,
        oldValue: null,
        newValue: 'OPEN',
        metadata: null,
        createdAt: '2026-07-14T08:00:00.000Z',
      },
    ],
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

function normalizedDetail(task: ApiTask): ApiTaskDetail {
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
    },
    reason: {
      title: 'Reifen prüfen / wechseln',
      description: task.description,
      detectedAt: '2026-07-14T08:00:00.000Z',
      basis: 'Quelle: INSIGHT_HEALTH · Sensor meldet 2,1 mm',
    },
    nextAction: {
      label: 'Aufgabe starten',
      description: 'Beginnen Sie mit der Bearbeitung.',
      actionType: 'START',
      targetType: 'TASK',
      targetId: task.id,
      enabled: true,
      disabledReason: null,
    },
    linkedObjects: task.linkedObjects ?? [],
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
    timeline: [
      {
        id: 'ev-1',
        type: 'CREATED',
        label: 'Aufgabe erstellt',
        actor: null,
        actorUserId: null,
        oldValue: null,
        newValue: 'OPEN',
        metadata: null,
        createdAt: '2026-07-14T08:00:00.000Z',
      },
    ],
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
  it('maps normalized backend sections into the shared detail structure', () => {
    const task = normalizedDetail(baseTask({ id: 'task-1', title: 'Reifen prüfen', type: 'TIRE_CHECK' }));
    const model = buildTaskDetailViewModel(task, {
      vehicleLabel: 'M-AB 1234',
      orgMembers: [{ id: 'user-1', name: 'Alex Operator' }],
    });

    expect(model.header.title).toBe('Reifen prüfen');
    expect(model.header.showPriority).toBe(true);
    expect(model.reason.title).toBe('Reifen prüfen / wechseln');
    expect(model.reason.basis).toContain('INSIGHT_HEALTH');
    expect(model.nextStep?.primaryActionLabel).toBe('Starten');
    expect(model.checklist?.blocked).toBe(true);
    expect(model.linkedObjects[0]?.primaryLabel).toBe('M-AB 1234');
    expect(model.comments[0]?.authorLabel).toBe('Alex Operator');
    expect(model.timeline[0]?.title).toBe('Aufgabe erstellt');
    expect(model.technical.rows.some((row) => row.label === 'Rolle')).toBe(true);
  });

  it('falls back to legacy flat fields when normalized sections are missing', () => {
    const task = baseTask({
      id: 'task-2',
      title: 'HU fällig',
      type: 'VEHICLE_INSPECTION',
      linkedObjects: undefined,
    });
    const model = buildTaskDetailViewModel(task, {
      displaySource: 'SynqDrive Insights',
      vehicleLabel: 'M-XY 9876',
    });

    expect(model.reason.title).toBe('VEHICLE INSPECTION');
    expect(model.reason.basis).toBe('SynqDrive Insights');
    expect(model.nextStep?.actionType).toBe('START');
    expect(model.linkedObjects[0]?.primaryLabel).toBe('M-XY 9876');
    expect(model.checklist?.progress.requiredItems).toBe(1);
  });

  it('infers checklist blockers for open required items', () => {
    const progress = inferTaskChecklistProgress(
      baseTask({ id: 'task-3', title: 'Check', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );

    expect(progress.hasChecklist).toBe(true);
    expect(progress.canCompleteByChecklist).toBe(false);
    expect(progress.remainingRequiredItems).toBe(1);
  });
});
