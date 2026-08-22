// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../i18n/locales';
import { TaskDetailCompleteDialog } from './components/TaskDetailCompleteDialog';
import { TaskDetailCompletionSummary } from './components/TaskDetailCompletionSummary';
import {
  taskDetailActionLabel,
  taskDetailToastCompleted,
} from './task-detail-actions-presentation-i18n';
import {
  buildCompleteTaskPayload,
  validateTaskCompleteForm,
} from './taskCompleteForm.utils';
import {
  buildTaskDetailActionPlan,
  buildTaskDetailCompletionSummary,
} from './taskDetailActions.utils';
import { buildTaskCompletionControlModel } from './taskDetailCompletion.utils';
import { inferTaskChecklistProgress } from './taskDetailView.utils';
import type { ApiTask, ApiTaskDetail } from './types';

const P216C2A_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailActions.utils.ts',
  'lib/tasks/taskDetailCompletion.utils.ts',
  'lib/tasks/taskCompleteForm.utils.ts',
  'lib/tasks/taskResolution.utils.ts',
  'lib/tasks/hooks/useTaskDetailActions.ts',
  'lib/tasks/components/TaskDetailActionBar.tsx',
  'lib/tasks/components/TaskDetailActionsHost.tsx',
  'lib/tasks/components/TaskDetailCompleteDialog.tsx',
  'lib/tasks/components/TaskDetailCompletionSummary.tsx',
];

function isP216C2AEnforceCleanPath(relPath: string): boolean {
  return P216C2A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function renderStaticWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

function baseTask(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'type'>): ApiTask {
  return {
    organizationId: 'org-1',
    description: 'Fixture description',
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
        title: 'Check tire pressure',
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
}

function normalizedDetail(
  task: ApiTask,
  overrides?: Partial<Pick<ApiTaskDetail, 'availableActions' | 'summary' | 'completion'>>,
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
      humanReadableSource: 'Manual',
      completionMode: null,
      ...overrides?.summary,
    },
    reason: { title: task.title, description: task.description },
    nextAction: {
      label: 'Complete',
      actionType: 'COMPLETE',
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
    technicalMetadata: { source: task.source, dedupKey: task.dedupKey, metadata: task.metadata },
    availableActions: {
      start: { enabled: false },
      moveToWaiting: { enabled: true },
      resume: { enabled: false },
      complete: { enabled: false, disabledReason: 'Open required items in checklist.' },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: true },
      ...overrides?.availableActions,
    },
  };
}

