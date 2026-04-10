/**
 * GraphQL query builder for full telemetry snapshot (signalsLatest).
 *
 * DIMO SignalCollection schema:
 *   - Root field: `lastSeen: Time` (NOT `timestamp`)
 *   - Numeric signals: SignalFloat → { timestamp, value }
 *   - String signals: SignalString → { timestamp, value }
 *   - Location: SignalLocation → { timestamp, value { latitude longitude } }
 */
export function buildLatestSnapshotQuery(tokenId: number): string {
  return `
    query LatestVehicleSnapshot {
      signalsLatest(tokenId: ${tokenId}) {
        lastSeen
        currentLocationCoordinates { timestamp value { latitude longitude } }
        speed { timestamp value }
        powertrainTransmissionTravelledDistance { timestamp value }
        powertrainFuelSystemRelativeLevel { timestamp value }
        powertrainFuelSystemAbsoluteLevel { timestamp value }
        powertrainTractionBatteryStateOfChargeCurrent { timestamp value }
        powertrainTractionBatteryCurrentPower { timestamp value }
        powertrainTractionBatteryRange { timestamp value }
        powertrainTractionBatteryGrossCapacity { timestamp value }
        powertrainCombustionEngineEngineOilRelativeLevel { timestamp value }
        powertrainCombustionEngineDieselExhaustFluidLevel { timestamp value }
        powertrainCombustionEngineECT { timestamp value }
        chassisAxleRow1WheelLeftTirePressure { timestamp value }
        chassisAxleRow1WheelRightTirePressure { timestamp value }
        chassisAxleRow2WheelLeftTirePressure { timestamp value }
        chassisAxleRow2WheelRightTirePressure { timestamp value }
        isIgnitionOn { timestamp value }
        obdIsPluggedIn { timestamp value }
        connectivityCellularIsJammingDetected { timestamp value }
        obdEngineLoad { timestamp value }
        lowVoltageBatteryCurrentVoltage { timestamp value }
        powertrainType { timestamp value }
      }
    }
  `.trim();
}
