/** S3B Channel A — Ruptela R1 historical OBD evidence (dormant library). */
export const DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_2 = 'DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_2';
export const DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_2 = 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_2';

export const DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS = 8 * 60 * 60;

/**
 * `isIgnitionOn` is intentionally NOT queried: its `agg: AVG` semantics are not
 * provider-schema verified (repo contract only), so S3B carries no ignition claim.
 */
export type DiV0R1ObdSignalId =
  | 'speed'
  | 'powertrainCombustionEngineSpeed'
  | 'obdThrottlePosition'
  | 'obdEngineLoad'
  | 'powertrainCombustionEngineECT'
  | 'powertrainTransmissionCurrentGear';

export type DiV0R1ObdFieldAuthority = 'PROVIDER_SCHEMA_VERIFIED' | 'REPO_CONTRACT_ONLY' | 'UNVERIFIED';

export interface DiV0R1ObdSignalSpecification {
  id: DiV0R1ObdSignalId;
  providerField: DiV0R1ObdSignalId;
  unit: string;
  aggregation: 'AVG';
  fieldAuthority: DiV0R1ObdFieldAuthority;
}

export interface DiV0R1ObdQuerySpecification {
  id: 'DI_V0_R1_OBD_QUERY_V0_2';
  provider: 'DIMO_SIGNALS';
  queryFamily: 'HIGH_FREQUENCY_SUBSET';
  interval: '1s';
  intervalMs: 1000;
  bucketLabelField: 'timestamp';
  gridBoundary: '[from, to)';
  signals: readonly DiV0R1ObdSignalSpecification[];
}

export const DI_V0_R1_OBD_QUERY_SPEC_V0_2: DiV0R1ObdQuerySpecification = {
  id: 'DI_V0_R1_OBD_QUERY_V0_2',
  provider: 'DIMO_SIGNALS',
  queryFamily: 'HIGH_FREQUENCY_SUBSET',
  interval: '1s',
  intervalMs: 1000,
  bucketLabelField: 'timestamp',
  gridBoundary: '[from, to)',
  signals: [
    { id: 'speed', providerField: 'speed', unit: 'km/h', aggregation: 'AVG', fieldAuthority: 'REPO_CONTRACT_ONLY' },
    {
      id: 'powertrainCombustionEngineSpeed',
      providerField: 'powertrainCombustionEngineSpeed',
      unit: 'rpm',
      aggregation: 'AVG',
      fieldAuthority: 'REPO_CONTRACT_ONLY',
    },
    {
      id: 'obdThrottlePosition',
      providerField: 'obdThrottlePosition',
      unit: '%',
      aggregation: 'AVG',
      fieldAuthority: 'REPO_CONTRACT_ONLY',
    },
    { id: 'obdEngineLoad', providerField: 'obdEngineLoad', unit: '%', aggregation: 'AVG', fieldAuthority: 'REPO_CONTRACT_ONLY' },
    {
      id: 'powertrainCombustionEngineECT',
      providerField: 'powertrainCombustionEngineECT',
      unit: '°C',
      aggregation: 'AVG',
      fieldAuthority: 'REPO_CONTRACT_ONLY',
    },
    {
      id: 'powertrainTransmissionCurrentGear',
      providerField: 'powertrainTransmissionCurrentGear',
      unit: 'gear',
      aggregation: 'AVG',
      fieldAuthority: 'REPO_CONTRACT_ONLY',
    },
  ],
};
