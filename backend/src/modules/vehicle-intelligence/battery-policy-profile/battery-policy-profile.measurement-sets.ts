import { BatteryMeasurementType } from '../battery-health/battery-v2-domain';

export const LV_LIVE_MEASUREMENT_TYPES = [
  BatteryMeasurementType.LIVE_VOLTAGE,
  BatteryMeasurementType.LIVE_LOADED_VOLTAGE,
  BatteryMeasurementType.CHARGING_VOLTAGE,
  BatteryMeasurementType.PRE_WAKE_VOLTAGE,
  BatteryMeasurementType.PRE_START_VOLTAGE,
] as const;

export const LV_REST_MEASUREMENT_TYPES = [
  BatteryMeasurementType.REST_AFTER_SHUTDOWN,
  BatteryMeasurementType.REST_60M,
  BatteryMeasurementType.REST_6H,
] as const;

export const LV_CRANK_MEASUREMENT_TYPES = [
  BatteryMeasurementType.START_DIP_PROXY,
  BatteryMeasurementType.RECOVERY_5S_VOLTAGE,
  BatteryMeasurementType.RECOVERY_30S_VOLTAGE,
  BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE,
] as const;

export const LV_WORKSHOP_MEASUREMENT_TYPES = [
  BatteryMeasurementType.WORKSHOP_OCV,
  BatteryMeasurementType.WORKSHOP_LOAD_TEST,
] as const;

export const HV_LIVE_MEASUREMENT_TYPES = [
  BatteryMeasurementType.LIVE_HV_SOC,
  BatteryMeasurementType.LIVE_HV_RANGE,
  BatteryMeasurementType.LIVE_HV_CURRENT_ENERGY,
  BatteryMeasurementType.LIVE_HV_CHARGING_POWER,
] as const;

export const HV_SOH_MEASUREMENT_TYPES = [
  BatteryMeasurementType.PROVIDER_HV_SOH,
  BatteryMeasurementType.WORKSHOP_HV_SOH,
  BatteryMeasurementType.DOCUMENT_HV_SOH,
] as const;

export const HV_SESSION_MEASUREMENT_TYPES = [
  BatteryMeasurementType.CHARGE_SESSION_CAPACITY,
  BatteryMeasurementType.DISCHARGE_SESSION_CAPACITY,
] as const;

export const HV_ALL_MEASUREMENT_TYPES = [
  ...HV_LIVE_MEASUREMENT_TYPES,
  ...HV_SOH_MEASUREMENT_TYPES,
  ...HV_SESSION_MEASUREMENT_TYPES,
] as const;

export const ICE_LV_FULL_SUPPORTED = [
  ...LV_LIVE_MEASUREMENT_TYPES,
  ...LV_REST_MEASUREMENT_TYPES,
  ...LV_CRANK_MEASUREMENT_TYPES,
  ...LV_WORKSHOP_MEASUREMENT_TYPES,
  BatteryMeasurementType.SESSION_MISSED,
] as const;

export const UNKNOWN_LV_SUPPORTED = [
  ...LV_LIVE_MEASUREMENT_TYPES,
  ...LV_WORKSHOP_MEASUREMENT_TYPES,
  BatteryMeasurementType.SESSION_MISSED,
] as const;

export const EV_AUX_LV_LIVE_ONLY = [
  BatteryMeasurementType.LIVE_VOLTAGE,
  BatteryMeasurementType.LIVE_LOADED_VOLTAGE,
  BatteryMeasurementType.CHARGING_VOLTAGE,
  BatteryMeasurementType.PRE_WAKE_VOLTAGE,
  BatteryMeasurementType.SESSION_MISSED,
] as const;

export function isCrankMeasurementType(type: BatteryMeasurementType): boolean {
  return (LV_CRANK_MEASUREMENT_TYPES as readonly BatteryMeasurementType[]).includes(
    type,
  );
}

export function isRestMeasurementType(type: BatteryMeasurementType): boolean {
  return (LV_REST_MEASUREMENT_TYPES as readonly BatteryMeasurementType[]).includes(
    type,
  );
}
