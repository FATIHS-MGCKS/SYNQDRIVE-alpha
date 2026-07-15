import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DEFAULT_TASKS_FILTER_STATE,
  hasActiveTaskFilters,
} from './TasksFilterPanel';

describe('TasksFilterPanel', () => {
  it('detects active server-side filters', () => {
    expect(hasActiveTaskFilters(DEFAULT_TASKS_FILTER_STATE, '')).toBe(false);
    expect(
      hasActiveTaskFilters(
        { ...DEFAULT_TASKS_FILTER_STATE, bookingId: 'booking-1' },
        '',
      ),
    ).toBe(true);
    expect(hasActiveTaskFilters(DEFAULT_TASKS_FILTER_STATE, 'hu')).toBe(true);
  });

  it('renders mobile filter sheet trigger only on small screens', async () => {
    const { TasksFilterPanel } = await import('./TasksFilterPanel');
    const html = renderToStaticMarkup(
      <TasksFilterPanel
        filters={DEFAULT_TASKS_FILTER_STATE}
        searchDraft=""
        onSearchDraftChange={() => undefined}
        onChange={() => undefined}
        onClear={() => undefined}
        stationOptions={[]}
        assigneeOptions={[]}
        vehicleOptions={[]}
        bookingOptions={[]}
        customerOptions={[]}
        invoiceOptions={[]}
        serviceCaseOptions={[]}
        hasActiveFilters={false}
        resultLabel="Offen · 3 Aufgaben"
      />,
    );

    expect(html).toContain('data-testid="tasks-filter-panel"');
    expect(html).toContain('data-testid="tasks-filter-sheet-trigger"');
    expect(html).toContain('md:hidden');
    expect(html).toContain('Offen · 3 Aufgaben');
  });
});
