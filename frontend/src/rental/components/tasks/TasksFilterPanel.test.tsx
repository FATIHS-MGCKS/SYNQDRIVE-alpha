import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyClientTaskFilters,
  DEFAULT_TASKS_FILTER_STATE,
  hasActiveTaskFilters,
} from './TasksFilterPanel';

describe('TasksFilterPanel utils', () => {
  it('detects active filters and applies client-side refinements', () => {
    const rows = [
      {
        id: '1',
        title: 'Reifen',
        vehicleLicense: 'M-AB 1234',
        vehicleModel: 'Golf',
        assignedUserName: 'Alex',
        createdByUserName: 'System',
        priority: 'High' as const,
        category: 'Maintenance' as const,
      },
      {
        id: '2',
        title: 'HU',
        vehicleLicense: 'B-XY 99',
        vehicleModel: 'BMW',
        assignedUserName: 'Maria',
        createdByUserName: 'System',
        priority: 'Medium' as const,
        category: 'Inspection' as const,
      },
    ];

    const filtered = applyClientTaskFilters(rows, {
      ...DEFAULT_TASKS_FILTER_STATE,
      search: 'reifen',
      priority: 'High',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('1');
    expect(hasActiveTaskFilters({ ...DEFAULT_TASKS_FILTER_STATE, category: 'Maintenance' })).toBe(true);
  });
});

describe('TasksFilterPanel', () => {
  it('renders mobile filter sheet trigger only on small screens', async () => {
    const { TasksFilterPanel } = await import('./TasksFilterPanel');
    const html = renderToStaticMarkup(
      <TasksFilterPanel
        filters={DEFAULT_TASKS_FILTER_STATE}
        onChange={() => undefined}
        onClear={() => undefined}
        vehicleOptions={[]}
        assigneeOptions={[]}
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
