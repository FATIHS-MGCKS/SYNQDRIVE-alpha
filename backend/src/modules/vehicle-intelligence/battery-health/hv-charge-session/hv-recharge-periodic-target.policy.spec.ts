import {
  HV_RECHARGE_PERIODIC_FAIRNESS_SLICES,
  selectFairPeriodicReconcileTargets,
  type HvRechargePeriodicTargetCandidate,
} from './hv-recharge-periodic-target.policy';

function veh(id: string): HvRechargePeriodicTargetCandidate {
  return {
    vehicleId: id,
    organizationId: 'org',
    category: 'telemetry_fallback_capability',
  };
}

describe('selectFairPeriodicReconcileTargets (E4 fairness)', () => {
  it('eventually selects all candidates when count > 3× batch over rotating buckets', () => {
    const batch = 5;
    const candidates = Array.from({ length: 20 }, (_, i) => veh(`veh-${String(i).padStart(3, '0')}`));
    const seen = new Set<string>();

    for (let tick = 0; tick < HV_RECHARGE_PERIODIC_FAIRNESS_SLICES * 4; tick += 1) {
      const selected = selectFairPeriodicReconcileTargets(
        candidates,
        batch,
        String(tick),
      );
      for (const row of selected) {
        seen.add(row.vehicleId);
      }
    }

    expect(seen.size).toBe(candidates.length);
  });

  it('dedupes by vehicle keeping highest-priority category', () => {
    const selected = selectFairPeriodicReconcileTargets(
      [
        { vehicleId: 'v1', organizationId: 'o', category: 'telemetry_fallback_capability' },
        { vehicleId: 'v1', organizationId: 'o', category: 'ongoing_hv_charge_session' },
      ],
      10,
      'bucket-1',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].category).toBe('ongoing_hv_charge_session');
  });
});
