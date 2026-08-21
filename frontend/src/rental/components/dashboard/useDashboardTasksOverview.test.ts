import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('useDashboardTasksOverview invalidation wiring', () => {
  it('relies on shared task hooks with invalidation subscriptions', () => {
    const hookSrc = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './useDashboardTasksOverview.ts'),
      'utf8',
    );
    expect(hookSrc).toContain('useTaskList');
    expect(hookSrc).toContain('useTaskSummary');
    expect(hookSrc).not.toContain('OperatorDataContext');
    expect(hookSrc).not.toContain('useServiceCenterData');
  });
});
