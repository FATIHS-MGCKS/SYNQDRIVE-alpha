/**
 * High Frequency — 1-second buckets (post-trip enrichment only)
 *
 * Used exclusively after trip finalization for behavioral analysis and optional
 * HF mirror (HF_MIRROR_ENABLED). Core abuse signals + extended evidence fields
 * when the provider returns them (GPS, SOC, tires, environment, ignition).
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
        powertrainTractionBatteryCurrentPower(agg: AVG)
        currentLocationCoordinates(agg: RAND) { latitude longitude }
        powertrainTransmissionTravelledDistance(agg: MAX)
        powertrainTractionBatteryStateOfChargeCurrent(agg: AVG)
        powertrainTractionBatteryStateOfChargeCurrentEnergy(agg: AVG)
        powertrainTractionBatteryRange(agg: AVG)
        powertrainTractionBatteryCurrentVoltage(agg: AVG)
        powertrainTractionBatteryChargingIsCharging(agg: MAX)
        powertrainTractionBatteryChargingPower(agg: AVG)
        exteriorAirTemperature(agg: AVG)
        isIgnitionOn(agg: MAX)
        chassisAxleRow1WheelLeftTirePressure(agg: AVG)
        chassisAxleRow1WheelRightTirePressure(agg: AVG)
        chassisAxleRow2WheelLeftTirePressure(agg: AVG)
        chassisAxleRow2WheelRightTirePressure(agg: AVG)
      }
    }
  `.trim();
}
