/** S3A adapter binding (C1D.7). Bump when normalization semantics change. */
export const DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1 = 'DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1';

/** Canonical serialization + hash contract for `inputEvidenceVersion`. */
export const DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 = 'DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1';

/**
 * Frozen historical position query specification.
 *
 * `interval: "1s"` is a one-second query bucket. The row `timestamp` is a bucket label,
 * not a proven physical observation time. `AVG` matches the EXP-021 historical query family
 * (`field(agg: AVG)`); when a bucket aggregates more than one source sample the returned
 * coordinate may not equal any single observed sample.
 */
export const DI_V0_POSITION_QUERY_SPEC_V0_1 = {
  id: 'DIMO_SIGNALS_HISTORICAL_LOCATION_1S_AVG_V0_1',
  provider: 'DIMO',
  queryFamily: 'TELEMETRY_SIGNALS_HISTORICAL',
  signal: 'currentLocationCoordinates',
  interval: '1s',
  intervalMs: 1000,
  coordinateAggregation: 'AVG',
  bucketLabelField: 'timestamp',
  gridBoundary: 'FROM_INCLUSIVE_TO_EXCLUSIVE',
} as const;

export type DiV0PositionQuerySpecification = typeof DI_V0_POSITION_QUERY_SPEC_V0_1;

/**
 * Defensive structural bound on one acquisition window (memory / single-response size).
 * Not a calibrated production limit; callers may pass a different bound explicitly.
 */
export const DI_V0_POSITION_DEFAULT_MAX_WINDOW_SECONDS = 12 * 60 * 60;
