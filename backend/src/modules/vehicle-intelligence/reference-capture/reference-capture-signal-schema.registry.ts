/**
 * DIMO SignalCollection field → GraphQL selection shape registry.
 * Sourced from Phase 2C schema audit (CONFIRMED_FROM_CURRENT_DIMO_SCHEMA).
 *
 * Unknown syntactically-valid fields are quarantined (latest-only) until shape is confirmed.
 */
export type DimoSignalGraphqlShape = 'SignalFloat' | 'SignalString' | 'SignalLocation';

export type DimoSignalSchemaResolutionState =
  | 'SCHEMA_CONFIRMED_SCALAR'
  | 'SCHEMA_CONFIRMED_LOCATION'
  | 'SCHEMA_CONFIRMED_STRING'
  | 'LATEST_ONLY'
  | 'HISTORICAL_SUPPORTED'
  | 'HISTORICAL_UNSUPPORTED'
  | 'SCHEMA_UNKNOWN_QUARANTINED';

export type DimoSignalSchemaEntry = {
  shape: DimoSignalGraphqlShape;
  historicalSupported: boolean;
  resolutionState: DimoSignalSchemaResolutionState;
};

export type ResolvedDimoSignalSchema = DimoSignalSchemaEntry & {
  schemaAuthority: 'KNOWN_REGISTRY' | 'SCHEMA_UNKNOWN_QUARANTINED';
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

const SIGNAL_STRING_FIELDS = new Set(['obdDTCList', 'obdFuelTypeName', 'vin']);

/** LATEST_ONLY in DIMO schema — no historical `signals()` aggregation. */
const LATEST_ONLY_FIELDS = new Set(['obdDTCList', 'obdFuelTypeName']);

const KNOWN_SIGNAL_SCHEMA: Record<string, DimoSignalSchemaEntry> = {};

function registerFloat(field: string, historical = true): void {
  KNOWN_SIGNAL_SCHEMA[field] = {
    shape: 'SignalFloat',
    historicalSupported: historical,
    resolutionState: historical ? 'HISTORICAL_SUPPORTED' : 'LATEST_ONLY',
  };
}

function registerLocation(field: string): void {
  KNOWN_SIGNAL_SCHEMA[field] = {
    shape: 'SignalLocation',
    historicalSupported: true,
    resolutionState: 'HISTORICAL_SUPPORTED',
  };
}

function registerString(field: string, historical = false): void {
  KNOWN_SIGNAL_SCHEMA[field] = {
    shape: 'SignalString',
    historicalSupported: historical,
    resolutionState: historical ? 'HISTORICAL_SUPPORTED' : 'LATEST_ONLY',
  };
}

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

export function resolveDimoSignalSchemaEntry(providerField: string): ResolvedDimoSignalSchema {
  if (!isValidGraphqlFieldName(providerField)) {
    throw new Error(`Invalid GraphQL field name: ${providerField}`);
  }

  if (SIGNAL_LOCATION_FIELDS.has(providerField)) {
    return {
      shape: 'SignalLocation',
      historicalSupported: true,
      resolutionState: 'SCHEMA_CONFIRMED_LOCATION',
      schemaAuthority: 'KNOWN_REGISTRY',
    };
  }
  if (SIGNAL_STRING_FIELDS.has(providerField)) {
    const historical = !LATEST_ONLY_FIELDS.has(providerField);
    return {
      shape: 'SignalString',
      historicalSupported: historical,
      resolutionState: historical ? 'HISTORICAL_SUPPORTED' : 'SCHEMA_CONFIRMED_STRING',
      schemaAuthority: 'KNOWN_REGISTRY',
    };
  }

  const known = KNOWN_SIGNAL_SCHEMA[providerField];
  if (known) {
    return {
      ...known,
      resolutionState:
        known.resolutionState === 'HISTORICAL_SUPPORTED'
          ? 'SCHEMA_CONFIRMED_SCALAR'
          : known.resolutionState,
      schemaAuthority: 'KNOWN_REGISTRY',
    };
  }

  return {
    shape: 'SignalFloat',
    historicalSupported: false,
    resolutionState: 'SCHEMA_UNKNOWN_QUARANTINED',
    schemaAuthority: 'SCHEMA_UNKNOWN_QUARANTINED',
  };
}

export function buildLatestSelectionForField(providerField: string): string {
  const entry = resolveDimoSignalSchemaEntry(providerField);
  if (entry.shape === 'SignalLocation') {
    return `${providerField} { timestamp value { latitude longitude } }`;
  }
  if (entry.shape === 'SignalString') {
    return `${providerField} { timestamp value }`;
  }
  return `${providerField} { timestamp value }`;
}

export function buildHistoricalSelectionForField(providerField: string): string | null {
  const entry = resolveDimoSignalSchemaEntry(providerField);
  if (!entry.historicalSupported || entry.resolutionState === 'SCHEMA_UNKNOWN_QUARANTINED') {
    return null;
  }
  return `${providerField}(agg: AVG)`;
}

export function filterSchemaValidProviderFields(fields: string[]): string[] {
  return [...new Set(fields.filter(isValidGraphqlFieldName))].sort();
}

export function partitionFieldsForReferenceCapture(providerFields: string[]): {
  latestFields: string[];
  historicalFields: string[];
  quarantinedFields: string[];
} {
  const latestFields: string[] = [];
  const historicalFields: string[] = [];
  const quarantinedFields: string[] = [];

  for (const field of filterSchemaValidProviderFields(providerFields)) {
    const entry = resolveDimoSignalSchemaEntry(field);
    latestFields.push(field);
    if (entry.resolutionState === 'SCHEMA_UNKNOWN_QUARANTINED') {
      quarantinedFields.push(field);
      continue;
    }
    if (entry.historicalSupported) {
      historicalFields.push(field);
    }
  }

  return { latestFields, historicalFields, quarantinedFields };
}

export function chunkProviderFields(fields: string[], chunkSize = 25): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < fields.length; i += chunkSize) {
    chunks.push(fields.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [[]];
}
