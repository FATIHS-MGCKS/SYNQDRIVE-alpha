/**
 * High Frequency — 1-second buckets (post-trip enrichment only)
 *
 * Used exclusively after trip finalization for behavioral analysis:
 * - speed → acceleration/braking reconstruction
 * - ECT → cold engine abuse detection
 * - RPM → rev abuse, idle abuse
 * - TPS → kickdown, cold throttle abuse
 * - engine load → load-based abuse (ICE)
 * - traction battery power (kW) → EV regen / discharge context, recuperation energy
 */
export function buildHighFrequencyQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  return `
    query HighFrequency {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "1s"
      ) {
        timestamp
        speed(agg: AVG)
        powertrainCombustionEngineECT(agg: AVG)
        powertrainCombustionEngineSpeed(agg: AVG)
        obdThrottlePosition(agg: AVG)
        obdEngineLoad(agg: AVG)
        obdRunTime(agg: AVG)
        powertrainCombustionEngineTorque(agg: AVG)
        powertrainCombustionEngineTorquePercent(agg: AVG)
        exteriorAirTemperature(agg: AVG)
        currentLocationAltitude(agg: AVG)
        powertrainTransmissionCurrentGear(agg: AVG)
        isIgnitionOn(agg: AVG)
        powertrainTractionBatteryCurrentPower(agg: AVG)
        powertrainTractionBatteryStateOfChargeCurrent(agg: AVG)
        powertrainTractionBatteryTemperatureAverage(agg: AVG)
      }
    }
  `.trim();
}
