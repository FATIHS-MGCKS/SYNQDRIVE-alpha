import { describe, expect, it } from 'vitest';
import { DEFAULT_OPERATOR_TASK_FILTERS } from '../tasks/operatorTask.utils';
import {
  hasActiveOperatorTaskFilters,
  operatorTasksEmptyDescription,
  resetOperatorTaskFilters,
} from './operatorTasksView.utils';

describe('operatorTasksView.utils', () => {
  it('detects active filters', () => {
    expect(hasActiveOperatorTaskFilters(DEFAULT_OPERATOR_TASK_FILTERS)).toBe(false);
    expect(hasActiveOperatorTaskFilters({ ...DEFAULT_OPERATOR_TASK_FILTERS, overdue: true })).toBe(
      true,
    );
    expect(
      hasActiveOperatorTaskFilters({ ...DEFAULT_OPERATOR_TASK_FILTERS, bookingId: 'booking-1' }),
    ).toBe(true);
  });

  it('returns filter-specific empty copy', () => {
    expect(operatorTasksEmptyDescription(DEFAULT_OPERATOR_TASK_FILTERS, 'user-1')).toBe(
      'Alle Aufgaben erledigt.',
    );
    expect(
      operatorTasksEmptyDescription({ ...DEFAULT_OPERATOR_TASK_FILTERS, overdue: true }, 'user-1'),
    ).toBe('Keine Aufgaben passen zu den aktiven Filtern.');
  });

  it('resets filters to the default scope', () => {
    expect(resetOperatorTaskFilters('user-1')).toEqual(DEFAULT_OPERATOR_TASK_FILTERS);
    expect(resetOperatorTaskFilters(null).scope).toBe('all');
  });
});
