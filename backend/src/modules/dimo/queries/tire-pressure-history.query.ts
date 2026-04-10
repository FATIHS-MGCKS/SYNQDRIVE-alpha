/**
 * Tire Pressure History — 3-minute buckets
 *
 * Per-wheel tire pressure for health analysis and trip detail visualization.
 */
export function buildTirePressureHistoryQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query TirePressureHistory {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "3m"
      ) {
        timestamp
        chassisAxleRow1WheelLeftTirePressure(agg: AVG)
        chassisAxleRow1WheelRightTirePressure(agg: AVG)
        chassisAxleRow2WheelLeftTirePressure(agg: AVG)
        chassisAxleRow2WheelRightTirePressure(agg: AVG)
      }
    }
  `.trim();
}
