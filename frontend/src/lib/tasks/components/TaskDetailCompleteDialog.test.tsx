import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiTask, ApiTaskDetail } from '../types';
import { inferTaskChecklistProgress } from '../taskDetailView.utils';
import { TaskDetailCompleteDialog } from './TaskDetailCompleteDialog';

vi.mock('../../../components/patterns/app-dialog', () => ({
  AppDialog: ({ children }: { children: React.ReactNode }) => <div data-testid="app-dialog">{children}</div>,
}));

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
    },
  };
}

describe('TaskDetailCompleteDialog', () => {
  it('shows open required checklist items, resolution code and manager override', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't1', title: 'Reifen', type: 'TIRE_CHECK', status: 'IN_PROGRESS' }),
    );
    const html = renderToStaticMarkup(
      <TaskDetailCompleteDialog
        open
        onOpenChange={vi.fn()}
        detail={detail}
        submitError={null}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain('Offene Pflichtpunkte');
    expect(html).toContain('Pflicht offen');
    expect(html).toContain('Abschluss-Code');
    expect(html).toContain('Tatsächliche Kosten');
    expect(html).toContain('Trotz offener Pflichtpunkte abschließen');
  });

  it('shows API submit error without closing', () => {
    const detail = normalizedDetail(
      baseTask({ id: 't2', title: 'Custom', type: 'CUSTOM', status: 'IN_PROGRESS' }),
    );
    const html = renderToStaticMarkup(
      <TaskDetailCompleteDialog
        open
        onOpenChange={vi.fn()}
        detail={detail}
        submitError="Checkliste unvollständig (API)"
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain('Checkliste unvollständig (API)');
    expect(html).toContain('role="alert"');
  });
});
