import { describe, expect, it } from 'vitest';
import { mergeAdditionalCustomers } from './customer-list.utils';

describe('mergeAdditionalCustomers', () => {
  it('appends additional customers not already in primary list', () => {
    const primary = [{ id: 'a' }, { id: 'b' }];
    const additional = [{ id: 'b' }, { id: 'c' }];
    expect(mergeAdditionalCustomers(primary, additional)).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('returns primary unchanged when additional is empty', () => {
    const primary = [{ id: 'a' }];
    expect(mergeAdditionalCustomers(primary, [])).toBe(primary);
  });
});
