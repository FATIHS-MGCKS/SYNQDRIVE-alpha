import {
  hasServiceCaseCostMutation,
  hasServiceCaseScheduleMutation,
} from './service-case-mutation.util';

describe('service-case-mutation.util', () => {
  it('detects schedule field mutations', () => {
    expect(hasServiceCaseScheduleMutation({ scheduledAt: '2026-06-10T09:00:00Z' })).toBe(true);
    expect(hasServiceCaseScheduleMutation({ expectedReadyAt: null })).toBe(true);
    expect(hasServiceCaseScheduleMutation({})).toBe(false);
  });

  it('detects cost field and metadata mutations', () => {
    expect(hasServiceCaseCostMutation({ estimatedCostCents: 100 })).toBe(true);
    expect(hasServiceCaseCostMutation({ metadata: { quotedCostCents: 500 } })).toBe(true);
    expect(hasServiceCaseCostMutation({})).toBe(false);
  });
});
