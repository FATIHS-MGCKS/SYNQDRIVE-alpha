/**
 * Documented transmission / brake / wheel / motion signals (P31).
 *
 * Fleet note: LTE_R1 production audit lists most of these as NOT_LISTED —
 * mapper + domain types prepare for future provider delivery without schema churn.
 *
 * docs/audits/dimo-driving-signals-capability.md §5.2, §13–14
 * DIMO Vehicle Signals reference (Transmission, Brakes, Tires & Wheels)
 */
import type { CanonicalSignalDefinition } from './canonical-driving-signal-mapper.config';
import type { ChassisSignalFamily } from './chassis-signal-observation.types';

export type ChassisSignalDefinition = CanonicalSignalDefinition & {
  family: ChassisSignalFamily;
};

export const CHASSIS_SIGNAL_CATALOG: readonly ChassisSignalDefinition[] = [
  {
    key: 'transmission_current_gear',
    dimoSignalName: 'powertrainTransmissionCurrentGear',
    label: 'Current Gear',
    canonicalUnit: 'gear_index',
    acceptedProviderUnits: [],
    family: 'TRANSMISSION',
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'transmission_selected_gear',
    dimoSignalName: 'powertrainTransmissionSelectedGear',
    label: 'Selected Gear',
    canonicalUnit: 'gear_index',
    acceptedProviderUnits: [],
    family: 'TRANSMISSION',
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'transmission_temperature',
    dimoSignalName: 'powertrainTransmissionTemperature',
    label: 'Transmission Temperature',
    canonicalUnit: 'celsius',
    acceptedProviderUnits: ['°C', 'C', 'celsius', 'degC', 'deg_c', 'degrees'],
    family: 'TRANSMISSION',
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'transmission_temperature',
    dimoSignalName: 'powertrainTransmissionOilTemperature',
    label: 'Transmission Oil Temperature',
    canonicalUnit: 'celsius',
    acceptedProviderUnits: ['°C', 'C', 'celsius', 'degC', 'deg_c', 'degrees'],
    family: 'TRANSMISSION',
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'transmission_clutch_switch',
    dimoSignalName: 'powertrainTransmissionIsClutchSwitchOperated',
    label: 'Clutch Switch',
    canonicalUnit: 'boolean',
    acceptedProviderUnits: ['0/1', 'bool', 'boolean'],
    family: 'TRANSMISSION',
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'brake_pedal_pressed',
    dimoSignalName: 'chassisBrakeIsPedalPressed',
    label: 'Brake Pedal Pressed',
    canonicalUnit: 'boolean',
    acceptedProviderUnits: ['0/1', 'bool', 'boolean'],
    family: 'BRAKE',
    tripDetectionEligible: false,
  },
  {
    key: 'brake_pedal_position',
    dimoSignalName: 'chassisBrakePedalPosition',
    label: 'Brake Pedal Position',
    canonicalUnit: 'percent',
    acceptedProviderUnits: ['%', 'percent', 'pct'],
    family: 'BRAKE',
    tripDetectionEligible: false,
  },
  {
    key: 'brake_pressure',
    dimoSignalName: 'chassisBrakeCircuit1PressurePrimary',
    label: 'Brake Circuit 1 Pressure',
    canonicalUnit: 'kpa',
    acceptedProviderUnits: ['kPa', 'kpa', 'kilopascal'],
    family: 'BRAKE',
    tripDetectionEligible: false,
  },
  {
    key: 'brake_pressure',
    dimoSignalName: 'chassisBrakeCircuit2PressurePrimary',
    label: 'Brake Circuit 2 Pressure',
    canonicalUnit: 'kpa',
    acceptedProviderUnits: ['kPa', 'kpa', 'kilopascal'],
    family: 'BRAKE',
    tripDetectionEligible: false,
  },
  {
    key: 'wheel_speed_front_left',
    dimoSignalName: 'chassisAxleRow1WheelLeftSpeed',
    label: 'Front Left Wheel Speed',
    canonicalUnit: 'kph',
    acceptedProviderUnits: ['km/h', 'kph', 'kmh'],
    family: 'WHEEL',
    tripDetectionEligible: false,
  },
  {
    key: 'wheel_speed_front_right',
    dimoSignalName: 'chassisAxleRow1WheelRightSpeed',
    label: 'Front Right Wheel Speed',
    canonicalUnit: 'kph',
    acceptedProviderUnits: ['km/h', 'kph', 'kmh'],
    family: 'WHEEL',
    tripDetectionEligible: false,
  },
  {
    key: 'wheel_speed_rear_left',
    dimoSignalName: 'chassisAxleRow2WheelLeftSpeed',
    label: 'Rear Left Wheel Speed',
    canonicalUnit: 'kph',
    acceptedProviderUnits: ['km/h', 'kph', 'kmh'],
    family: 'WHEEL',
    tripDetectionEligible: false,
  },
  {
    key: 'wheel_speed_rear_right',
    dimoSignalName: 'chassisAxleRow2WheelRightSpeed',
    label: 'Rear Right Wheel Speed',
    canonicalUnit: 'kph',
    acceptedProviderUnits: ['km/h', 'kph', 'kmh'],
    family: 'WHEEL',
    tripDetectionEligible: false,
  },
  {
    key: 'yaw_rate',
    dimoSignalName: 'angularVelocityYaw',
    label: 'Yaw Rate',
    canonicalUnit: 'degree_per_second',
    acceptedProviderUnits: ['°/s', 'deg/s', 'degree/s', 'degrees_per_second'],
    family: 'MOTION',
    tripDetectionEligible: false,
  },
] as const;

export const CHASSIS_SIGNAL_KEYS = new Set(
  CHASSIS_SIGNAL_CATALOG.map((def) => def.key),
);

export function isChassisCanonicalKey(key: string): boolean {
  return CHASSIS_SIGNAL_KEYS.has(key as ChassisSignalDefinition['key']);
}

export function findChassisSignalDefinition(
  dimoSignalName: string,
): ChassisSignalDefinition | undefined {
  const trimmed = dimoSignalName.trim();
  return CHASSIS_SIGNAL_CATALOG.find((def) => def.dimoSignalName === trimmed);
}
