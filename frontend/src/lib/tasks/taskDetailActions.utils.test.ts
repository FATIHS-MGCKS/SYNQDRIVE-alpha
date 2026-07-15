import { describe, expect, it } from 'vitest';
import type { ApiTask, ApiTaskDetail } from './types';
import { inferTaskChecklistProgress } from './taskDetailView.utils';
import {
  buildTaskDetailActionPlan,
  buildTaskDetailCompletionSummary,
} from './taskDetailActions.utils';

function baseTask(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: 'Beschreibung',
    category: 'Maintenance',
    status: 'OPEN',
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
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [],
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
    reason: { title: task.title, description: task.description },
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
    assignment: { assignedUser: null, createdBy: null, responsibleRoleLabel: null },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.createdAt,
      dueDate: task.dueDate,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt,
      isActive: task.status !== 'DONE' && task.status !== 'CANCELLED',
      isOverdue: task.isOverdue,
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
    technicalMetadata: { source: task.source, dedupKey: task.dedupKey, metadata: task.metadata },
    availableActions: {
      start: { enabled: false },
      moveToWaiting: { enabled: false },
      resume: { enabled: false },
      complete: { enabled: false },
      cancel: { enabled: false },
      comment: { enabled: false },
      overrideCompletion: { enabled: false },
      ...overrides?.availableActions,
    },
  };
}

describe('buildTaskDetailActionPlan', () => {
  it('prioritizes Starten for OPEN tasks', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-open', title: 'Offen', type: 'CUSTOM', status: 'OPEN' }),
      {
        availableActions: {
          start: { enabled: true },
          moveToWaiting: { enabled: false },
          resume: { enabled: false },
          complete: { enabled: false },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: false },
        },
      },
    );
    const plan = buildTaskDetailActionPlan(detail);
    expect(plan.primary?.kind).toBe('start');
    expect(plan.primary?.label).toBe('Starten');
    expect(plan.secondaries.map((item) => item.kind)).toContain('comment');
    expect(plan.overflow.map((item) => item.kind)).toContain('cancel');
  });

  it('prioritizes Fortsetzen for WAITING tasks', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-wait', title: 'Wartend', type: 'CUSTOM', status: 'WAITING' }),
      {
        availableActions: {
          start: { enabled: false },
          resume: { enabled: true },
          moveToWaiting: { enabled: false },
          complete: { enabled: false },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: false },
        },
      },
    );
    const plan = buildTaskDetailActionPlan(detail);
    expect(plan.primary?.kind).toBe('resume');
    expect(plan.primary?.label).toBe('Fortsetzen');
  });

  it('prioritizes Erledigen and Warten for IN_PROGRESS tasks', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-ip', title: 'In Arbeit', type: 'CUSTOM', status: 'IN_PROGRESS' }),
      {
        availableActions: {
          start: { enabled: false },
          resume: { enabled: false },
          moveToWaiting: { enabled: true },
          complete: { enabled: true },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: false },
        },
      },
    );
    const plan = buildTaskDetailActionPlan(detail);
    expect(plan.primary?.kind).toBe('complete');
    expect(plan.secondaries.map((item) => item.kind)).toContain('moveToWaiting');
    expect(plan.overflow.map((item) => item.kind)).toContain('cancel');
  });

  it('enables Erledigen when manager override is available despite open checklist', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-override', title: 'Checkliste', type: 'CUSTOM', status: 'IN_PROGRESS' }),
      {
        availableActions: {
          start: { enabled: false },
          resume: { enabled: false },
          moveToWaiting: { enabled: true },
          complete: { enabled: false, disabledReason: 'Offene Pflichtpunkte in der Checkliste.' },
          cancel: { enabled: true },
          comment: { enabled: true },
          overrideCompletion: { enabled: true },
        },
      },
    );
    const plan = buildTaskDetailActionPlan(detail);
    expect(plan.primary?.kind).toBe('complete');
    expect(plan.primary?.enabled).toBe(true);
  });

  it('marks terminal tasks without workflow buttons', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-done', title: 'Fertig', type: 'CUSTOM', status: 'DONE' }),
      {
        summary: {
          id: 't-done',
          title: 'Fertig',
          type: 'CUSTOM',
          status: 'DONE',
          priority: 'NORMAL',
          sourceType: 'MANUAL',
          humanReadableSource: 'Manuell',
          completionMode: 'MANUAL',
        },
        availableActions: {
          start: { enabled: false },
          moveToWaiting: { enabled: false },
          resume: { enabled: false },
          complete: { enabled: false },
          cancel: { enabled: false },
          comment: { enabled: true },
          overrideCompletion: { enabled: false },
        },
      },
    );
    const plan = buildTaskDetailActionPlan(detail);
    expect(plan.isTerminal).toBe(true);
    expect(plan.primary).toBeNull();
  });
});

describe('buildTaskDetailCompletionSummary', () => {
  it('shows AUTO_RESOLVED reason', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-auto', title: 'Auto', type: 'CUSTOM', status: 'DONE' }),
      {
        summary: {
          id: 't-auto',
          title: 'Auto',
          type: 'CUSTOM',
          status: 'DONE',
          priority: 'NORMAL',
          sourceType: 'SYSTEM',
          humanReadableSource: 'System',
          completionMode: 'AUTO_RESOLVED',
        },
        completion: {
          completionMode: 'AUTO_RESOLVED',
          resolutionCode: null,
          resolutionNote: 'Buchung wurde storniert',
          completedBy: null,
          supersededByTaskId: null,
        },
      },
    );
    const summary = buildTaskDetailCompletionSummary(detail);
    expect(summary.isAutoResolved).toBe(true);
    expect(summary.autoResolvedReason).toContain('Buchung');
  });

  it('shows SUPERSEDED successor link metadata', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't-super', title: 'Alt', type: 'CUSTOM', status: 'DONE' }),
      {
        completion: {
          completionMode: 'SUPERSEDED',
          resolutionCode: null,
          resolutionNote: 'INVOICE_TASK_SUPERSEDED',
          completedBy: null,
          supersededByTaskId: 'successor-1',
        },
      },
    );
    const summary = buildTaskDetailCompletionSummary(detail);
    expect(summary.isSuperseded).toBe(true);
    expect(summary.supersededByTaskId).toBe('successor-1');
    expect(summary.supersededReason).toBeTruthy();
  });
});
