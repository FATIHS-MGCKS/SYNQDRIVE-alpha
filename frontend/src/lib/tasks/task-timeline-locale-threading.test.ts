// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../i18n/locales';
import { en } from '../../i18n/translations/en';
import { buildTaskDetailViewModel } from './taskDetailView.utils';
import { buildTaskTimelineItems } from './taskTimeline.utils';
import type { ApiTaskDetail, NormalizedTaskTimelineEvent } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P216B2_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
  'rental/components/tasks/GlobalTaskDetailPanel.tsx',
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
];

function isP216B2EnforceCleanPath(relPath: string): boolean {
  return P216B2_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function timelineEvent(
  partial: Partial<NormalizedTaskTimelineEvent> & Pick<NormalizedTaskTimelineEvent, 'id' | 'type'>,
): NormalizedTaskTimelineEvent {
  return {
    label: partial.type,
    actor: null,
    actorUserId: null,
    oldValue: null,
    newValue: null,
    metadata: null,
    createdAt: '2026-07-15T10:30:00.000Z',
    ...partial,
  };
}

function taskDetailWithTimeline(events: NormalizedTaskTimelineEvent[]): ApiTaskDetail {
  return {
    id: 'task-locale-1',
    organizationId: 'org-1',
    title: 'Locale threading fixture',
    description: 'Fixture task for timeline locale tests.',
    category: 'Maintenance',
    type: 'TIRE_CHECK',
    status: 'DONE',
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
    assignedUserId: 'user-1',
    assignedUserName: 'Fatih Sero',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: '2026-07-15T14:00:00.000Z',
    startedAt: null,
    completedAt: '2026-07-15T11:00:00.000Z',
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-15T11:00:00.000Z',
    checklist: [],
    comments: [],
    linkedObjects: [],
    summary: {
      id: 'task-locale-1',
      title: 'Locale threading fixture',
      type: 'TIRE_CHECK',
      status: 'DONE',
      priority: 'HIGH',
      sourceType: 'MANUAL',
      humanReadableSource: 'Manual',
      completionMode: 'MANUAL',
    },
    reason: {
      title: 'Tire check',
      description: 'Fixture',
      detectedAt: '2026-07-14T08:00:00.000Z',
      basis: null,
    },
    nextAction: {
      label: 'None',
      description: null,
      actionType: 'NONE',
      targetType: 'TASK',
      targetId: 'task-locale-1',
      enabled: false,
      disabledReason: null,
    },
    checklistProgress: {
      totalItems: 0,
      completedItems: 0,
      requiredItems: 0,
      completedRequiredItems: 0,
      remainingRequiredItems: 0,
      progressPercent: null,
      hasChecklist: false,
      areRequiredItemsComplete: true,
      canCompleteByChecklist: true,
      completionBlockers: [],
    },
    assignment: {
      assignedUser: { id: 'user-1', displayName: 'Fatih Sero' },
      createdBy: { id: 'user-1', displayName: 'Fatih Sero' },
      responsibleRoleLabel: null,
    },
    timing: {
      createdAt: '2026-07-14T08:00:00.000Z',
      activatesAt: '2026-07-14T08:00:00.000Z',
      dueDate: '2026-07-15T14:00:00.000Z',
      startedAt: null,
      completedAt: '2026-07-15T11:00:00.000Z',
      cancelledAt: null,
      isActive: false,
      isOverdue: false,
      bucket: 'TODAY',
    },
    completion: {
      completionMode: 'MANUAL',
      resolutionCode: null,
      resolutionNote: null,
      completedBy: { id: 'user-1', displayName: 'Fatih Sero' },
      supersededByTaskId: null,
    },
    timeline: events,
    technicalMetadata: {
      source: 'MANUAL',
      dedupKey: null,
      metadata: null,
    },
    availableActions: {
      start: { enabled: false },
      moveToWaiting: { enabled: false },
      resume: { enabled: false },
      complete: { enabled: false },
      cancel: { enabled: false },
      comment: { enabled: false },
      overrideCompletion: { enabled: false },
    },
  };
}

const representativeEvents = [
  timelineEvent({
    id: 'e-done',
    type: 'STATUS_CHANGED',
    newValue: 'DONE',
    actorUserId: 'user-1',
    actor: { id: 'user-1', displayName: 'Fatih Sero' },
    metadata: { resolutionKind: 'MANUAL' },
  }),
];

function LocaleSwitchHarness({ task }: { task: ApiTaskDetail }) {
  const { locale, setLocale } = useLanguage();
  const model = buildTaskDetailViewModel(task, { locale });
  return createElement(
    'div',
    null,
    createElement('span', {
      'data-locale-probe': 'true',
      'data-title': model.timeline[0]?.title ?? '',
      'data-locale': locale,
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

describe('task timeline locale threading (P2.2.16B.2)', () => {
  it('renders German timeline copy through buildTaskDetailViewModel when locale is de', () => {
    const model = buildTaskDetailViewModel(taskDetailWithTimeline(representativeEvents), {
      locale: 'de',
    });
    expect(model.timeline[0]?.title).toBe('Von Fatih Sero als erledigt markiert');
    expect(model.timeline[0]?.title).not.toContain('marked as complete');
  });

  it('renders English timeline copy through buildTaskDetailViewModel when locale is en', () => {
    const model = buildTaskDetailViewModel(taskDetailWithTimeline(representativeEvents), {
      locale: 'en',
    });
    expect(model.timeline[0]?.title).toBe(
      en['tasks.timeline.event.statusDone.user'].replace('{actor}', 'Fatih Sero'),
    );
    expect(model.timeline[0]?.title).not.toContain('als erledigt markiert');
  });

  it('formats timeline timestamps with locale-aware presentation', () => {
    const deItems = buildTaskTimelineItems(representativeEvents, { locale: 'de' });
    const enItems = buildTaskTimelineItems(representativeEvents, { locale: 'en' });
    expect(deItems[0]?.time).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(enItems[0]?.time).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(deItems[0]?.time).not.toBe(enItems[0]?.time);
  });

  it('preserves machine event ids and ordering while switching locale', () => {
    const events = [
      timelineEvent({ id: 'older', type: 'CREATED', createdAt: '2026-07-14T08:00:00.000Z' }),
      timelineEvent({
        id: 'newer',
        type: 'COMMENT_ADDED',
        createdAt: '2026-07-15T12:00:00.000Z',
        actor: { id: 'user-1', displayName: 'Fatih Sero' },
        actorUserId: 'user-1',
        metadata: { bodyPreview: 'Free-text comment' },
      }),
    ];
    const deModel = buildTaskDetailViewModel(taskDetailWithTimeline(events), { locale: 'de' });
    const enModel = buildTaskDetailViewModel(taskDetailWithTimeline(events), { locale: 'en' });
    expect(deModel.timeline.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(enModel.timeline.map((item) => item.id)).toEqual(['newer', 'older']);
    expect(deModel.timeline[0]?.description).toBe('Free-text comment');
    expect(enModel.timeline[0]?.description).toBe('Free-text comment');
  });

  it('does not contain TASK_TIMELINE_BRIDGE_LOCALE in production timeline utils', () => {
    const utilsSource = readFileSync(join(__dirname, 'taskTimeline.utils.ts'), 'utf8');
    expect(utilsSource).not.toContain('TASK_TIMELINE_BRIDGE_LOCALE');
  });

  it('threads locale through production host sources', () => {
    for (const relPath of [
      'rental/components/tasks/GlobalTaskDetailPanel.tsx',
      'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
      'operator/tasks/OperatorTaskDetail.tsx',
    ]) {
      const source = readFileSync(join(__dirname, '../../', relPath), 'utf8');
      expect(source).toContain('useLanguage');
      expect(source).toContain('locale');
      expect(source).toContain('buildTaskDetailViewModel');
    }
  });

  it('reports zero P216B2 scoped findings in inventory', () => {
    const findings = inventory.findings.filter((finding) => isP216B2EnforceCleanPath(finding.file));
    expect(findings).toHaveLength(0);
  });
});

describe('task timeline locale threading integration (P2.2.16B.2)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it('updates rendered timeline title when locale switches de → en', () => {
    const task = taskDetailWithTimeline(representativeEvents);

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(LocaleSwitchHarness, { task }),
        ),
      );
    });

    const probe = container.querySelector('[data-locale-probe]') as HTMLSpanElement;
    expect(probe.dataset.title).toBe('Von Fatih Sero als erledigt markiert');
    expect(probe.dataset.locale).toBe('de');

    const switchButton = container.querySelector('[data-switch-locale]') as HTMLButtonElement;
    act(() => {
      switchButton.click();
    });

    expect(probe.dataset.locale).toBe('en');
    expect(probe.dataset.title).toBe(
      en['tasks.timeline.event.statusDone.user'].replace('{actor}', 'Fatih Sero'),
    );
    expect(probe.dataset.title).not.toContain('als erledigt markiert');
  });
});
