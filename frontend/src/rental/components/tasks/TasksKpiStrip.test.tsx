import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TasksKpiStrip } from './TasksKpiStrip';
import type { TasksPageKpiItem } from '../../lib/tasks-page.utils';

const items: TasksPageKpiItem[] = [
  { id: 'overdue', label: 'Überfällig', value: 2, view: 'overdue', tone: 'critical' },
  { id: 'today', label: 'Heute', value: 5, view: 'today', tone: 'watch' },
  { id: 'mine', label: 'Meine offenen', value: 3, view: 'mine', tone: 'info' },
];

describe('TasksKpiStrip', () => {
  it('renders compact KPI buttons for desktop and mobile grids', () => {
    const html = renderToStaticMarkup(
      <TasksKpiStrip items={items} activeView="today" onSelectView={vi.fn()} />,
    );

    expect(html).toContain('data-testid="tasks-kpi-strip"');
    expect(html).toContain('grid-cols-2');
    expect(html).toContain('Überfällig');
    expect(html).toContain('aria-pressed="true"');
  });
});
