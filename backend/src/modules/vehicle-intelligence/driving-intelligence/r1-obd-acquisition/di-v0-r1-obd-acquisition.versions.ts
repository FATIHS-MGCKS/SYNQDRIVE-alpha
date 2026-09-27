/** S3B Channel A — Ruptela R1 historical OBD evidence (dormant library). */
export const DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_1 = 'DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_1';
export const DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_1 = 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_1';

export const DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS = 8 * 60 * 60;

export type DiV0R1ObdSignalId =
  | 'speed'
  | 'powertrainCombustionEngineSpeed'
  | 'obdThrottlePosition'
  | 'obdEngineLoad'
  | 'powertrainCombustionEngineECT'
  | 'powertrainTransmissionCurrentGear'
  | 'isIgnitionOn';

export interface DiV0R1ObdSignalSpecification {
  id: DiV0R1ObdSignalId;
  providerField: DiV0R1ObdSignalId;
  unit: string;
  aggregation: 'AVG';
}

export interface DiV0R1ObdQuerySpecification {
  id: 'DI_V0_R1_OBD_QUERY_V0_1';
  provider: 'DIMO_SIGNALS';
  queryFamily: 'HIGH_FREQUENCY_SUBSET';
  interval: '1s';
  intervalMs: 1000;
  bucketLabelField: 'timestamp';
  gridBoundary: '[from, to)';
  signals: readonly DiV0R1ObdSignalSpecification[];
}

export const DI_V0_R1_OBD_QUERY_SPEC_V0_1: DiV0R1ObdQuerySpecification = {
  id: 'DI_V0_R1_OBD_QUERY_V0_1',
  provider: 'DIMO_SIGNALS',
  queryFamily: 'HIGH_FREQUENCY_SUBSET',
  interval: '1s',
  intervalMs: 1000,
  bucketLabelField: 'timestamp',
  gridBoundary: '[from, to)',
  signals: [
    { id: 'speed', providerField: 'speed', unit: 'km/h', aggregation: 'AVG' },
    { id: 'powertrainCombustionEngineSpeed', providerField: 'powertrainCombustionEngineSpeed', unit: 'rpm', aggregation: 'AVG' },
    { id: 'obdThrottlePosition', providerField: 'obdThrottlePosition', unit: '%', aggregation: 'AVG' },
    { id: 'obdEngineLoad', providerField: 'obdEngineLoad', unit: '%', aggregation: 'AVG' },
    { id: 'powertrainCombustionEngineECT', providerField: 'powertrainCombustionEngineECT', unit: '°C', aggregation: 'AVG' },
    { id: 'powertrainTransmissionCurrentGear', providerField: 'powertrainTransmissionCurrentGear', unit: 'gear', aggregation: 'AVG' },
    { id: 'isIgnitionOn', providerField: 'isIgnitionOn', unit: 'boolean_avg', aggregation: 'AVG' },
  ],
};
