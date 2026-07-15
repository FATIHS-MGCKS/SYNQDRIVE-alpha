import { describe, expect, it, vi } from 'vitest';
import type { ApiTask, ApiTaskDetail } from './types';
import {
  buildTaskDetailChecklistModel,
  computeChecklistProgressPercent,
  formatChecklistProgressLabel,
  isLegacyDoneWithOpenChecklist,
  patchTaskChecklistItem,
  resolveChecklistDisplayMode,
} from './taskDetailChecklist.utils';
import { inferTaskChecklistProgress } from './taskDetailView.utils';
import { buildTaskCompletionControlModel } from './taskDetailCompletion.utils';

function baseTask(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: 'Beschreibung',
    category: 'Maintenance',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    sourceType: 'MANUAL',
    dedupKey: null,
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
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [
      {
        id: 'required-open',
        title: 'Pflicht offen',
        description: 'Details zur Pflicht',
        sortOrder: 1,
        isDone: false,
        isRequired: true,
        completedAt: null,
        completedByUserId: null,
      },
      {
        id: 'optional-done',
        title: 'Optional erledigt',
        description: '',
        sortOrder: 2,
        isDone: true,
        isRequired: false,
        completedAt: '2026-07-14T09:00:00.000Z',
        completedByUserId: 'user-1',
      },
      {
        id: 'required-done',
        title: 'Pflicht erledigt',
        description: '',
        sortOrder: 3,
        isDone: true,
        isRequired: true,
        completedAt: '2026-07-14T09:00:00.000Z',
        completedByUserId: 'user-1',
      },
      {
        id: 'optional-open',
        title: 'Optional offen',
        description: 'Optionale Beschreibung',
        sortOrder: 4,
        isDone: false,
        isRequired: false,
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
  overrides?: Partial<Pick<ApiTaskDetail, 'summary' | 'completion' | 'availableActions'>>,
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
      ...overrides?.summary,
    },
    reason: {
      title: task.title,
      description: task.description,
    },
    nextAction: {
      label: 'Starten',
      actionType: 'START',
      targetType: 'TASK',
      targetId: task.id,
      enabled: true,
      disabledReason: null,
    },
    linkedObjects: [],
    checklistProgress: inferTaskChecklistProgress(task),
    assignment: {
      assignedUser: null,
      createdBy: null,
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
      ...overrides?.completion,
    },
    timeline: [],
    technicalMetadata: {
      source: task.source,
      dedupKey: task.dedupKey,
      metadata: task.metadata,
    },
    availableActions: {
      start: { enabled: true },
      moveToWaiting: { enabled: true },
      resume: { enabled: false },
      complete: { enabled: false, disabledReason: 'Offene Pflichtpunkte in der Checkliste.' },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: false },
      ...overrides?.availableActions,
    },
  };
}

