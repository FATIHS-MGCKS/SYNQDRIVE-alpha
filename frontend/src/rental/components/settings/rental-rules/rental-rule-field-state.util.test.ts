import { describe, expect, it } from 'vitest';
import {
  allowsInherit,
  describeFieldImpact,
  formValueToBooleanState,
  inferBooleanFieldState,
  inferScalarFieldState,
} from './rental-rule-field-state.util';

describe('rental-rule-field-state.util', () => {
  it('disallows inherit at organization scope', () => {
    expect(allowsInherit('organization')).toBe(false);
    expect(allowsInherit('category')).toBe(true);
  });

  it('maps boolean states for category scope', () => {
    expect(inferBooleanFieldState('category', true)).toBe('required');
    expect(inferBooleanFieldState('category', false)).toBe('not_required');
    expect(inferBooleanFieldState('category', null)).toBe('inherit');
    expect(formValueToBooleanState('category', '')).toBe('inherit');
  });

  it('maps scalar states for organization scope', () => {
    expect(inferScalarFieldState('organization', null)).toBe('none');
    expect(inferScalarFieldState('organization', 21)).toBe('own');
    expect(inferScalarFieldState('category', null)).toBe('inherit');
  });

  it('describes field impact', () => {
    expect(
      describeFieldImpact({
        scope: 'category',
        field: 'minimumAgeYears',
        previousStored: 21,
        nextStored: null,
        inheritedValue: 18,
      }),
    ).toBe('inherits');
    expect(
      describeFieldImpact({
        scope: 'organization',
        field: 'minimumAgeYears',
        previousStored: 21,
        nextStored: null,
        inheritedValue: null,
      }),
    ).toBe('cleared');
  });
});
