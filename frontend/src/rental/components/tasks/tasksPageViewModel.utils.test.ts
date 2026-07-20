import { describe, expect, it } from 'vitest';
import type { ApiTaskSummary } from '../../../lib/api';
import {
  buildTasksPageResultLabel,
  buildTasksPageViewCounts,
  resolveTasksPageSummaryCount,
} from './tasksPageViewModel.utils';

const summary: ApiTaskSummary = {
  open: 12,
  active: 20,
  overdue: 3,
  dueToday: 4,
  critical: 1,
  done: 8,
  cancelled: 2,
  assignedToMe: 5,
  byStatus: { OPEN: 10, IN_PROGRESS: 5, WAITING: 2, DONE: 8, CANCELLED: 2 },
  byPriority: { LOW: 1, NORMAL: 10, HIGH: 6, CRITICAL: 1 },
  buckets: {
    NOW: 2,
    TODAY: 4,
    UPCOMING: 6,
    PLANNED: 3,
    OVERDUE: 3,
    UNASSIGNED: 7,
    ALL_OPEN: 20,
    COMPLETED: 10,
  },
  timezone: 'Europe/Berlin',
};

describe('tasksPageViewModel.utils', () => {
  it('builds view counts from summary only', () => {
    expect(buildTasksPageViewCounts(summary, true)).toMatchObject({
      mine: 5,
      open: 20,
      overdue: 3,
      today: 4,
      unassigned: 7,
      completed: 10,
    });
  });

  it('resolves summary count per active view', () => {
    expect(resolveTasksPageSummaryCount(summary, 'mine', 'ALL_OPEN')).toBe(5);
    expect(resolveTasksPageSummaryCount(summary, 'overdue', 'OVERDUE')).toBe(3);
  });

  it('labels partial page loads without using loaded count as total', () => {
    expect(buildTasksPageResultLabel('open', 50, 120, true)).toBe('Offen · 50 von 120 geladen');
    expect(buildTasksPageResultLabel('open', 120, 120, false)).toBe('Offen · 120 Aufgaben');
  });
});
