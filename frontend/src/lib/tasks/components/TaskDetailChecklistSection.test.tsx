import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TaskDetailChecklistModel } from '../taskDetailChecklist.utils';
import { TaskDetailChecklistSection } from './TaskDetailChecklistSection';

function checklistFixture(
  overrides?: Partial<TaskDetailChecklistModel>,
): TaskDetailChecklistModel {
  return {
    mode: 'editable',
    progress: {
      totalItems: 4,
      completedItems: 2,
      requiredItems: 2,
      completedRequiredItems: 1,
      remainingRequiredItems: 1,
      progressPercent: 50,
      hasChecklist: true,
      areRequiredItemsComplete: false,
      canCompleteByChecklist: false,
      completionBlockers: ['REQUIRED_CHECKLIST_ITEMS_OPEN'],
    },
    items: [
      {
        id: 'required-open',
        title: 'Pflicht offen',
        description: 'Pflichtbeschreibung',
        hasDescription: true,
        isDone: false,
        isRequired: true,
        sortOrder: 1,
      },
      {
        id: 'optional-open',
        title: 'Optional offen',
        description: null,
        hasDescription: false,
        isDone: false,
        isRequired: false,
        sortOrder: 2,
      },
    ],
    progressLabel: '2 von 4 erledigt',
    progressPercent: 50,
    blocked: true,
    blockerLabel: 'Pflichtpunkt offen: Pflicht offen',
    openRequiredTitles: ['Pflicht offen'],
    legacyClosedHint: null,
    canEditItems: true,
    showAsInteractive: true,
    completeAction: { enabled: false, disabledReason: 'Offene Pflichtpunkte in der Checkliste.' },
    overrideCompletion: { enabled: true },
    ...overrides,
  };
}

describe('TaskDetailChecklistSection', () => {
  it('renders progress, required/optional labels and expandable descriptions', () => {
    const html = renderToStaticMarkup(
      <TaskDetailChecklistSection
        checklist={checklistFixture()}
        onToggle={vi.fn()}
        onRequestOverride={vi.fn()}
      />,
    );

    expect(html).toContain('Checkliste');
    expect(html).toContain('2 von 4 erledigt');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('Pflicht');
    expect(html).toContain('Optional');
    expect(html).toContain('Beschreibung anzeigen');
    expect(html).toContain('Pflichtpunkt offen: Pflicht offen');
    expect(html).toContain('Trotzdem abschließen (Manager)');
    expect(html).toContain('for="task-checklist-item-required-open"');
  });

  it('renders documentation mode without interactive checkboxes', () => {
    const html = renderToStaticMarkup(
      <TaskDetailChecklistSection
        checklist={checklistFixture({
          mode: 'documentationOnly',
          canEditItems: false,
          showAsInteractive: false,
          blocked: false,
          blockerLabel: null,
          legacyClosedHint:
            'Diese Aufgabe wurde nach älterer Logik geschlossen; die Checkliste ist nur zur Dokumentation sichtbar.',
        })}
        mobile
      />,
    );

    expect(html).toContain('data-checklist-mode="documentationOnly"');
    expect(html).toContain('älterer Logik');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('min-h-[44px]');
  });

  it('renders read-only DONE checklist without active controls', () => {
    const html = renderToStaticMarkup(
      <TaskDetailChecklistSection
        checklist={checklistFixture({
          mode: 'readOnly',
          canEditItems: false,
          showAsInteractive: false,
          blocked: false,
          blockerLabel: null,
          overrideCompletion: { enabled: false },
        })}
      />,
    );

    expect(html).toContain('data-checklist-mode="readOnly"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Trotzdem abschließen');
  });
});
