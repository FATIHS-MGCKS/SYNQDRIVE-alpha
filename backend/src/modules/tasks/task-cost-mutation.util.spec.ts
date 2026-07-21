import { metadataContainsTaskCostKeys, hasTaskCostMutation } from './task-cost-mutation.util';

describe('task-cost-mutation.util', () => {
  it('detects direct estimated and actual cost fields', () => {
    expect(hasTaskCostMutation({ estimatedCostCents: 100 })).toBe(true);
    expect(hasTaskCostMutation({ actualCostCents: 0 })).toBe(true);
    expect(hasTaskCostMutation({})).toBe(false);
  });

  it('detects cost keys smuggled through metadata', () => {
    expect(metadataContainsTaskCostKeys({ quotedCostCents: 5000 })).toBe(true);
    expect(metadataContainsTaskCostKeys({ stationId: 's1' })).toBe(false);
    expect(hasTaskCostMutation({ metadata: { actualCost: 12.5 } })).toBe(true);
  });
});
