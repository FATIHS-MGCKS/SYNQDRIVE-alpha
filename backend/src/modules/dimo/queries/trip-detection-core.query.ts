/**
 * Trip Detection Core — 20-second buckets
 *
 * Primary source of truth for trip boundary detection:
 * - isIgnitionOn → trip start/end conditions
 * - speed → movement detection
 * - powertrainTransmissionTravelledDistance → real odometer for distance
 * - powertrainFuelSystemAbsoluteLevel → ICE fuel delta
 * - powertrainTractionBatteryStateOfChargeCurrentEnergy → EV energy delta
 */
export function buildTripDetectionCoreQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query TripDetectionCore {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "20s"
      ) {
        timestamp
        isIgnitionOn(agg: MAX)
        speed(agg: AVG)
        powertrainTransmissionTravelledDistance(agg: MAX)
        powertrainFuelSystemAbsoluteLevel(agg: AVG)
        powertrainTractionBatteryStateOfChargeCurrentEnergy(agg: AVG)
      }
    }
  `.trim();
}
