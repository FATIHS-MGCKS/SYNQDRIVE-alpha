export const DIMO_RECHARGE_SEGMENT_MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

/** @deprecated Pagination is unsupported on live DIMO Segment API (E1). */
export const DIMO_RECHARGE_SEGMENT_DEFAULT_PAGE_LIMIT = 50;
/** @deprecated Pagination is unsupported on live DIMO Segment API (E1). */
export const DIMO_RECHARGE_SEGMENT_MAX_PAGES = 200;

export type DimoRechargeSegmentFetchStatus = 'SUCCESS' | 'FAILED';

export interface DimoRechargeSegmentFetchError {
  message: string;
  httpStatus?: number;
  retryable: boolean;
  graphqlErrors?: Array<{ message?: string }>;
}

export type DimoRechargeSegmentAggregation = 'MIN' | 'MAX' | 'LAST';

export interface DimoRechargeSegmentQueryWindow {
  from: Date;
  to: Date;
}

export interface DimoRechargeSegmentFetchOptions {
  /** Optional provider source filter (e.g. `tesla`). Omitted when unsupported. */
  sourceFilter?: string | null;
  /**
   * @deprecated No supported DIMO GraphQL filter for ongoing-only segments (E2).
   * Ignored by {@link DimoRechargeSegmentsClient}.
   */
  includeOngoing?: boolean;
}

export interface DimoRechargeSegmentTenantContext {
  organizationId: string;
  vehicleId: string;
}

export interface DimoRechargeSegmentLocation {
  latitude: number | null;
  longitude: number | null;
}

export type DimoRechargeNumericProvenance = 'SEGMENT_EXTREMA' | 'UNKNOWN';

export type DimoRechargeDurationProvenance =
  | 'PROVIDER_DURATION'
  | 'DERIVED_BOUNDARY_DURATION'
  | 'UNKNOWN_ONGOING'
  | 'UNKNOWN';

export interface DimoRechargeSegmentNumericAggregate {
  min: number | null;
  max: number | null;
  delta: number | null;
  provenance: DimoRechargeNumericProvenance;
}

export interface DimoRechargeSegmentBooleanEvidence {
  anyTrue: boolean | null;
  allTrue: boolean | null;
  /**
   * Legacy MIN/MAX extrema as 0/1 — not temporal start/end (E2).
   * Retained for legacy VehicleEnergyEvent mapping only.
   */
  legacyMin01: number | null;
  legacyMax01: number | null;
}

/** @deprecated Use {@link DimoRechargeSegmentBooleanEvidence} */
export interface DimoRechargeSegmentBooleanAggregate {
  start: boolean | null;
  end: boolean | null;
}

export interface DimoRechargeSegmentSignalRow {
  signalName: string;
  aggregation: DimoRechargeSegmentAggregation | string;
  value: number | null;
}

export interface NormalizedDimoRechargeSegment {
  /** Canonical ingest id — always {@link fingerprint} (never provider-only). */
  segmentId: string;
  /** DIMO provider segment id when returned by API (synthetic/future only). */
  providerSegmentId: string | null;
  /** Deterministic physical ingest identity from tokenId + canonical startAt. */
  fingerprint: string;
  tokenId: number;
  startAt: string;
  endAt: string | null;
  ongoing: boolean;
  startedBeforeRange: boolean;
  durationSeconds: number | null;
  durationProvenance: DimoRechargeDurationProvenance;
  startLocation: DimoRechargeSegmentLocation;
  endLocation: DimoRechargeSegmentLocation;
  soc: DimoRechargeSegmentNumericAggregate;
  currentEnergyKwh: DimoRechargeSegmentNumericAggregate;
  addedEnergyKwh: DimoRechargeSegmentNumericAggregate;
  isCharging: DimoRechargeSegmentBooleanEvidence;
  cableConnected: DimoRechargeSegmentBooleanEvidence;
  /** @deprecated Legacy alias — maps legacyMin01/legacyMax01 to booleans for VEE path. */
  isChargingLegacy: DimoRechargeSegmentBooleanAggregate;
  /** @deprecated Legacy alias — maps legacyMin01/legacyMax01 to booleans for VEE path. */
  cableConnectedLegacy: DimoRechargeSegmentBooleanAggregate;
  odometerKm: DimoRechargeSegmentNumericAggregate;
  signalRows: DimoRechargeSegmentSignalRow[];
  sourceTimestamps: {
    segmentStartAt: string;
    segmentEndAt: string | null;
  };
}

export interface DimoRechargeSegmentFetchMeta {
  tokenId: number;
  requestedFrom: string;
  requestedTo: string;
  windowsQueried: number;
  queriesExecuted: number;
  sourceFilterApplied: string | null;
  sourceFilterDropped: boolean;
  retries: number;
  status: DimoRechargeSegmentFetchStatus;
}

export interface DimoRechargeSegmentFetchResult {
  segments: NormalizedDimoRechargeSegment[];
  meta: DimoRechargeSegmentFetchMeta;
  error?: DimoRechargeSegmentFetchError;
}

export interface DimoRechargeSegmentGraphQLPage {
  segments: unknown[];
  errors?: Array<{ message?: string }>;
}
