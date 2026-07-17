/**
 * Technical snapshot context carried in BATTERY_OBSERVATION_CLASSIFY jobs.
 * Numeric telemetry + ISO timestamps only — no PII.
 */
export interface BatteryObservationSnapshotContext {
  providerFetchedAt: string;
  collectionObservedAt?: string | null;
  lvBatteryVoltage?: number | null;
  lvBatteryObservedAt?: string | null;
  evSoc?: number | null;
  tractionBatteryCurrentEnergyKwh?: number | null;
  tractionBatterySohPercent?: number | null;
  tractionBatteryPowerKw?: number | null;
  tractionBatteryChargingPowerKw?: number | null;
  tractionBatteryAddedEnergyKwh?: number | null;
  tractionBatteryChargeLimitPercent?: number | null;
  tractionBatteryIsCharging?: boolean | null;
  tractionBatteryChargingCableConnected?: boolean | null;
  tractionBatteryTemperatureC?: number | null;
  tractionBatteryGrossCapacityKwh?: number | null;
  rangeKm?: number | null;
  odometerKm?: number | null;
  signalObservedAt?: {
    soc?: string | null;
    currentEnergyKwh?: string | null;
    chargingPowerKw?: string | null;
    addedEnergyKwh?: string | null;
    providerSoh?: string | null;
    temperatureC?: string | null;
    chargeLimitPercent?: string | null;
    cableConnected?: string | null;
    isCharging?: string | null;
  } | null;
}
