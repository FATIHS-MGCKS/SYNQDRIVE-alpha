import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TasksPageViews } from './TasksPageViews';

describe('TasksPageViews', () => {
  it('renders canonical bucket tabs with counts', () => {
    const html = renderToStaticMarkup(
      <TasksPageViews
        activeView="today"
        onViewChange={vi.fn()}
        canViewUnassigned={false}
        counts={{ today: 4, open: 12 }}
      />,
    );

    expect(html).toContain('data-testid="tasks-page-views"');
    expect(html).toContain('Meine Aufgaben');
    expect(html).toContain('Heute');
    expect(html).toContain('Erledigt');
    expect(html).not.toContain('Unzugewiesen');
    expect(html).toContain('data-view="today"');
  });

  it('shows unassigned tab when permitted', () => {
    const html = renderToStaticMarkup(
      <TasksPageViews
        activeView="open"
        onViewChange={vi.fn()}
        canViewUnassigned
        counts={{ unassigned: 2 }}
      />,
    );

    expect(html).toContain('Unzugewiesen');
  });
});
