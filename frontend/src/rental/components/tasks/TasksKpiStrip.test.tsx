// @vitest-environment happy-dom
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { translateKey } from '../../../i18n/LanguageContext';
import type { TasksPageKpiItem } from '../../lib/tasks-page.utils';
import { TasksKpiStrip } from './TasksKpiStrip';

const items: TasksPageKpiItem[] = [
  { id: 'overdue', labelKey: 'tasks.view.overdue', value: 2, view: 'overdue', tone: 'critical' },
  { id: 'today', labelKey: 'tasks.view.today', value: 5, view: 'today', tone: 'watch' },
  { id: 'mine', labelKey: 'tasks.kpi.mineOpen', value: 3, view: 'mine', tone: 'info' },
];

function renderDe(ui: React.ReactElement) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

describe('TasksKpiStrip', () => {
  it('renders compact KPI buttons for desktop and mobile grids', () => {
    const html = renderDe(
      <TasksKpiStrip items={items} activeView="today" onSelectView={vi.fn()} />,
    );

    expect(html).toContain('data-testid="tasks-kpi-strip"');
    expect(html).toContain('grid-cols-2');
    expect(html).toContain(translateKey('de', 'tasks.view.overdue').text);
    expect(html).toContain('aria-pressed="true"');
  });
});
