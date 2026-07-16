export const DIMO_RECHARGE_SEGMENT_MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
export const DIMO_RECHARGE_SEGMENT_DEFAULT_PAGE_LIMIT = 50;
export const DIMO_RECHARGE_SEGMENT_MAX_PAGES = 200;

export type DimoRechargeSegmentAggregation = 'MIN' | 'MAX' | 'LAST';

export interface DimoRechargeSegmentQueryWindow {
  from: Date;
  to: Date;
}

export interface DimoRechargeSegmentFetchOptions {
  /** Optional provider source filter (e.g. `tesla`). Omitted when unsupported. */
  sourceFilter?: string | null;
  pageLimit?: number;
  includeOngoing?: boolean;
  maxPagesPerWindow?: number;
}

export interface DimoRechargeSegmentTenantContext {
  organizationId: string;
  vehicleId: string;
}

export interface DimoRechargeSegmentLocation {
  latitude: number | null;
  longitude: number | null;
}

export interface DimoRechargeSegmentNumericAggregate {
  min: number | null;
  max: number | null;
  delta: number | null;
}

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
  /** Stable SynqDrive id — provider id when present, otherwise fingerprint. */
  segmentId: string;
  /** DIMO provider segment id when returned by API. */
  providerSegmentId: string | null;
  /** Deterministic fallback id from tokenId + startAt. */
  fingerprint: string;
  tokenId: number;
  startAt: string;
  endAt: string | null;
  ongoing: boolean;
  startedBeforeRange: boolean;
  durationSeconds: number;
  startLocation: DimoRechargeSegmentLocation;
  endLocation: DimoRechargeSegmentLocation;
  soc: DimoRechargeSegmentNumericAggregate;
  currentEnergyKwh: DimoRechargeSegmentNumericAggregate;
  addedEnergyKwh: DimoRechargeSegmentNumericAggregate;
  isCharging: DimoRechargeSegmentBooleanAggregate;
  cableConnected: DimoRechargeSegmentBooleanAggregate;
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
  pagesFetched: number;
  sourceFilterApplied: string | null;
  sourceFilterDropped: boolean;
  retries: number;
  truncated: boolean;
}

export interface DimoRechargeSegmentFetchResult {
  segments: NormalizedDimoRechargeSegment[];
  meta: DimoRechargeSegmentFetchMeta;
}

export interface DimoRechargeSegmentGraphQLPage {
  segments: unknown[];
  errors?: Array<{ message?: string }>;
}
