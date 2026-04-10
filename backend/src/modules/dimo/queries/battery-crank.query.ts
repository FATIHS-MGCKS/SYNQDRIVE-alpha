/**
 * Fetches low-voltage battery voltage and engine RPM over a short window
 * centred on the trip-start crank event.  Used only for post-start
 * crank-feature extraction — NOT a live or periodic query.
 *
 * Window recommendation: [tripStart - 30 s, tripStart + 120 s]
 * Interval: 5 s (fine-grained enough to capture voltage dip and recovery)
 */
export function buildBatteryCrankQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query BatteryCrankWindow {
      signals(
        tokenId: ${tokenId},
        from: "${from.toISOString()}",
        to: "${to.toISOString()}",
        interval: "5s"
      ) {
        timestamp
        lowVoltageBatteryCurrentVoltage
        powertrainCombustionEngineSpeed
      }
    }
  `.trim();
}
