import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskDetail } from './types';
import { inferTaskChecklistProgress } from './taskDetailView.utils';
import {
  buildCompleteTaskPayload,
  buildTaskCompleteFormModel,
  validateTaskCompleteForm,
} from './taskCompleteForm.utils';

function baseTask(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: 'Beschreibung',
    category: 'Maintenance',
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    source: 'MANUAL',
    sourceType: 'MANUAL',
    dedupKey: 'dedup-1',
    vehicleId: 'vehicle-1',
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
    metadata: {},
    isOverdue: false,
    dueDate: null,
    startedAt: '2026-07-14T09:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [
      {
        id: 'req-1',
        title: 'Pflicht offen',
        description: '',
        sortOrder: 1,
        isDone: false,
        isRequired: true,
        completedAt: null,
        completedByUserId: null,
      },
    ],
    comments: [],
    timeline: [],
    linkedObjects: [],
    ...partial,
  };
}

function normalizedDetail(
  task: ApiTask,
  overrides?: Partial<Pick<ApiTaskDetail, 'availableActions'>>,
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
      humanReadableSource: 'Manuell',
      completionMode: null,
    },
    reason: { title: task.title, description: task.description },
    nextAction: {
      label: 'Abschließen',
      actionType: 'COMPLETE',
      targetType: 'TASK',
      targetId: task.id,
      enabled: false,
      disabledReason: 'Offene Pflichtpunkte in der Checkliste.',
    },
    linkedObjects: [],
    checklistProgress: inferTaskChecklistProgress(task),
    assignment: { assignedUser: null, createdBy: null, responsibleRoleLabel: null },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.createdAt,
      dueDate: task.dueDate,
      startedAt: task.startedAt,
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
    technicalMetadata: { source: task.source, dedupKey: task.dedupKey, metadata: task.metadata },
    availableActions: {
      start: { enabled: false },
      moveToWaiting: { enabled: true },
      resume: { enabled: false },
      complete: { enabled: false, disabledReason: 'Offene Pflichtpunkte in der Checkliste.' },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: true },
      ...overrides?.availableActions,
    },
  };
}

describe('taskCompleteForm.utils', () => {
  it('lists open required checklist titles in the form model', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't1', title: 'Check', type: 'TIRE_CHECK', status: 'IN_PROGRESS' }),
    );
    const model = buildTaskCompleteFormModel(detail);
    expect(model.openRequiredTitles).toEqual(['Pflicht offen']);
    expect(model.requiresResolutionCode).toBe(true);
    expect(model.showsCostFields).toBe(true);
  });

  it('requires resolution note for REPAIR tasks', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't2', title: 'Reparatur', type: 'REPAIR', status: 'IN_PROGRESS' }),
      {
        availableActions: {
          start: { enabled: false },
          moveToWaiting: { enabled: true },
          resume: { enabled: false },
          complete: { enabled: true },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: false },
        },
      },
    );
    const model = buildTaskCompleteFormModel(detail);
    expect(model.requiresResolutionNote).toBe(true);

    const errors = validateTaskCompleteForm(detail, {
      resolutionCode: 'REPAIR_COMPLETED',
      resolutionNote: '',
      actualCostEuros: '',
      overrideReason: '',
      useOverride: false,
    });
    expect(errors.resolutionNote).toContain('Abschluss-Notiz');
  });

  it('requires override reason for manager override', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't3', title: 'Check', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    const errors = validateTaskCompleteForm(detail, {
      resolutionCode: '',
      resolutionNote: 'Erledigt',
      actualCostEuros: '',
      overrideReason: '',
      useOverride: true,
    });
    expect(errors.overrideReason).toContain('Begründung');
  });

  it('builds complete payload with override and cost fields', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't4', title: 'Reparatur', type: 'REPAIR', status: 'IN_PROGRESS' }),
      {
        availableActions: {
          start: { enabled: false },
          moveToWaiting: { enabled: true },
          resume: { enabled: false },
          complete: { enabled: true },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: true },
        },
      },
    );
    const payload = buildCompleteTaskPayload(detail, {
      resolutionCode: 'REPAIR_COMPLETED',
      resolutionNote: 'Bremsen erneuert',
      actualCostEuros: '149,50',
      overrideReason: 'Dringend freigegeben',
      useOverride: true,
    });
    expect(payload.resolutionCode).toBe('REPAIR_COMPLETED');
    expect(payload.resolutionNote).toBe('Bremsen erneuert');
    expect(payload.actualCostCents).toBe(14950);
    expect(payload.overrideIncompleteChecklist).toBe(true);
    expect(payload.overrideReason).toBe('Dringend freigegeben');
  });
});
