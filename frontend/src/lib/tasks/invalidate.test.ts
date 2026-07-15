/**
 * Task Domain V2 — Query cache invalidation (area 9)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateTaskQueries,
  matchesTaskDetailInvalidation,
  matchesTaskListInvalidation,
  matchesTaskSummaryInvalidation,
  subscribeTaskQueryInvalidation,
  TASK_QUERY_INVALIDATE_EVENT,
} from './invalidate';

describe('task query invalidation', () => {
  beforeEach(() => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: (event: Event) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeEventListener: (type: string, handler: (event: Event) => void) => {
        listeners.get(type)?.delete(handler);
      },
      dispatchEvent: (event: Event) => {
        listeners.get(event.type)?.forEach((handler) => handler(event));
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches scoped invalidation events', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeTaskQueryInvalidation(handler);

    invalidateTaskQueries({
      orgId: 'org-1',
      taskId: 't1',
      buckets: ['TODAY', 'ALL_OPEN'],
      lists: true,
      summary: true,
      detail: true,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      orgId: 'org-1',
      taskId: 't1',
      buckets: ['TODAY', 'ALL_OPEN'],
    });
    unsubscribe();
  });

  it('matches list invalidation only for matching org and bucket', () => {
    const detail = {
      orgId: 'org-1',
      buckets: ['TODAY', 'ALL_OPEN'] as const,
      lists: true,
    };

    expect(matchesTaskListInvalidation(detail, 'org-1', 'TODAY')).toBe(true);
    expect(matchesTaskListInvalidation(detail, 'org-1', 'PLANNED')).toBe(false);
    expect(matchesTaskListInvalidation(detail, 'org-2', 'TODAY')).toBe(false);
    expect(matchesTaskListInvalidation({ ...detail, lists: false }, 'org-1', 'TODAY')).toBe(false);
  });

  it('matches detail invalidation only for the active task', () => {
    const detail = { orgId: 'org-1', taskId: 't1', detail: true };

    expect(matchesTaskDetailInvalidation(detail, 'org-1', 't1')).toBe(true);
    expect(matchesTaskDetailInvalidation(detail, 'org-1', 't2')).toBe(false);
    expect(matchesTaskDetailInvalidation({ ...detail, detail: false }, 'org-1', 't1')).toBe(false);
  });

  it('matches summary invalidation per org', () => {
    expect(matchesTaskSummaryInvalidation({ orgId: 'org-1', summary: true }, 'org-1')).toBe(true);
    expect(matchesTaskSummaryInvalidation({ orgId: 'org-1', summary: false }, 'org-1')).toBe(false);
    expect(matchesTaskSummaryInvalidation({ orgId: 'org-1' }, 'org-2')).toBe(false);
  });

  it('avoids global invalidation when buckets are scoped', () => {
    const handler = vi.fn();
    subscribeTaskQueryInvalidation(handler);

    invalidateTaskQueries({
      orgId: 'org-1',
      taskId: 't1',
      buckets: ['OVERDUE'],
      lists: true,
      summary: false,
      detail: true,
    });

    expect(matchesTaskListInvalidation(handler.mock.calls[0][0], 'org-1', 'OVERDUE')).toBe(true);
    expect(matchesTaskListInvalidation(handler.mock.calls[0][0], 'org-1', 'COMPLETED')).toBe(false);
    expect(matchesTaskSummaryInvalidation(handler.mock.calls[0][0], 'org-1')).toBe(false);
  });

  it('uses stable event name', () => {
    expect(TASK_QUERY_INVALIDATE_EVENT).toBe('task-query-invalidate');
  });
});
