// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider, translateKey } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { de } from '../../../i18n/translations/de';
import { TasksPageViews } from './TasksPageViews';

function renderDe(ui: ReactElement) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

describe('TasksPageViews', () => {
  it('renders canonical bucket tabs with counts', () => {
    const html = renderDe(
      <TasksPageViews
        activeView="today"
        onViewChange={vi.fn()}
        canViewUnassigned={false}
        counts={{ today: 4, open: 12 }}
      />,
    );

    expect(html).toContain('data-testid="tasks-page-views"');
    expect(html).toContain(translateKey('de', 'tasks.view.mine').text);
    expect(html).toContain(translateKey('de', 'tasks.view.today').text);
    expect(html).toContain(translateKey('de', 'tasks.view.completed').text);
    expect(html).not.toContain(de['tasks.view.unassigned']);
    expect(html).toContain('data-view="today"');
  });

  it('shows unassigned tab when permitted', () => {
    const html = renderDe(
      <TasksPageViews
        activeView="open"
        onViewChange={vi.fn()}
        canViewUnassigned
        counts={{ unassigned: 2 }}
      />,
    );

    expect(html).toContain(de['tasks.view.unassigned']);
  });
});
