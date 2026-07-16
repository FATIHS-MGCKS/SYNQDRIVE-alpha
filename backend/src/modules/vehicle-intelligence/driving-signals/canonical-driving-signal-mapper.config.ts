/**
 * Canonical signal catalog — documented DIMO names aligned with P29 preflight
 * plus audit-documented companions (exterior temp, torque percent).
 *
 * docs/audits/dimo-driving-signals-capability.md §3.2
 */
import { CHASSIS_SIGNAL_CATALOG } from './chassis-signal-catalog';
import type { CanonicalDrivingSignalKey, CanonicalSignalUnit } from './canonical-driving-signal-mapper.types';

export type CanonicalSignalDefinition = {
  key: CanonicalDrivingSignalKey;
  /** Primary DIMO signal name first; alternates are not auto-merged. */
  dimoSignalName: string;
  label: string;
  canonicalUnit: CanonicalSignalUnit;
  /** Explicit provider units accepted for normalization. Unknown units are rejected. */
  acceptedProviderUnits: readonly string[];
  iceOnly?: boolean;
  evOnly?: boolean;
  /** Altitude/heading: analysis context after trip completion only. */
  postTripAnalysisContextOnly?: boolean;
  tripDetectionEligible: false;
};

export const CANONICAL_DRIVING_SIGNAL_CATALOG: readonly CanonicalSignalDefinition[] = [
  {
    key: 'engine_rpm',
    dimoSignalName: 'powertrainCombustionEngineSpeed',
    label: 'Engine RPM',
    canonicalUnit: 'rpm',
    acceptedProviderUnits: ['rpm', 'RPM', 'rev/min', '1/min'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'throttle_position',
    dimoSignalName: 'obdThrottlePosition',
    label: 'Throttle Position',
    canonicalUnit: 'percent',
    acceptedProviderUnits: ['%', 'percent', 'pct'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'engine_load',
    dimoSignalName: 'obdEngineLoad',
    label: 'Engine Load',
    canonicalUnit: 'percent',
    acceptedProviderUnits: ['%', 'percent', 'pct'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'engine_torque',
    dimoSignalName: 'powertrainCombustionEngineTorque',
    label: 'Engine Torque',
    canonicalUnit: 'newton_meter',
    acceptedProviderUnits: ['Nm', 'N*m', 'newton_meter', 'newtonmeter'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'engine_torque_percent',
    dimoSignalName: 'powertrainCombustionEngineTorquePercent',
    label: 'Engine Torque Percent',
    canonicalUnit: 'percent',
    acceptedProviderUnits: ['%', 'percent', 'pct'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'coolant_temperature',
    dimoSignalName: 'powertrainCombustionEngineECT',
    label: 'Coolant Temperature',
    canonicalUnit: 'celsius',
    acceptedProviderUnits: ['°C', 'C', 'celsius', 'degC', 'deg_c'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'engine_runtime',
    dimoSignalName: 'obdRunTime',
    label: 'Engine Runtime',
    canonicalUnit: 'second',
    acceptedProviderUnits: ['s', 'sec', 'second', 'seconds'],
    iceOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'exterior_temperature',
    dimoSignalName: 'exteriorAirTemperature',
    label: 'Exterior Temperature',
    canonicalUnit: 'celsius',
    acceptedProviderUnits: ['°C', 'C', 'celsius', 'degC', 'deg_c'],
    tripDetectionEligible: false,
  },
  {
    key: 'altitude',
    dimoSignalName: 'currentLocationAltitude',
    label: 'Altitude',
    canonicalUnit: 'meter',
    acceptedProviderUnits: ['m', 'meter', 'meters'],
    postTripAnalysisContextOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'heading',
    dimoSignalName: 'currentLocationHeading',
    label: 'Heading',
    canonicalUnit: 'degree',
    acceptedProviderUnits: ['°', 'deg', 'degree', 'degrees'],
    postTripAnalysisContextOnly: true,
    tripDetectionEligible: false,
  },
  {
    key: 'ev_battery_power',
    dimoSignalName: 'powertrainTractionBatteryCurrentPower',
    label: 'EV Battery Current Power',
    canonicalUnit: 'watt',
    acceptedProviderUnits: ['W', 'watt', 'watts', 'kW', 'kilowatt'],
    evOnly: true,
    tripDetectionEligible: false,
  },
] as const;

export const CANONICAL_DRIVING_SIGNAL_CATALOG_ALL: readonly CanonicalSignalDefinition[] = [
  ...CANONICAL_DRIVING_SIGNAL_CATALOG,
  ...CHASSIS_SIGNAL_CATALOG,
];

const BY_DIMO_SIGNAL = new Map<string, CanonicalSignalDefinition>(
  CANONICAL_DRIVING_SIGNAL_CATALOG_ALL.map((def) => [def.dimoSignalName, def]),
);

export function findCanonicalSignalDefinition(
  dimoSignalName: string,
): CanonicalSignalDefinition | undefined {
  return BY_DIMO_SIGNAL.get(dimoSignalName.trim());
}

export function isEvPowertrain(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  return normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV';
}

export function isSignalApplicableForFuelType(
  def: CanonicalSignalDefinition,
  fuelType: string | null | undefined,
): boolean {
  const ev = isEvPowertrain(fuelType);
  if (def.iceOnly && ev) return false;
  if (def.evOnly && !ev) return false;
  return true;
}
