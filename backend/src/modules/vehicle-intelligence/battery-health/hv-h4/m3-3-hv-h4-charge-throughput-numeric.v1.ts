import { M3_3_HV_H4_CHARGE_THROUGHPUT_SUMMATION_METHOD } from './m3-3-hv-h4.constants';

/**
 * Deterministic compensated summation for finite positive kWh deltas (A2 V1).
 * No per-term rounding; result is raw IEEE-754 sum with Neumaier error compensation.
 */
export function neumaierCompensatedSumV1(values: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('M3.3-HV-H4-A2: summation requires finite positive inputs');
    }
    const corrected = value - compensation;
    const next = sum + corrected;
    compensation = next - sum - corrected;
    sum = next;
  }
  return sum;
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
