/**
 * Deterministic LV volts → millivolts for retention arithmetic.
 * Single canonical conversion for M3.3C C1.
 */
export function convertRestRetentionVoltageToMillivolts(voltageV: number): number {
  if (!Number.isFinite(voltageV)) {
    throw new Error('rest retention voltage must be finite');
  }
  return Math.round(voltageV * 1000);
}
