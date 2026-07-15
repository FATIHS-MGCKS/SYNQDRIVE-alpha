/**
 * Task Domain V2 — Bulk actions bar (area 1)
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TasksBulkActionBar } from './TasksBulkActionBar';

describe('TasksBulkActionBar', () => {
  it('renders selection count and bulk actions when tasks are selected', () => {
    const html = renderToStaticMarkup(
      <TasksBulkActionBar
        orgId="org-1"
        selectedTaskIds={['t1', 't2']}
        canWriteTasks
        assigneeOptions={[{ value: 'u1', label: 'Alex' }]}
        onClearSelection={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="tasks-bulk-action-bar"');
    expect(html).toContain('2');
    expect(html).toContain('Aufgaben ausgewählt');
    expect(html).toContain('Zuweisen');
    expect(html).toContain('Priorität');
    expect(html).toContain('Fälligkeit');
    expect(html).toContain('Wartend');
    expect(html).toContain('Abbrechen');
  });

  it('renders nothing without write permission or selection', () => {
    const html = renderToStaticMarkup(
      <TasksBulkActionBar
        orgId="org-1"
        selectedTaskIds={[]}
        canWriteTasks={false}
        assigneeOptions={[]}
        onClearSelection={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    expect(html).toBe('');
  });
});
