/**
 * DIMO SignalCollection field → GraphQL selection shape registry.
 * Sourced from Phase 2C schema audit (CONFIRMED_FROM_CURRENT_DIMO_SCHEMA).
 *
 * Unknown fields that pass GraphQL identifier validation default to SignalFloat
 * with provenance.schemaShapeInferred = true at capture time.
 */
export type DimoSignalGraphqlShape = 'SignalFloat' | 'SignalString' | 'SignalLocation';

export type DimoSignalSchemaEntry = {
  shape: DimoSignalGraphqlShape;
  /** Whether DIMO `signals(from,to,interval)` historical API supports this field. */
  historicalSupported: boolean;
};

/** GraphQL identifiers only — prevents injection of arbitrary selection text. */
const GRAPHQL_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidGraphqlFieldName(field: string): boolean {
  return GRAPHQL_FIELD_NAME.test(field);
}

const SIGNAL_LOCATION_FIELDS = new Set([
  'currentLocationCoordinates',
  'currentLocationApproximateCoordinates',
]);

const SIGNAL_STRING_FIELDS = new Set([
  'obdDTCList',
  'obdFuelTypeName',
  'vin',
]);

/** LATEST_ONLY in DIMO schema — no historical `signals()` aggregation. */
const LATEST_ONLY_FIELDS = new Set([
  'obdDTCList',
  'obdFuelTypeName',
]);

const KNOWN_SIGNAL_SCHEMA: Record<string, DimoSignalSchemaEntry> = {};

function registerFloat(field: string, historical = true): void {
  KNOWN_SIGNAL_SCHEMA[field] = { shape: 'SignalFloat', historicalSupported: historical };
}

function registerLocation(field: string): void {
  KNOWN_SIGNAL_SCHEMA[field] = { shape: 'SignalLocation', historicalSupported: true };
}

function registerString(field: string, historical = false): void {
  KNOWN_SIGNAL_SCHEMA[field] = { shape: 'SignalString', historicalSupported: historical };
}

// Motion / chassis / powertrain fields referenced by manifest + audits
[
  'speed',
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'chassisAxleRow2WheelLeftSpeed',
  'chassisAxleRow2WheelRightSpeed',
  'chassisBrakeCircuit1PressurePrimary',
  'chassisBrakeCircuit2PressurePrimary',
  'chassisBrakeIsPedalPressed',
  'chassisBrakePedalPosition',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'powertrainCombustionEngineSpeed',
  'obdEngineLoad',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainCombustionEngineMAF',
  'powertrainTransmissionCurrentGear',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionSelectedGear',
  'powertrainTransmissionGearRatio',
  'powertrainTransmissionTemperature',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'chassisAxleRow1WheelLeftTirePressure',
  'chassisAxleRow1WheelRightTirePressure',
  'chassisAxleRow2WheelLeftTirePressure',
  'chassisAxleRow2WheelRightTirePressure',
  'exteriorAirTemperature',
  'currentLocationHeading',
  'currentLocationAltitude',
  'isIgnitionOn',
  'obdRunTime',
].forEach((f) => registerFloat(f));

registerLocation('currentLocationCoordinates');
registerLocation('currentLocationApproximateCoordinates');
registerString('obdDTCList');
registerString('obdFuelTypeName');

export function resolveDimoSignalSchemaEntry(providerField: string): DimoSignalSchemaEntry & {
  schemaAuthority: 'KNOWN_REGISTRY' | 'INFERRED_SIGNAL_FLOAT';
} {
  if (!isValidGraphqlFieldName(providerField)) {
    throw new Error(`Invalid GraphQL field name: ${providerField}`);
  }

  if (SIGNAL_LOCATION_FIELDS.has(providerField)) {
    return { shape: 'SignalLocation', historicalSupported: true, schemaAuthority: 'KNOWN_REGISTRY' };
  }
  if (SIGNAL_STRING_FIELDS.has(providerField)) {
    return {
      shape: 'SignalString',
      historicalSupported: !LATEST_ONLY_FIELDS.has(providerField),
      schemaAuthority: 'KNOWN_REGISTRY',
    };
  }

  const known = KNOWN_SIGNAL_SCHEMA[providerField];
  if (known) {
    return { ...known, schemaAuthority: 'KNOWN_REGISTRY' };
  }

  return {
    shape: 'SignalFloat',
    historicalSupported: !LATEST_ONLY_FIELDS.has(providerField),
    schemaAuthority: 'INFERRED_SIGNAL_FLOAT',
  };
}

export function buildLatestSelectionForField(providerField: string): string {
  const entry = resolveDimoSignalSchemaEntry(providerField);
  if (entry.shape === 'SignalLocation') {
    return `${providerField} { timestamp value { latitude longitude } }`;
  }
  return `${providerField} { timestamp value }`;
}

export function buildHistoricalSelectionForField(providerField: string): string | null {
  const entry = resolveDimoSignalSchemaEntry(providerField);
  if (!entry.historicalSupported) return null;
  return `${providerField}(agg: AVG)`;
}

export function filterSchemaValidProviderFields(fields: string[]): string[] {
  return [...new Set(fields.filter(isValidGraphqlFieldName))].sort();
}
