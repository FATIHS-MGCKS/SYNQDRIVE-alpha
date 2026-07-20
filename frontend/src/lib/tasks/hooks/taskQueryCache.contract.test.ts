/**
 * Task Domain V2 — Hook + cache contract (area 9)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hooksDir = resolve(__dirname);

describe('task query cache hooks contract', () => {
  it('useTaskList keeps stale data on fetch error and scopes invalidation', () => {
    const source = readFileSync(resolve(hooksDir, 'useTaskList.ts'), 'utf8');
    expect(source).toContain('matchesTaskListInvalidation');
    expect(source).toContain('subscribeTaskQueryInvalidation');
    expect(source).toContain('tasksRef.current');
    expect(source).toContain('loadMoreError');
    expect(source).toContain('mergeTaskListPages');
    expect(source).toContain('isStale: Boolean(error) && tasks.length > 0');
  });

  it('useTaskDetail reloads only matching detail invalidations', () => {
    const source = readFileSync(resolve(hooksDir, 'useTaskDetail.ts'), 'utf8');
    expect(source).toContain('matchesTaskDetailInvalidation');
    expect(source).toContain('subscribeTaskQueryInvalidation');
  });

  it('useTaskDetailActions invalidates scoped buckets without global blast', () => {
    const source = readFileSync(resolve(hooksDir, 'useTaskDetailActions.ts'), 'utf8');
    expect(source).toContain('invalidateTaskQueries');
    expect(source).toContain('if (!orgId || !task || pendingAction) return null');
    expect(source).toContain('lists: true');
    expect(source).toContain('summary: true');
    expect(source).toContain('detail: true');
  });

  it('checklist and comment mutations invalidate detail', () => {
    const checklist = readFileSync(resolve(hooksDir, 'useTaskChecklistMutation.ts'), 'utf8');
    const comment = readFileSync(resolve(hooksDir, 'useTaskCommentMutation.ts'), 'utf8');
    expect(checklist).toContain('invalidateTaskQueries');
    expect(comment).toContain('invalidateTaskQueries');
  });
});
