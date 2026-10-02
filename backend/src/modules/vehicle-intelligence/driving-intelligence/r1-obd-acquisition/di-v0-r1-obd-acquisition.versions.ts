/** S3B Channel A — Ruptela R1 historical OBD evidence (dormant library). */
export const DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3 = 'DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3';
export const DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 = 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3';

/**
 * V0_2 identifiers are superseded (C1D.9A): the V0_2 query carried
 * `powertrainTransmissionCurrentGear(agg: AVG)`. They must never be emitted again and
 * V0_3 evidence must never alias them.
 */
export const DI_V0_R1_OBD_SUPERSEDED_VERSIONS = [
  'DI_V0_R1_OBD_QUERY_V0_2',
  'DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_2',
  'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_2',
] as const;

export const DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS = 8 * 60 * 60;

export type DiV0R1ObdSignalId =
  | 'speed'
  | 'powertrainCombustionEngineSpeed'
  | 'obdThrottlePosition'
  | 'obdEngineLoad'
  | 'powertrainCombustionEngineECT';

export type DiV0R1ObdFieldAuthority = 'PROVIDER_SCHEMA_VERIFIED' | 'REPO_CONTRACT_ONLY' | 'UNVERIFIED';

/** Value scale exactly as returned by the provider; S3B applies no rescaling. */
export type DiV0R1ObdValueScale = 'KM_PER_HOUR' | 'RPM' | 'PERCENT_0_100' | 'CELSIUS';

export interface DiV0R1ObdSignalSpecification {
  id: DiV0R1ObdSignalId;
  providerField: DiV0R1ObdSignalId;
  unit: string;
  /** Unit string published in the DIMO telemetry GraphQL schema description / DIMO VSS spec. */
  providerDocumentedUnit: string;
  valueScale: DiV0R1ObdValueScale;
  aggregation: 'AVG';
  fieldAuthority: DiV0R1ObdFieldAuthority;
}

export interface DiV0R1ObdQuerySpecification {
  id: 'DI_V0_R1_OBD_QUERY_V0_3';
  provider: 'DIMO_SIGNALS';
  queryFamily: 'HIGH_FREQUENCY_SUBSET';
  interval: '1s';
  intervalMs: 1000;
  bucketLabelField: 'timestamp';
  gridBoundary: '[from, to)';
  /** Provider field authority never upgrades time authority. */
  temporalSemantics: 'INTERVAL_ONLY';
  /** Provider field authority source (EXP-021 C1D.9 read-only audit). */
  fieldAuthoritySource: 'DIMO_TELEMETRY_GRAPHQL_SCHEMA+DIMO_VSS_4_2_SPEC';
  signals: readonly DiV0R1ObdSignalSpecification[];
}

export const DI_V0_R1_OBD_QUERY_SPEC_V0_3: DiV0R1ObdQuerySpecification = {
  id: 'DI_V0_R1_OBD_QUERY_V0_3',
  provider: 'DIMO_SIGNALS',
  queryFamily: 'HIGH_FREQUENCY_SUBSET',
  interval: '1s',
  intervalMs: 1000,
  bucketLabelField: 'timestamp',
  gridBoundary: '[from, to)',
  temporalSemantics: 'INTERVAL_ONLY',
  fieldAuthoritySource: 'DIMO_TELEMETRY_GRAPHQL_SCHEMA+DIMO_VSS_4_2_SPEC',
  signals: [
    {
      id: 'speed',
      providerField: 'speed',
      unit: 'km/h',
      providerDocumentedUnit: 'km/h',
      valueScale: 'KM_PER_HOUR',
      aggregation: 'AVG',
      fieldAuthority: 'PROVIDER_SCHEMA_VERIFIED',
    },
    {
      id: 'powertrainCombustionEngineSpeed',
      providerField: 'powertrainCombustionEngineSpeed',
      unit: 'rpm',
      providerDocumentedUnit: 'rpm',
      valueScale: 'RPM',
      aggregation: 'AVG',
      fieldAuthority: 'PROVIDER_SCHEMA_VERIFIED',
    },
    {
      id: 'obdThrottlePosition',
      providerField: 'obdThrottlePosition',
      unit: '%',
      providerDocumentedUnit: 'percent',
      valueScale: 'PERCENT_0_100',
      aggregation: 'AVG',
      fieldAuthority: 'PROVIDER_SCHEMA_VERIFIED',
    },
    {
      id: 'obdEngineLoad',
      providerField: 'obdEngineLoad',
      unit: '%',
      providerDocumentedUnit: 'percent',
      valueScale: 'PERCENT_0_100',
      aggregation: 'AVG',
      fieldAuthority: 'PROVIDER_SCHEMA_VERIFIED',
    },
    {
      id: 'powertrainCombustionEngineECT',
      providerField: 'powertrainCombustionEngineECT',
      unit: '°C',
      providerDocumentedUnit: 'celsius',
      valueScale: 'CELSIUS',
      aggregation: 'AVG',
      fieldAuthority: 'PROVIDER_SCHEMA_VERIFIED',
    },
  ],
};

/**
 * Provider fields deliberately NOT queried. Both are exposed by DIMO as `Float` with
 * `agg: FloatAggregation!`, so `AVG` can synthesize values that never occurred.
 */
export const DI_V0_R1_OBD_EXCLUDED_PROVIDER_FIELDS = {
  /** Signed int8 gear index (0=Neutral, ±n); AVG yields fractional or false-Neutral gears; unavailable on all audited R1 devices. */
  powertrainTransmissionCurrentGear: 'CATEGORICAL_AVG_UNSAFE_NOT_AVAILABLE_ON_R1',
  /** VSS boolean exposed as Float; AVG yields fractions. */
  isIgnitionOn: 'BOOLEAN_AVG_FRACTIONAL',
} as const;
