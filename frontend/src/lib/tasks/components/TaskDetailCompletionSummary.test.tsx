// @vitest-environment happy-dom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { TaskDetailCompletionSummary } from './TaskDetailCompletionSummary';

function renderStaticWithLocale(locale: 'de' | 'en', ui: React.ReactNode) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

describe('TaskDetailCompletionSummary', () => {
  it('renders AUTO_RESOLVED reason', () => {
    const html = renderStaticWithLocale(
      'de',
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
    const html = renderStaticWithLocale(
      'de',
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
