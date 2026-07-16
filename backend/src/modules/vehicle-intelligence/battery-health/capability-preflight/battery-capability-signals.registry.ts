import { BatteryMeasurementType } from '../battery-v2-domain';

export const RECHARGE_SEGMENTS_SIGNAL_KEY = 'dimo.segments.recharge';

export interface BatteryCapabilitySignalDefinition {
  signalKey: string;
  signalName: string;
  dimoSignalName: string;
  measurementType: BatteryMeasurementType | null;
  provider: 'DIMO';
}

export const BATTERY_CAPABILITY_SIGNALS: readonly BatteryCapabilitySignalDefinition[] = [
  {
    signalKey: 'lv.voltage',
    signalName: 'lowVoltageBatteryCurrentVoltage',
    dimoSignalName: 'lowVoltageBatteryCurrentVoltage',
    measurementType: BatteryMeasurementType.LIVE_VOLTAGE,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.soc',
    signalName: 'powertrainTractionBatteryStateOfChargeCurrent',
    dimoSignalName: 'powertrainTractionBatteryStateOfChargeCurrent',
    measurementType: BatteryMeasurementType.LIVE_HV_SOC,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.current_energy',
    signalName: 'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    dimoSignalName: 'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    measurementType: BatteryMeasurementType.LIVE_HV_CURRENT_ENERGY,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.added_energy',
    signalName: 'powertrainTractionBatteryChargingAddedEnergy',
    dimoSignalName: 'powertrainTractionBatteryChargingAddedEnergy',
    measurementType: BatteryMeasurementType.CHARGE_SESSION_CAPACITY,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.is_charging',
    signalName: 'powertrainTractionBatteryChargingIsCharging',
    dimoSignalName: 'powertrainTractionBatteryChargingIsCharging',
    measurementType: null,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.cable_connected',
    signalName: 'powertrainTractionBatteryChargingIsChargingCableConnected',
    dimoSignalName: 'powertrainTractionBatteryChargingIsChargingCableConnected',
    measurementType: null,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.current_power',
    signalName: 'powertrainTractionBatteryCurrentPower',
    dimoSignalName: 'powertrainTractionBatteryCurrentPower',
    measurementType: BatteryMeasurementType.LIVE_HV_CHARGING_POWER,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.charge_limit',
    signalName: 'powertrainTractionBatteryChargingChargeLimit',
    dimoSignalName: 'powertrainTractionBatteryChargingChargeLimit',
    measurementType: null,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.provider_soh',
    signalName: 'powertrainTractionBatteryStateOfHealth',
    dimoSignalName: 'powertrainTractionBatteryStateOfHealth',
    measurementType: BatteryMeasurementType.PROVIDER_HV_SOH,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.pack_temperature',
    signalName: 'powertrainTractionBatteryTemperatureAverage',
    dimoSignalName: 'powertrainTractionBatteryTemperatureAverage',
    measurementType: null,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.gross_capacity',
    signalName: 'powertrainTractionBatteryGrossCapacity',
    dimoSignalName: 'powertrainTractionBatteryGrossCapacity',
    measurementType: null,
    provider: 'DIMO',
  },
  {
    signalKey: 'hv.charging_power',
    signalName: 'powertrainTractionBatteryChargingPower',
    dimoSignalName: 'powertrainTractionBatteryChargingPower',
    measurementType: BatteryMeasurementType.LIVE_HV_CHARGING_POWER,
    provider: 'DIMO',
  },
  {
    signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
    signalName: 'dimo.segments.recharge',
    dimoSignalName: RECHARGE_SEGMENTS_SIGNAL_KEY,
    measurementType: null,
    provider: 'DIMO',
  },
] as const;
