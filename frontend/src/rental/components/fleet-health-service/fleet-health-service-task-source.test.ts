import { describe, expect, it } from 'vitest';
import { TASKS_ERROR_MESSAGE, TASK_SUMMARY_ERROR_MESSAGE } from '../service-center/service-center-source-state';
import { resolveFleetHealthServiceTaskSourceState } from './fleet-health-service-task-source';

function serviceSlice(
  overrides: Partial<{
    tasksStatus: 'idle' | 'loading' | 'ready' | 'error' | 'stale';
    tasksError: string | null;
    summaryStatus: 'idle' | 'loading' | 'ready' | 'error' | 'stale';
    summaryError: string | null;
  }> = {},
) {
  return {
    tasks: {
      status: overrides.tasksStatus ?? 'ready',
      error: overrides.tasksError ?? null,
      data: [],
      fetchedAt: null,
      reload: async () => undefined,
    },
    taskSummary: {
      status: overrides.summaryStatus ?? 'ready',
      error: overrides.summaryError ?? null,
      data: null,
      fetchedAt: null,
      reload: async () => undefined,
    },
  };
}

describe('resolveFleetHealthServiceTaskSourceState', () => {
  it('reports loading when either tasks or summary source is loading', () => {
    expect(resolveFleetHealthServiceTaskSourceState(serviceSlice({ tasksStatus: 'loading' })).loading).toBe(
      true,
    );
    expect(
      resolveFleetHealthServiceTaskSourceState(serviceSlice({ summaryStatus: 'loading' })).loading,
    ).toBe(true);
    expect(resolveFleetHealthServiceTaskSourceState(serviceSlice()).loading).toBe(false);
  });

  it('prefers tasks error over summary error', () => {
    const state = resolveFleetHealthServiceTaskSourceState(
      serviceSlice({
        tasksError: TASKS_ERROR_MESSAGE,
        summaryError: TASK_SUMMARY_ERROR_MESSAGE,
      }),
    );
    expect(state.error).toBe(TASKS_ERROR_MESSAGE);
  });

  it('falls back to summary error when tasks error is absent', () => {
    const state = resolveFleetHealthServiceTaskSourceState(
      serviceSlice({ summaryError: TASK_SUMMARY_ERROR_MESSAGE }),
    );
    expect(state.error).toBe(TASK_SUMMARY_ERROR_MESSAGE);
  });
});
