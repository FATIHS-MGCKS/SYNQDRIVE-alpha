import { describe, expect, it } from 'vitest';
import type { ApiTaskSummary } from '../../lib/tasks/types';
import {
  buildTasksPageKpis,
  buildTasksPageListFilters,
  bucketCountFromSummary,
  getVisibleTasksPageViews,
  tasksPageEmptyState,
  type TasksPageView,
} from './tasks-page.utils';

describe('tasks-page.utils', () => {
  it('maps page views to canonical backend buckets', () => {
    expect(buildTasksPageListFilters('overdue', 'user-1')).toEqual({ bucket: 'OVERDUE' });
    expect(buildTasksPageListFilters('today', 'user-1')).toEqual({ bucket: 'TODAY' });
    expect(buildTasksPageListFilters('planned', 'user-1')).toEqual({ bucket: 'PLANNED' });
    expect(buildTasksPageListFilters('completed', 'user-1')).toEqual({ bucket: 'COMPLETED' });
    expect(buildTasksPageListFilters('open', 'user-1')).toEqual({ bucket: 'ALL_OPEN' });
    expect(buildTasksPageListFilters('mine', 'user-1')).toEqual({
      bucket: 'ALL_OPEN',
      assignedUserId: 'user-1',
    });
    expect(buildTasksPageListFilters('unassigned', 'user-1')).toEqual({ bucket: 'UNASSIGNED' });
  });

  it('hides unassigned view without permission', () => {
    const views = getVisibleTasksPageViews(false).map((view) => view.id);
    expect(views).not.toContain('unassigned');
    expect(getVisibleTasksPageViews(true).map((view) => view.id)).toContain('unassigned');
  });

  it('builds compact KPI strip from summary buckets', () => {
    const summary = {
      overdue: 2,
      dueToday: 5,
      assignedToMe: 3,
      buckets: {
        OVERDUE: 2,
        TODAY: 5,
        UNASSIGNED: 4,
      },
    } as ApiTaskSummary;

    const kpis = buildTasksPageKpis(summary, true);
    expect(kpis.map((item) => item.id)).toEqual(['overdue', 'today', 'mine', 'unassigned']);
    expect(kpis[0]?.value).toBe(2);
    expect(kpis[2]?.value).toBe(3);
    expect(bucketCountFromSummary(summary, 'UNASSIGNED')).toBe(4);
  });

  it('returns view-specific empty states', () => {
    expect(tasksPageEmptyState('overdue', false).title).toContain('überfällig');
    expect(tasksPageEmptyState('today', false).title).toContain('Heute');
    expect(tasksPageEmptyState('mine', true).title).toContain('passenden');
  });

  it('covers all target views', () => {
    const ids = getVisibleTasksPageViews(true).map((view) => view.id);
    const expected: TasksPageView[] = [
      'mine',
      'open',
      'overdue',
      'today',
      'planned',
      'unassigned',
      'completed',
    ];
    expect(ids).toEqual(expected);
  });
});