describe('taskDetailChecklist.utils', () => {
  it('formats total progress as "2 von 4 erledigt"', () => {
    const progress = inferTaskChecklistProgress(
      baseTask({ id: 't1', title: 'Check', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    expect(formatChecklistProgressLabel(progress)).toBe('2 von 4 erledigt');
    expect(computeChecklistProgressPercent(progress)).toBe(50);
  });

  it('marks editable checklist for active statuses with available actions', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't2', title: 'Check', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    expect(resolveChecklistDisplayMode(detail)).toBe('editable');
    const model = buildTaskDetailChecklistModel(detail);
    expect(model?.canEditItems).toBe(true);
    expect(model?.showAsInteractive).toBe(true);
  });

  it('renders read-only checklist for DONE without legacy open items', () => {
    const task = baseTask({
      id: 't3',
      title: 'Done',
      type: 'CUSTOM',
      status: 'DONE',
      checklist: [
        {
          id: 'c1',
          title: 'Punkt',
          description: '',
          sortOrder: 1,
          isDone: true,
          isRequired: true,
          completedAt: '2026-07-14T10:00:00.000Z',
          completedByUserId: 'user-1',
        },
      ],
    });
    const detail = normalizedDetail(task, {
      summary: { ...normalizedDetail(task).summary, status: 'DONE' },
    });
    expect(resolveChecklistDisplayMode(detail)).toBe('readOnly');
    expect(buildTaskDetailChecklistModel(detail)?.canEditItems).toBe(false);
  });

  it('shows legacy DONE hint when closed task still has open checklist items', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't4', title: 'Legacy', type: 'CUSTOM', status: 'DONE' }),
      { summary: { ...normalizedDetail(baseTask({ id: 't4', title: 'Legacy', type: 'CUSTOM', status: 'DONE' })).summary, status: 'DONE' } },
    );
    expect(isLegacyDoneWithOpenChecklist(detail)).toBe(true);
    const model = buildTaskDetailChecklistModel(detail);
    expect(model?.mode).toBe('documentationOnly');
    expect(model?.legacyClosedHint).toContain('älterer Logik');
    expect(model?.canEditItems).toBe(false);
  });

  it('uses documentation mode for AUTO_RESOLVED and SUPERSEDED', () => {
    const autoResolved = normalizedDetail(
      baseTask({ id: 't5', title: 'Auto', type: 'CUSTOM', status: 'DONE' }),
      {
        summary: {
          id: 't5',
          title: 'Auto',
          type: 'CUSTOM',
          status: 'DONE',
          priority: 'NORMAL',
          sourceType: 'SYSTEM',
          humanReadableSource: 'System',
          completionMode: 'AUTO_RESOLVED',
        },
      },
    );
    expect(resolveChecklistDisplayMode(autoResolved)).toBe('documentationOnly');
    expect(buildTaskDetailChecklistModel(autoResolved)?.showAsInteractive).toBe(false);

    const superseded = normalizedDetail(
      baseTask({ id: 't6', title: 'Superseded', type: 'CUSTOM', status: 'DONE' }),
      {
        completion: {
          completionMode: 'SUPERSEDED',
          resolutionCode: null,
          resolutionNote: null,
          completedBy: null,
          supersededByTaskId: 'next-task',
        },
      },
    );
    expect(resolveChecklistDisplayMode(superseded)).toBe('documentationOnly');
  });

  it('lists concrete open required blockers', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't7', title: 'Blocked', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    const model = buildTaskDetailChecklistModel(detail);
    expect(model?.openRequiredTitles).toEqual(['Pflicht offen']);
    expect(model?.blockerLabel).toBe('Pflichtpunkt offen: Pflicht offen');
  });

  it('patches checklist items optimistically and recalculates progress', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't8', title: 'Patch', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    const patched = patchTaskChecklistItem(detail, 'required-open', true);
    expect(patched.checklist?.find((item) => item.id === 'required-open')?.isDone).toBe(true);
    expect(patched.checklistProgress?.canCompleteByChecklist).toBe(true);
    expect(patched.checklistProgress?.completedItems).toBe(3);
  });

  it('exposes manager override availability from backend actions', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't9', title: 'Override', type: 'CUSTOM', status: 'IN_PROGRESS' }),
      {
        availableActions: {
          start: { enabled: false },
          moveToWaiting: { enabled: true },
          resume: { enabled: false },
          complete: { enabled: false, disabledReason: 'Offene Pflichtpunkte in der Checkliste.' },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: true },
        },
      },
    );
    const completion = buildTaskCompletionControlModel(detail);
    expect(completion.canOverride).toBe(true);
    expect(completion.enabled).toBe(false);
    expect(completion.openRequiredTitles).toEqual(['Pflicht offen']);
  });
});

describe('patchTaskChecklistItem rollback scenario', () => {
  it('restores prior state when reverting optimistic patch', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't10', title: 'Rollback', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    const snapshot = detail;
    const optimistic = patchTaskChecklistItem(detail, 'required-open', true);
    expect(optimistic.checklistProgress?.completedRequiredItems).toBe(2);
    expect(snapshot.checklistProgress?.completedRequiredItems).toBe(1);
  });
});
