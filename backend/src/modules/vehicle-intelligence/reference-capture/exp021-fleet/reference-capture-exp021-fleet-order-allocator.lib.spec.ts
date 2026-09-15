import {
  EXP021_FLEET_ORDER_ALLOCATOR_ALGORITHM,
  EXP021_SHORT_AB_PLAN_REGISTRY_KEYS,
  phaseOrderKey,
  proposeBalancedPhaseOrder,
} from './reference-capture-exp021-fleet-order-allocator.lib';

describe('reference-capture-exp021-fleet-order-allocator.lib', () => {
  it('uses truthful deterministic allocator naming (not block randomization)', () => {
    expect(EXP021_FLEET_ORDER_ALLOCATOR_ALGORITHM).toBe('DETERMINISTIC_STRATIFIED_GLOBAL_BALANCE');
    expect(EXP021_FLEET_ORDER_ALLOCATOR_ALGORITHM).not.toContain('RANDOM');
  });

  const bothPlans = [
    EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_90_60,
    EXP021_SHORT_AB_PLAN_REGISTRY_KEYS.ORDER_60_90,
  ];

  it('chooses a balanced valid initial order when no committed runs exist', () => {
    const proposed = proposeBalancedPhaseOrder({
      allowedPlans: bothPlans,
      vehicleId: 'veh-a',
      balance: { globalCounts: {}, vehicleCounts: {} },
    });
    expect(proposed?.phaseOrderMs).toEqual([60_000, 90_000]);
  });

  it('prefers 60→90 globally after one committed 90→60 run', () => {
    const proposed = proposeBalancedPhaseOrder({
      allowedPlans: bothPlans,
      vehicleId: 'veh-b',
      balance: { globalCounts: { [phaseOrderKey([90_000, 60_000])]: 1 }, vehicleCounts: {} },
    });
    expect(proposed?.phaseOrderKey).toBe(phaseOrderKey([60_000, 90_000]));
  });

  it('prefers missing per-vehicle order when global constraints allow', () => {
    const proposed = proposeBalancedPhaseOrder({
      allowedPlans: bothPlans,
      vehicleId: 'veh-c',
      balance: {
        globalCounts: {
          [phaseOrderKey([90_000, 60_000])]: 1,
          [phaseOrderKey([60_000, 90_000])]: 1,
        },
        vehicleCounts: { [phaseOrderKey([90_000, 60_000])]: 1 },
      },
    });
    expect(proposed?.phaseOrderKey).toBe(phaseOrderKey([60_000, 90_000]));
  });

  it('is deterministic for identical balances', () => {
    const balance = { globalCounts: {}, vehicleCounts: {} };
    const first = proposeBalancedPhaseOrder({ allowedPlans: bothPlans, vehicleId: 'veh-d', balance });
    const second = proposeBalancedPhaseOrder({ allowedPlans: bothPlans, vehicleId: 'veh-d', balance });
    expect(first).toEqual(second);
  });

  it('does not mutate balance snapshot', () => {
    const balance = {
      globalCounts: { [phaseOrderKey([90_000, 60_000])]: 2 },
      vehicleCounts: { [phaseOrderKey([60_000, 90_000])]: 1 },
    };
    proposeBalancedPhaseOrder({ allowedPlans: bothPlans, vehicleId: 'veh-e', balance });
    expect(balance.globalCounts[phaseOrderKey([90_000, 60_000])]).toBe(2);
  });
});
