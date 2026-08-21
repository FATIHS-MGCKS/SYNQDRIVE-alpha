// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import type { TaskDetailViewModel } from '../taskDetailView.utils';
import { TaskDetailNotesActivitySection } from './TaskDetailNotesActivitySection';

function modelFixture(overrides?: Partial<TaskDetailViewModel>): TaskDetailViewModel {
  return {
    taskId: 'task-1',
    header: {
      title: 'Test',
      eyebrow: null,
      subtitle: null,
      status: 'OPEN',
      statusLabel: 'Offen',
      statusTone: 'info',
      priority: 'NORMAL',
      priorityLabel: 'Normal',
      showPriority: false,
      timingLabel: null,
      timingWarn: false,
      category: null,
    },
    reason: {
      headline: 'Test',
      description: 'Beschreibung',
      basis: null,
      detectedAtLabel: null,
      humanReadableSource: 'Manuell',
    },
    nextStep: null,
    checklist: null,
    linkedObjects: [],
    comments: [
      {
        id: 'c1',
        body: 'Bitte Führerschein nachreichen.',
        authorLabel: 'Sam Station',
        createdAt: '2026-07-15T09:00:00.000Z',
        createdAtLabel: '15.07.2026, 09:00',
      },
    ],
    timeline: [
      {
        id: 't1',
        title: 'Von Fatih Sero als erledigt markiert',
        time: '15.07.2026, 10:00',
      },
    ],
    attachments: [],
    resolutionNote: null,
    technical: { rows: [], metadata: null },
    flags: {
      isTerminal: false,
      isActive: true,
      isOverdue: false,
      blocksVehicleAvailability: false,
      canAddComment: true,
    },
    ...overrides,
  };
}

function renderSection(props: React.ComponentProps<typeof TaskDetailNotesActivitySection>) {
  return renderToStaticMarkup(
    createElement(LanguageProvider, null, createElement(TaskDetailNotesActivitySection, props)),
  );
}

describe('TaskDetailNotesActivitySection', () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  });

  it('renders mobile tabs for notes and activity', () => {
    const html = renderSection({
      model: modelFixture(),
      mobile: true,
      commentDraft: '',
      onCommentDraftChange: vi.fn(),
      onAddComment: vi.fn(),
    });

    expect(html).toContain('role="tablist"');
    expect(html).toContain('Notizen');
    expect(html).toContain('Aktivität');
    expect(html).toContain('Bitte Führerschein nachreichen.');
    expect(html).not.toContain('min-h-[88px]');
  });

  it('renders desktop split layout with both panels', () => {
    const html = renderSection({ model: modelFixture(), mobile: false });

    expect(html).toContain('md:grid-cols-2');
    expect(html).toContain('data-panel="notes"');
    expect(html).toContain('data-panel="activity"');
    expect(html).toContain('Von Fatih Sero als erledigt markiert');
  });

  it('shows compact comment form without oversized empty container', () => {
    const html = renderSection({
      model: modelFixture({ comments: [] }),
      mobile: true,
      commentDraft: '',
      onCommentDraftChange: vi.fn(),
      onAddComment: vi.fn(),
    });

    expect(html).toContain('min-h-[72px]');
    expect(html).toContain('Notiz speichern');
  });
});
