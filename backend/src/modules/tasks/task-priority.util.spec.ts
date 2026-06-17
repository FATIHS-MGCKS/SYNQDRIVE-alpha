import { normalizeTaskPriority, normalizeTaskPriorityInput } from './task-priority.util';

describe('task-priority.util', () => {
  it('maps legacy MEDIUM and URGENT', () => {
    expect(normalizeTaskPriorityInput('MEDIUM')).toBe('NORMAL');
    expect(normalizeTaskPriorityInput('URGENT')).toBe('CRITICAL');
  });

  it('passes through canonical values', () => {
    expect(normalizeTaskPriorityInput('LOW')).toBe('LOW');
    expect(normalizeTaskPriorityInput('NORMAL')).toBe('NORMAL');
    expect(normalizeTaskPriorityInput('HIGH')).toBe('HIGH');
    expect(normalizeTaskPriorityInput('CRITICAL')).toBe('CRITICAL');
  });

  it('defaults unmapped values via normalizeTaskPriority', () => {
    expect(normalizeTaskPriority('bogus')).toBe('NORMAL');
    expect(normalizeTaskPriority('URGENT')).toBe('CRITICAL');
  });
});