describe('P2.2.16C.2A task workflow core localization', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps P216C2A enforce-clean inventory at zero', () => {
    const debt = inventory.findings.filter((finding) => isP216C2AEnforceCleanPath(finding.file));
    expect(debt).toHaveLength(0);
  });

  describe('core action label matrix', () => {
    const kinds = ['start', 'resume', 'moveToWaiting', 'complete', 'comment', 'cancel'] as const;

    it.each(kinds)('localizes %s action label in EN and DE', (kind) => {
      expect(taskDetailActionLabel('en', kind)).not.toMatch(/Starten|Fortsetzen|Erledigen|Kommentar|Abbrechen/);
      expect(taskDetailActionLabel('de', kind)).toBeTruthy();
    });

    it('builds localized action plan without changing action kinds', () => {
      const detail = normalizedDetail(
        baseTask({
          id: 't-actions',
          title: 'Workflow task',
          type: 'CUSTOM',
          status: 'OPEN',
        }),
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

      const enPlan = buildTaskDetailActionPlan(detail, 'en');
      const dePlan = buildTaskDetailActionPlan(detail, 'de');

      expect(enPlan.primary?.kind).toBe('start');
      expect(dePlan.primary?.kind).toBe('start');
      expect(enPlan.primary?.label).toBe('Start');
      expect(dePlan.primary?.label).toBe('Starten');
    });
  });

  describe('buildChecklistBlockerLabel locale threading', () => {
    it('produces EN blocker summary in EN production completion path', () => {
      const detail = normalizedDetail(
        baseTask({ id: 't-blocker', title: 'Blocked', type: 'CUSTOM' }),
      );
      const enModel = buildTaskCompletionControlModel(detail, 'en');
      const deModel = buildTaskCompletionControlModel(detail, 'de');

      expect(enModel.openRequiredTitles).toEqual(['Check tire pressure']);
      expect(deModel.openRequiredTitles).toEqual(['Check tire pressure']);
      expect(enModel.blockerSummary).toContain('Check tire pressure');
      expect(enModel.blockerSummary).toMatch(/Required item open|required items open/i);
      expect(deModel.blockerSummary).toContain('Pflichtpunkt');
      expect(enModel.blockerSummary).not.toContain('Pflichtpunkt');
    });
  });

  describe('completion dialog presentation', () => {
    it('renders EN completion dialog copy', () => {
      const detail = normalizedDetail(
        baseTask({ id: 't-complete', title: 'Complete me', type: 'TIRE_CHECK' }),
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

      const view = renderWithLocale(
        'en',
        createElement(TaskDetailCompleteDialog, {
          open: true,
          onOpenChange: vi.fn(),
          detail,
          onSubmit: vi.fn().mockResolvedValue(undefined),
        }),
      );

      expect(document.body.textContent).toContain('Complete task');
      expect(document.body.textContent).toContain('Completion code');
      expect(document.body.textContent).not.toContain('Aufgabe abschließen');
      view.cleanup();
    });

    it('renders DE completion dialog copy', () => {
      const detail = normalizedDetail(
        baseTask({ id: 't-complete-de', title: 'Erledigen', type: 'TIRE_CHECK' }),
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

      const view = renderWithLocale(
        'de',
        createElement(TaskDetailCompleteDialog, {
          open: true,
          onOpenChange: vi.fn(),
          detail,
          onSubmit: vi.fn().mockResolvedValue(undefined),
        }),
      );

      expect(document.body.textContent).toContain('Aufgabe abschließen');
      expect(document.body.textContent).toContain('Abschluss-Code');
      view.cleanup();
    });
  });

  describe('completion flow semantics freeze', () => {
    it('preserves mutation payload and validation rules while localizing messages', () => {
      const detail = normalizedDetail(
        baseTask({ id: 'task-42', title: 'User task title stays raw', type: 'REPAIR' }),
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

      const form = {
        resolutionCode: 'REPAIR_COMPLETED',
        resolutionNote: 'Brake pads replaced by vendor',
        actualCostEuros: '199.00',
        overrideReason: '',
        useOverride: false,
      };

      const payload = buildCompleteTaskPayload(detail, form);
      expect(payload.resolutionCode).toBe('REPAIR_COMPLETED');
      expect(payload.resolutionNote).toBe('Brake pads replaced by vendor');
      expect(payload.actualCostCents).toBe(19900);
      expect(payload.overrideIncompleteChecklist).toBeUndefined();

      const enErrors = validateTaskCompleteForm(
        detail,
        { ...form, resolutionNote: '' },
        'en',
      );
      const deErrors = validateTaskCompleteForm(
        detail,
        { ...form, resolutionNote: '' },
        'de',
      );

      expect(enErrors.resolutionNote).toBeTruthy();
      expect(deErrors.resolutionNote).toBeTruthy();
      expect(enErrors.resolutionNote).not.toBe(deErrors.resolutionNote);
    });

    it('localizes success toast without changing task identity', () => {
      expect(taskDetailToastCompleted('en')).toBe('Task completed');
      expect(taskDetailToastCompleted('de')).toBe('Aufgabe erledigt');
    });
  });

  describe('completion summary presentation', () => {
    it('updates headline under runtime locale switch', () => {
      const detail = normalizedDetail(
        baseTask({ id: 't-done', title: 'Done task', type: 'CUSTOM', status: 'DONE' }),
        {
          summary: {
            id: 't-done',
            title: 'Done task',
            type: 'CUSTOM',
            status: 'DONE',
            priority: 'NORMAL',
            sourceType: 'MANUAL',
            humanReadableSource: 'Manual',
            completionMode: 'MANUAL',
          },
          completion: {
            completionMode: 'MANUAL',
            resolutionCode: 'OTHER',
            resolutionNote: 'User entered note stays raw',
            completedBy: { id: 'u1', displayName: 'Alex Operator' },
            supersededByTaskId: null,
          },
        },
      );

      const summary = buildTaskDetailCompletionSummary(detail, 'en', {
        formatDateTime: () => '22.08.2026, 10:00',
      });

      const enHtml = renderStaticWithLocale(
        'en',
        createElement(TaskDetailCompletionSummary, { summary }),
      );
      const deHtml = renderStaticWithLocale(
        'de',
        createElement(TaskDetailCompletionSummary, { summary }),
      );

      expect(enHtml).toContain('Task completed');
      expect(deHtml).toContain('Aufgabe abgeschlossen');
      expect(enHtml).toContain('User entered note stays raw');
      expect(deHtml).toContain('User entered note stays raw');
    });

    it('switches action labels when locale changes at runtime', () => {
      const detail = normalizedDetail(
        baseTask({ id: 't-runtime', title: 'Runtime', type: 'CUSTOM', status: 'OPEN' }),
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

      const enView = renderWithLocale(
        'en',
        createElement('div', {
          'data-testid': 'plan-label',
          children: buildTaskDetailActionPlan(detail, 'en').primary?.label,
        }),
      );
      expect(enView.container.textContent).toBe('Start');
      enView.cleanup();

      const deView = renderWithLocale(
        'de',
        createElement('div', {
          'data-testid': 'plan-label',
          children: buildTaskDetailActionPlan(detail, 'de').primary?.label,
        }),
      );
      expect(deView.container.textContent).toBe('Starten');
      deView.cleanup();
    });
  });
});
