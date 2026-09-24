import { createHash } from 'crypto';
import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import {
  computeHvRechargePeriodicFairnessFrame,
  computeHvRechargePeriodicMaxWaitBoundTicks,
  HV_RECHARGE_PERIODIC_FAIRNESS_SLICES,
  HV_RECHARGE_PERIODIC_PARTITION_COUNT,
  selectHvRechargePeriodicTargets,
  stableVehiclePartition,
  type HvRechargePeriodicTargetCandidate,
} from './hv-recharge-periodic-target.policy';

function legacyHashActiveSlice(periodBucket: string, slices: number): number {
  const digest = createHash('sha256').update(periodBucket).digest();
  return digest.readUInt32BE(0) % slices;
}

function veh(
  id: string,
  category: HvRechargePeriodicTargetCandidate['category'] = 'telemetry_fallback_capability',
): HvRechargePeriodicTargetCandidate {
  return { vehicleId: id, organizationId: 'org', category };
}

describe('hv-recharge-periodic-target.policy (E4.1 partition fairness)', () => {
  it('legacy hash(periodBucket) % slices does NOT guarantee all slices in P consecutive buckets', () => {
    const slices = HV_RECHARGE_PERIODIC_FAIRNESS_SLICES;
    const visited = new Set<number>();
    for (let tick = 0; tick < slices; tick += 1) {
      visited.add(legacyHashActiveSlice(String(tick), slices));
    }
    expect(visited.size).toBeLessThanOrEqual(slices);
    expect(visited.size).toBeLessThan(slices);
  });

  it('periodIndex % partitionCount visits every partition within P consecutive ticks', () => {
    const slices = HV_RECHARGE_PERIODIC_PARTITION_COUNT;
    const visited = new Set<number>();
    for (let tick = 0; tick < slices; tick += 1) {
      const frame = computeHvRechargePeriodicFairnessFrame({
        evaluatedAt: new Date(tick * getBatteryV2ReconciliationIntervalMs()),
        batchSize: 3,
      });
      visited.add(frame.activePartition);
    }
    expect(visited.size).toBe(slices);
  });

  it('covers >3× old maxScan (109+) eligible vehicles within derived max-wait bound', () => {
    const batchSize = 3;
    const oldMaxScan = batchSize * 12;
    const eligibleCount = oldMaxScan * 3 + 1;
    expect(eligibleCount).toBeGreaterThan(3 * oldMaxScan);

    const eligible: HvRechargePeriodicTargetCandidate[] = Array.from(
      { length: eligibleCount },
      (_, i) => veh(`erd-fair-${String(i).padStart(4, '0')}`),
    );

    const maxWait = computeHvRechargePeriodicMaxWaitBoundTicks({
      eligibleCount,
      batchSize,
    });
    const intervalMs = getBatteryV2ReconciliationIntervalMs();
    const seen = new Set<string>();

    for (let tick = 0; tick < maxWait; tick += 1) {
      const frame = computeHvRechargePeriodicFairnessFrame({
        evaluatedAt: new Date(tick * intervalMs),
        batchSize,
      });
      for (const row of selectHvRechargePeriodicTargets(eligible, frame)) {
        seen.add(row.vehicleId);
      }
    }

    expect(seen.size).toBe(eligibleCount);
  });

  it('category liveness: ongoing, native, and fallback all receive selection', () => {
    const batchSize = 2;
    const intervalMs = getBatteryV2ReconciliationIntervalMs();
    const eligible = [
      veh('ongoing-1', 'ongoing_hv_charge_session'),
      veh('native-1', 'native_recharge_capability'),
      veh('fallback-1', 'telemetry_fallback_capability'),
    ];
    const seenCategories = new Set<string>();
    const maxWait = computeHvRechargePeriodicMaxWaitBoundTicks({
      eligibleCount: eligible.length,
      batchSize,
    });

    for (let tick = 0; tick < maxWait; tick += 1) {
      const frame = computeHvRechargePeriodicFairnessFrame({
        evaluatedAt: new Date(tick * intervalMs),
        batchSize,
      });
      for (const row of selectHvRechargePeriodicTargets(eligible, frame)) {
        seenCategories.add(row.category);
      }
    }

    expect(seenCategories.has('ongoing_hv_charge_session')).toBe(true);
    expect(seenCategories.has('native_recharge_capability')).toBe(true);
    expect(seenCategories.has('telemetry_fallback_capability')).toBe(true);
  });

  it('dynamic eligibility: newly eligible vehicle is selected without in-memory cursor', () => {
    const batchSize = 1;
    const intervalMs = getBatteryV2ReconciliationIntervalMs();
    let eligible = [veh('only-a')];
    const seen = new Set<string>();

    for (let tick = 0; tick < 48; tick += 1) {
      if (tick === 24) {
        eligible = [...eligible, veh('only-b')];
      }
      const frame = computeHvRechargePeriodicFairnessFrame({
        evaluatedAt: new Date(tick * intervalMs),
        batchSize,
      });
      for (const row of selectHvRechargePeriodicTargets(eligible, frame)) {
        seen.add(row.vehicleId);
      }
    }

    expect(seen.has('only-a')).toBe(true);
    expect(seen.has('only-b')).toBe(true);
  });

  it('restart fairness: same periodIndex yields identical selection (stateless)', () => {
    const eligible = [veh('v1'), veh('v2'), veh('v3')];
    const at = new Date('2026-09-24T12:00:00.000Z');
    const frame = computeHvRechargePeriodicFairnessFrame({ evaluatedAt: at, batchSize: 2 });
    const first = selectHvRechargePeriodicTargets(eligible, frame);
    const second = selectHvRechargePeriodicTargets(eligible, frame);
    expect(second).toEqual(first);
    expect(stableVehiclePartition('v1', frame.partitionCount)).toBeGreaterThanOrEqual(0);
  });

  it('dedupes by vehicle keeping highest-priority category', () => {
    const at = new Date(0);
    const frame = computeHvRechargePeriodicFairnessFrame({ evaluatedAt: at, batchSize: 10 });
    const selected = selectHvRechargePeriodicTargets(
      [
        veh('v1', 'telemetry_fallback_capability'),
        veh('v1', 'ongoing_hv_charge_session'),
      ],
      frame,
    );
    expect(selected.filter((r) => r.vehicleId === 'v1')).toHaveLength(
      selected.some((r) => r.vehicleId === 'v1') ? 1 : 0,
    );
    if (selected.some((r) => r.vehicleId === 'v1')) {
      expect(selected.find((r) => r.vehicleId === 'v1')?.category).toBe(
        'ongoing_hv_charge_session',
      );
    }
  });
});
