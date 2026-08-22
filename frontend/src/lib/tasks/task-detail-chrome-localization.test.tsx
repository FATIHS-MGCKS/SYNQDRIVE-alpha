// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../i18n/locales';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { TaskDetailBody } from './components/TaskDetailBody';
import { TaskDetailShell } from './components/TaskDetailShell';
import {
  buildTaskDetailViewModel,
  inferTaskChecklistProgress,
} from './taskDetailView.utils';
import {
  formatChecklistProgressLabel,
} from './taskDetailChecklist.utils';
import {
  taskDetailLinkedObjectTypeLabel,
  taskDetailStatusLabel,
  taskDetailTypeLabel,
  formatTaskDetailDateTime,
} from './task-detail-presentation-i18n';
import type { ApiTask, ApiTaskDetail } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P216C1_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskDetailChecklist.utils.ts',
  'lib/tasks/components/TaskDetailBody.tsx',
  'lib/tasks/components/TaskDetailShell.tsx',
  'lib/tasks/components/TaskDetailNotesActivitySection.tsx',
  'lib/tasks/components/TaskDetailChecklistSection.tsx',
  'rental/lib/task-detail.utils.ts',
  'operator/components/OperatorTaskSheet.tsx',
];

function isP216C1EnforceCleanPath(relPath: string): boolean {
  return P216C1_ENFORCE_CLEAN_EXACT.includes(relPath);
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
    description: 'Fixture description for task detail chrome tests.',
    category: 'Maintenance',
    status: 'OPEN',
    priority: 'HIGH',
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
    assignedUserName: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: true,
    metadata: null,
    isOverdue: true,
    dueDate: '2026-07-15T14:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [],
    comments: [],
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
      humanReadableSource: 'Manual entry',
      completionMode: null,
    },
    reason: {
      title: 'Tire check required',
      description: task.description,
      detectedAt: '2026-07-14T08:00:00.000Z',
      basis: null,
    },
    nextAction: {
      label: 'Start task',
      description: null,
      actionType: 'START',
      targetType: 'TASK',
      targetId: task.id,
      enabled: true,
      disabledReason: null,
    },
    linkedObjects: task.linkedObjects ?? [],
    checklistProgress: inferTaskChecklistProgress(task),
    assignment: {
      assignedUser: null,
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
        id: 'evt-1',
        type: 'STATUS_CHANGED',
        label: 'STATUS_CHANGED',
        actor: { id: 'user-1', displayName: 'Alex Operator' },
        actorUserId: 'user-1',
        oldValue: 'OPEN',
        newValue: 'IN_PROGRESS',
        metadata: null,
        createdAt: '2026-07-15T10:30:00.000Z',
      },
    ],
    technicalMetadata: {
      source: task.source,
      dedupKey: null,
      metadata: null,
    },
    availableActions: {
      start: { enabled: true },
      moveToWaiting: { enabled: false },
      resume: { enabled: false },
      complete: { enabled: false },
      cancel: { enabled: true },
      comment: { enabled: true },
      overrideCompletion: { enabled: false },
    },
  };
}

function LocaleSwitchHarness({ task }: { task: ApiTaskDetail }) {
  const { locale, setLocale, t } = useLanguage();
  const model = buildTaskDetailViewModel(task, { locale });
  return createElement(
    'div',
    null,
    createElement('span', {
      'data-locale-probe': 'true',
      'data-section-reason': t('tasks.detail.section.reason'),
      'data-status': model.header.statusLabel,
      'data-locale': locale,
      'data-task-id': model.taskId,
    }),
    createElement(
      'button',
      {
        type: 'button',
        'data-switch-locale': 'true',
        onClick: () => setLocale(locale === 'de' ? 'en' : 'de'),
      },
      'switch',
    ),
  );
}

