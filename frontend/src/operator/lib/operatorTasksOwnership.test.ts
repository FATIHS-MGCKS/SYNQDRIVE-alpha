import { describe, expect, it } from 'vitest';
import { canReuseOperatorAllOpenTasks } from './operatorTasksOwnership';
import { DEFAULT_OPERATOR_TASK_FILTERS } from '../tasks/operatorTask.utils';

describe('operatorTasksOwnership', () => {
  it('allows reuse for default ALL_OPEN tasks tab filters', () => {
    expect(canReuseOperatorAllOpenTasks(DEFAULT_OPERATOR_TASK_FILTERS, undefined)).toBe(true);
  });

  it('requires remote fetch when mine scope is active', () => {
    expect(
      canReuseOperatorAllOpenTasks(
        { ...DEFAULT_OPERATOR_TASK_FILTERS, scope: 'mine' },
        { assignedUserId: 'u1' },
      ),
    ).toBe(false);
  });

  it('requires remote fetch when vehicle filter is set', () => {
    expect(
      canReuseOperatorAllOpenTasks(
        { ...DEFAULT_OPERATOR_TASK_FILTERS, vehicleId: 'veh-1' },
        { vehicleId: 'veh-1' },
      ),
    ).toBe(false);
  });
});
