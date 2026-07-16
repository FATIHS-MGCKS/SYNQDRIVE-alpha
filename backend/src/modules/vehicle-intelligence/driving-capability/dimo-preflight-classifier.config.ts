/**
 * DIMO Available-Signals Preflight catalog (P29).
 */
import type { HardwareType } from '@prisma/client';

export const DIMO_CAPABILITY_PREFLIGHT_VERSION = 'cap-preflight-v1';

/** Minimum interval between automatic preflights — NOT 30 seconds. */
export const DIMO_PREFLIGHT_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const DIMO_PREFLIGHT_INTERVAL_FLOOR_MS = 60_000;

export type PreflightSignalCategory =
  | 'ENGINE'
  | 'DRIVETRAIN'
  | 'BRAKE'
  | 'MOTION'
  | 'LOCATION'
  | 'EV'
  | 'NATIVE_EVENT'
  | 'SEGMENTS';

export interface PreflightSignalDefinition {
  key: string;
  dimoSignalName: string;
  label: string;
  category: PreflightSignalCategory;
  iceOnly?: boolean;
  evOnly?: boolean;
}

export const PREFLIGHT_SIGNAL_CATALOG: readonly PreflightSignalDefinition[] = [
  { key: 'rpm', dimoSignalName: 'powertrainCombustionEngineSpeed', label: 'RPM', category: 'ENGINE', iceOnly: true },
  { key: 'throttle', dimoSignalName: 'obdThrottlePosition', label: 'Throttle', category: 'ENGINE', iceOnly: true },
  { key: 'engineLoad', dimoSignalName: 'obdEngineLoad', label: 'Engine Load', category: 'ENGINE', iceOnly: true },
  { key: 'torque', dimoSignalName: 'powertrainCombustionEngineTorque', label: 'Torque', category: 'ENGINE', iceOnly: true },
  { key: 'coolant', dimoSignalName: 'powertrainCombustionEngineECT', label: 'Coolant Temperature', category: 'ENGINE', iceOnly: true },
  { key: 'engineRuntime', dimoSignalName: 'obdRunTime', label: 'Engine Runtime', category: 'ENGINE', iceOnly: true },
  { key: 'oilTemperature', dimoSignalName: 'powertrainCombustionEngineEOT', label: 'Oil Temperature', category: 'ENGINE', iceOnly: true },
  { key: 'gear', dimoSignalName: 'powertrainTransmissionCurrentGear', label: 'Gear', category: 'DRIVETRAIN', iceOnly: true },
  {
    key: 'transmissionTemperature',
    dimoSignalName: 'powertrainTransmissionOilTemperature',
    label: 'Transmission Temperature',
    category: 'DRIVETRAIN',
    iceOnly: true,
  },
  { key: 'brakePedal', dimoSignalName: 'chassisBrakeIsPedalPressed', label: 'Brake Pedal', category: 'BRAKE' },
  { key: 'brakePressure', dimoSignalName: 'chassisBrakePedalPosition', label: 'Brake Pressure', category: 'BRAKE' },
  { key: 'wheelSpeed', dimoSignalName: 'chassisAxleRow1WheelLeftSpeed', label: 'Wheel Speeds', category: 'BRAKE' },
  { key: 'yawRate', dimoSignalName: 'angularVelocityYaw', label: 'Yaw Rate', category: 'MOTION' },
  { key: 'altitude', dimoSignalName: 'currentLocationAltitude', label: 'Altitude', category: 'LOCATION' },
  { key: 'heading', dimoSignalName: 'currentLocationHeading', label: 'Heading', category: 'LOCATION' },
  {
    key: 'evBatteryPower',
    dimoSignalName: 'powertrainTractionBatteryCurrentPower',
    label: 'EV Battery Power',
    category: 'EV',
    evOnly: true,
  },
] as const;

export const PREFLIGHT_NATIVE_EVENT_KEYS = [
  'behavior.harshAcceleration',
  'behavior.harshBraking',
  'behavior.harshCornering',
  'safety.collision',
] as const;

export const PREFLIGHT_SEGMENT_DETECTOR = 'dimo-trip-segments' as const;

export function isEvPowertrain(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  return normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV';
}

export function isSignalApplicable(
  def: PreflightSignalDefinition,
  fuelType: string | null | undefined,
): boolean {
  const ev = isEvPowertrain(fuelType);
  if (def.iceOnly && ev) return false;
  if (def.evOnly && !ev) return false;
  return true;
}

export function catalogForHardware(_hardwareType: HardwareType): readonly PreflightSignalDefinition[] {
  return PREFLIGHT_SIGNAL_CATALOG;
}
