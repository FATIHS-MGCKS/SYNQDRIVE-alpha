import { classifyInsightsTrigger } from './evaluations-trigger-class.util';

describe('classifyInsightsTrigger', () => {
  it('maps known trigger strings to bounded classes', () => {
    expect(classifyInsightsTrigger('scheduled_active')).toBe('scheduled');
    expect(classifyInsightsTrigger('scheduled_boot')).toBe('scheduled_boot');
    expect(classifyInsightsTrigger('debounced_event(booking)')).toBe('debounced');
    expect(classifyInsightsTrigger('manual_admin_run')).toBe('manual');
    expect(classifyInsightsTrigger('custom_hook')).toBe('other');
  });
});
