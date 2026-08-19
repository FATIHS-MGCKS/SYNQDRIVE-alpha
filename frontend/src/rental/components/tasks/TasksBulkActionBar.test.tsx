/**
 * Task Domain V2 — Bulk actions bar (area 1)
 */
// @vitest-environment happy-dom
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider, translateKey } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { TasksBulkActionBar } from './TasksBulkActionBar';

function renderDe(ui: React.ReactElement) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

describe('TasksBulkActionBar', () => {
  it('renders selection count and bulk actions when tasks are selected', () => {
    const html = renderDe(
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
    expect(html).toContain(translateKey('de', 'tasks.bulk.selectedMany').text);
    expect(html).toContain(translateKey('de', 'tasks.bulk.assign').text);
    expect(html).toContain(translateKey('de', 'tasks.bulk.priority').text);
    expect(html).toContain(translateKey('de', 'tasks.bulk.dueDate').text);
    expect(html).toContain(translateKey('de', 'tasks.bulk.waiting').text);
    expect(html).toContain(translateKey('de', 'tasks.bulk.cancel').text);
  });

  it('renders nothing without write permission or selection', () => {
    const html = renderDe(
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
