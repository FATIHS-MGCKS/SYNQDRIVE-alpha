import { M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD } from './m3-3-hv-h4.constants';

/**
 * Canonical Neumaier compensated summation for finite positive kWh deltas (A2 V1).
 * No per-term rounding; returns sum + accumulated compensation in IEEE-754.
 */
export function neumaierCompensatedSumV1(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const x of values) {
    if (!Number.isFinite(x) || x <= 0) {
      throw new Error('M3.3-HV-H4-A2: summation requires finite positive inputs');
    }
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) {
      compensation += sum - t + x;
    } else {
      compensation += x - t + sum;
    }
    sum = t;
  }
  return sum + compensation;
}

export function sumM3_3HvH4ChargeThroughputEnergiesV1(
  sessions: readonly { energyAddedKwh: number | null }[],
): { totalKwh: number; summationMethod: typeof M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD } {
  const energies = sessions.map((s) => {
    const e = s.energyAddedKwh;
    if (e == null || !Number.isFinite(e)) {
      throw new Error('M3.3-HV-H4-A2: eligible contributor missing finite energy');
    }
    return e;
  });
  return {
    totalKwh: neumaierCompensatedSumV1(energies),
    summationMethod: M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD,
  };
}
