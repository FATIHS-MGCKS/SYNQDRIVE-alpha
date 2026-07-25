import { describe, expect, it } from 'vitest';
import { operatorFieldDescribedBy } from './operatorA11y';

describe('operatorA11y', () => {
  it('operatorFieldDescribedBy joins ids and omits empty values', () => {
    expect(operatorFieldDescribedBy('a', undefined, 'b')).toBe('a b');
    expect(operatorFieldDescribedBy()).toBeUndefined();
    expect(operatorFieldDescribedBy(null, '', 'hint-1')).toBe('hint-1');
  });
});
