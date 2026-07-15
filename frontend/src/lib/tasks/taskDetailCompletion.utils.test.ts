/**
 * Task Domain V2 — Completion control model (areas 3 + 4)
 */
import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskDetail } from './types';
import { inferTaskChecklistProgress } from './taskDetailView.utils';
import { buildTaskCompletionControlModel } from './taskDetailCompletion.utils';

function detail(
  partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>,
  actions?: Partial<ApiTaskDetail['availableActions']>,
): ApiTaskDetail {
  const task: ApiTask = {
    organizationId: 'org-1',
    description: 'Beschreibung',
    category: 'Maintenance',
    status: 'IN_PROGRESS',
    priority: 'NORMAL',
    source: 'MANUAL',
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
    metadata: {},
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [
      {
        id: 'req-1',
        title: 'Pflicht offen',
        description: '',
        sortOrder: 0,
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
      completionMode: partial.status === 'DONE' ? 'MANUAL' : null,
    },
    reason: { title: task.title, description: task.description },
    nextAction: {
      label: 'Abschließen',
      actionType: 'COMPLETE',
      targetType: 'TASK',
      targetId: task.id,
      enabled: false,
      disabledReason: 'Pflichtpunkte offen',
    },
    linkedObjects: [],
    checklistProgress: inferTaskChecklistProgress(task),
    assignment: { assignedUser: null, createdBy: null, responsibleRoleLabel: null },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.createdAt,
      dueDate: task.dueDate,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt,
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
    technicalMetadata: { source: null, dedupKey: null, metadata: null },
    availableActions: {
      start: { enabled: false },
      moveToWaiting: { enabled: true },
      resume: { enabled: false },
      complete: { enabled: false, disabledReason: 'Pflichtpunkte offen' },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: true },
      ...actions,
    },
  };
}

describe('buildTaskCompletionControlModel', () => {
  it('blocks completion when required checklist items are open', () => {
    const model = buildTaskCompletionControlModel(
      detail({ id: 't1', title: 'Task', type: 'BOOKING_PICKUP' }),
    );

    expect(model.enabled).toBe(false);
    expect(model.openRequiredTitles).toEqual(['Pflicht offen']);
    expect(model.blockerSummary).toContain('Pflicht offen');
  });

  it('allows manager override when backend grants overrideCompletion', () => {
    const model = buildTaskCompletionControlModel(
      detail(
        { id: 't1', title: 'Task', type: 'BOOKING_PICKUP' },
        { overrideCompletion: { enabled: true } },
      ),
    );

    expect(model.canOverride).toBe(true);
    expect(model.overrideDisabledReason).toBeNull();
  });

  it('rejects override without manage permission signal from backend', () => {
    const model = buildTaskCompletionControlModel(
      detail(
        { id: 't1', title: 'Task', type: 'BOOKING_PICKUP' },
        {
          overrideCompletion: {
            enabled: false,
            disabledReason: 'Keine Berechtigung für den Checklisten-Override',
          },
        },
      ),
    );

    expect(model.canOverride).toBe(false);
    expect(model.overrideDisabledReason).toContain('Berechtigung');
  });

  it('enables completion when all required items are done', () => {
    const model = buildTaskCompletionControlModel(
      detail(
        {
          id: 't1',
          title: 'Task',
          type: 'CUSTOM',
          checklist: [
            {
              id: 'req-1',
              title: 'Erledigt',
              description: '',
              sortOrder: 0,
              isDone: true,
              isRequired: true,
              completedAt: '2026-07-15T10:00:00.000Z',
              completedByUserId: 'u1',
            },
          ],
        },
        { complete: { enabled: true } },
      ),
    );

    expect(model.enabled).toBe(true);
    expect(model.openRequiredTitles).toEqual([]);
    expect(model.blockerSummary).toBeNull();
  });
});