describe('task detail chrome localization (P2.2.16C.1)', () => {
  const task = normalizedDetail(
    baseTask({ id: 'task-chrome-1', title: 'Annual inspection', type: 'VEHICLE_INSPECTION' }),
  );

  it('maps view-model presentation labels in EN', () => {
    const model = buildTaskDetailViewModel(task, { locale: 'en' });
    expect(model.header.statusLabel).toBe(en['tasks.filter.status.OPEN']);
    expect(model.linkedObjects[0]?.typeLabel).toBe(en['tasks.detail.linked.VEHICLE']);
    expect(model.technical.rows.find((row) => row.label === en['tasks.detail.technical.type'])?.value).toBe(
      en['tasks.type.VEHICLE_INSPECTION'],
    );
    expect(model.reason.humanReadableSource).toBe('Manual entry');
    expect(model.taskId).toBe('task-chrome-1');
  });

  it('maps view-model presentation labels in DE', () => {
    const model = buildTaskDetailViewModel(task, { locale: 'de' });
    expect(model.header.statusLabel).toBe(de['tasks.filter.status.OPEN']);
    expect(model.linkedObjects[0]?.typeLabel).toBe(de['tasks.detail.linked.VEHICLE']);
    expect(model.technical.rows.find((row) => row.label === de['tasks.detail.technical.type'])?.value).toBe(
      de['tasks.type.VEHICLE_INSPECTION'],
    );
  });

  it('renders TaskDetailBody chrome in EN without German leakage', () => {
    const model = buildTaskDetailViewModel(task, { locale: 'en' });
    const html = renderStaticWithLocale(
      'en',
      createElement(TaskDetailBody, { model, density: 'desktop', hideHeader: true }),
    );
    expect(html).toContain(en['tasks.detail.section.reason']);
    expect(html).toContain(en['tasks.detail.section.linkedObjects']);
    expect(html).not.toContain('Verknüpfte Objekte');
    expect(html).not.toContain('Warum wurde diese Aufgabe erstellt?');
    expect(html).toContain('M-AB 1234');
    expect(html).toContain('Manual entry');
  });

  it('renders TaskDetailBody chrome in DE without English canonical leakage', () => {
    const model = buildTaskDetailViewModel(task, { locale: 'de' });
    const html = renderStaticWithLocale(
      'de',
      createElement(TaskDetailBody, { model, density: 'desktop', hideHeader: true }),
    );
    expect(html).toContain(de['tasks.detail.section.reason']);
    expect(html).toContain(de['tasks.detail.section.linkedObjects']);
    expect(html).not.toContain('Linked objects');
    expect(html).not.toContain('Why was this task created?');
  });

  it('renders TaskDetailShell inline variant with localized chrome', () => {
    const model = buildTaskDetailViewModel(task, { locale: 'en' });
    const html = renderStaticWithLocale(
      'en',
      createElement(TaskDetailShell, {
        variant: 'inline',
        model,
      }),
    );
    expect(html).toContain(en['tasks.detail.section.reason']);
    expect(html).toContain('data-testid="task-detail-shell-inline"');
  });

  it('switches Task Detail chrome locale on mounted consumer', () => {
    const { container, cleanup } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, { task }),
    );
    const probe = () => container.querySelector('[data-locale-probe]');
    expect(probe()?.getAttribute('data-section-reason')).toBe(de['tasks.detail.section.reason']);
    expect(probe()?.getAttribute('data-status')).toBe(de['tasks.filter.status.OPEN']);
    expect(probe()?.getAttribute('data-task-id')).toBe('task-chrome-1');

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-switch-locale]')?.click();
    });
    expect(probe()?.getAttribute('data-locale')).toBe('en');
    expect(probe()?.getAttribute('data-section-reason')).toBe(en['tasks.detail.section.reason']);
    expect(probe()?.getAttribute('data-status')).toBe(en['tasks.filter.status.OPEN']);
    expect(probe()?.getAttribute('data-task-id')).toBe('task-chrome-1');

    cleanup();
  });

  it('keeps timeline locale threading intact through buildTaskDetailViewModel', () => {
    const deModel = buildTaskDetailViewModel(task, { locale: 'de' });
    const enModel = buildTaskDetailViewModel(task, { locale: 'en' });
    expect(deModel.timeline[0]?.title).toContain('Alex Operator');
    expect(enModel.timeline[0]?.title).toContain('Alex Operator');
    expect(deModel.timeline[0]?.title).not.toBe(enModel.timeline[0]?.title);
  });

  it('formats due-date presentation with locale-aware datetime', () => {
    const deFormatted = formatTaskDetailDateTime('de', '2026-07-15T14:00:00.000Z');
    const enFormatted = formatTaskDetailDateTime('en', '2026-07-15T14:00:00.000Z');
    expect(deFormatted).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(enFormatted).toMatch(/\d{2}\/\d{2}\/\d{4}|\d{2}\.\d{2}\.\d{4}/);
    expect(deFormatted).not.toBe(enFormatted);
  });

  it('exposes presentation adapter helpers without machine value mutation', () => {
    expect(taskDetailStatusLabel('en', 'OPEN')).toBe(en['tasks.filter.status.OPEN']);
    expect(taskDetailLinkedObjectTypeLabel('de', 'VEHICLE')).toBe(de['tasks.detail.linked.VEHICLE']);
    expect(
      taskDetailTypeLabel('en', { type: 'TIRE_CHECK', metadata: null, category: 'Maintenance' }),
    ).toBe(en['tasks.type.TIRE_CHECK']);
    expect(formatChecklistProgressLabel('de', inferTaskChecklistProgress(task))).toContain('von');
    expect(formatChecklistProgressLabel('en', inferTaskChecklistProgress(task))).toContain('of');
  });

  it('reports zero P216C1 scoped findings in inventory', () => {
    const findings = inventory.findings.filter((finding) => isP216C1EnforceCleanPath(finding.file));
    expect(findings).toHaveLength(0);
  });

  it('keeps task-detail-presentation-i18n adapter on translation keys only', () => {
    const source = readFileSync(join(__dirname, 'task-detail-presentation-i18n.ts'), 'utf8');
    expect(source).toContain('tasks.detail.linked.VEHICLE');
    expect(source).not.toMatch(/Verknüpfte Objekte/);
    expect(source).not.toMatch(/de-DE/);
  });
});
