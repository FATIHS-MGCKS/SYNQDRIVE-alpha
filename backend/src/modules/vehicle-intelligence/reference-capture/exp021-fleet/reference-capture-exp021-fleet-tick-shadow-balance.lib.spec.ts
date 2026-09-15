import { phaseOrderKey } from './reference-capture-exp021-fleet-order-allocator.lib';
import {
  createTickShadowBalance,
  mergeDurableAndTickShadowBalance,
  recordTickShadowProposal,
} from './reference-capture-exp021-fleet-tick-shadow-balance.lib';

describe('reference-capture-exp021-fleet-tick-shadow-balance.lib', () => {
  it('merges ephemeral tick proposals without mutating durable balance', () => {
    const durable = {
      globalCounts: { [phaseOrderKey([90_000, 60_000])]: 1 },
      vehicleCounts: {},
    };
    const shadow = createTickShadowBalance();
    recordTickShadowProposal(shadow, 'veh-a', phaseOrderKey([60_000, 90_000]));
    const merged = mergeDurableAndTickShadowBalance(durable, shadow, 'veh-a');
    expect(merged.globalCounts[phaseOrderKey([60_000, 90_000])]).toBe(1);
    expect(durable.globalCounts[phaseOrderKey([60_000, 90_000])]).toBeUndefined();
  });

  it('sequential tick shadow proposals diversify order preview within one tick', () => {
    const shadow = createTickShadowBalance();
    const durable = { globalCounts: {}, vehicleCounts: {} };
    const first = mergeDurableAndTickShadowBalance(durable, shadow, 'veh-a');
    recordTickShadowProposal(shadow, 'veh-a', phaseOrderKey([60_000, 90_000]));
    const second = mergeDurableAndTickShadowBalance(durable, shadow, 'veh-b');
    expect(second.globalCounts[phaseOrderKey([60_000, 90_000])]).toBe(1);
    recordTickShadowProposal(shadow, 'veh-b', phaseOrderKey([90_000, 60_000]));
    const third = mergeDurableAndTickShadowBalance(durable, shadow, 'veh-c');
    expect(third.globalCounts[phaseOrderKey([90_000, 60_000])]).toBe(1);
  });
});
