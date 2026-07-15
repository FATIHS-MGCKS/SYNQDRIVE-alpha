import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskDetailCompletionSummary } from './TaskDetailCompletionSummary';

describe('TaskDetailCompletionSummary', () => {
  it('renders AUTO_RESOLVED reason', () => {
    const html = renderToStaticMarkup(
      <TaskDetailCompletionSummary
        summary={{
          status: 'DONE',
          statusLabel: 'Erledigt',
          completionMode: 'AUTO_RESOLVED',
          completedAtLabel: '15.07.2026, 14:00',
          completedByLabel: null,
          resolutionNote: null,
          resolutionCodeLabel: 'Buchung wurde storniert',
          autoResolvedReason: 'Buchung wurde storniert',
          supersededByTaskId: null,
          supersededReason: null,
          isAutoResolved: true,
          isSuperseded: false,
          isCancelled: false,
        }}
      />,
    );

    expect(html).toContain('Automatisch aufgelöst');
    expect(html).toContain('Buchung wurde storniert');
  });

  it('renders successor task link for SUPERSEDED', () => {
    const html = renderToStaticMarkup(
      <TaskDetailCompletionSummary
        mobile
        onOpenSuccessorTask={vi.fn()}
        summary={{
          status: 'DONE',
          statusLabel: 'Erledigt',
          completionMode: 'SUPERSEDED',
          completedAtLabel: '15.07.2026, 14:00',
          completedByLabel: null,
          resolutionNote: null,
          resolutionCodeLabel: null,
          autoResolvedReason: null,
          supersededByTaskId: 'next-task-id',
          supersededReason: 'Durch Nachfolge-Aufgabe ersetzt',
          isAutoResolved: false,
          isSuperseded: true,
          isCancelled: false,
        }}
      />,
    );

    expect(html).toContain('Automatisch beendet');
    expect(html).toContain('Ersatz-Aufgabe öffnen');
    expect(html).toContain('Durch Nachfolge-Aufgabe ersetzt');
  });
});
