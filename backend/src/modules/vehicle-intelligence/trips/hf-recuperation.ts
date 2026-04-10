import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';

/** Minimum speed (km/h) to count energy as on-road regen (not stationary charging). */
const REGEN_MIN_SPEED_KMH = 8;
/** Minimum positive kW (into battery) to accumulate as regen while moving */
const REGEN_MIN_POWER_KW = 0.5;
const MAX_GAP_MS = 5000;

export interface EvTractionPowerTripSummary {
  /** Estimated kWh recovered while moving (positive power × time, speed ≥ REGEN_MIN_SPEED_KMH) */
  regenEnergyKwh: number;
  /** Time span (s) over which regen integration ran */
  regenDurationSeconds: number;
  peakRegenKw: number;
  /** Most negative kW (max motor draw) */
  peakDischargeKw: number | null;
  tractionPowerSampleCount: number;
}

/**
 * Integrate traction battery power from 1s HF buckets (variable gaps).
 * DIMO: positive kW = into battery (regen / charging), negative = motoring.
 */
export function summarizeEvTractionPowerFromHf(
  readings: HighFrequencyReading[],
): EvTractionPowerTripSummary {
  let regenEnergyKwh = 0;
  let regenDurationSeconds = 0;
  let peakRegen = 0;
  let peakDischarge: number | null = null;
  let samples = 0;

  const sorted = [...readings]
    .filter((r) => r.timestamp)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  for (const r of sorted) {
    const p = r.tractionBatteryPowerKw;
    if (p == null || Number.isNaN(p)) continue;
    samples++;
    if (p > peakRegen) peakRegen = p;
    if (peakDischarge == null || p < peakDischarge) peakDischarge = p;
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const t0 = new Date(prev.timestamp).getTime();
    const t1 = new Date(cur.timestamp).getTime();
    let dtMs = t1 - t0;
    if (dtMs <= 0) continue;
    dtMs = Math.min(dtMs, MAX_GAP_MS);

    const p0 = prev.tractionBatteryPowerKw;
    const p1 = cur.tractionBatteryPowerKw;
    if (p0 == null || p1 == null) continue;

    const v0 = prev.speedKmh ?? 0;
    const v1 = cur.speedKmh ?? 0;
    const avgV = (v0 + v1) / 2;
    const avgP = (p0 + p1) / 2;
    const dtH = dtMs / 3_600_000;
    const energyKwh = avgP * dtH;

    if (avgP >= REGEN_MIN_POWER_KW && avgV >= REGEN_MIN_SPEED_KMH) {
      regenEnergyKwh += energyKwh;
      regenDurationSeconds += dtMs / 1000;
    }
  }

  return {
    regenEnergyKwh: Math.round(regenEnergyKwh * 1000) / 1000,
    regenDurationSeconds: Math.round(regenDurationSeconds),
    peakRegenKw: Math.round(peakRegen * 100) / 100,
    peakDischargeKw:
      peakDischarge != null
        ? Math.round(peakDischarge * 100) / 100
        : null,
    tractionPowerSampleCount: samples,
  };
}
