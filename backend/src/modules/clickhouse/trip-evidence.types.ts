/**
 * Read-only ClickHouse trip evidence DTO — analytics mirror only.
 * Never a canonical trip score or misuse decision.
 */

import type {
  TripDetectorFeasibilityHint,
  TripSignalQualityLevel,
} from './clickhouse-hf.types';

export type ClickHouseEvidenceStatus =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'mirror_disabled';

export type TripEvidenceGpsCoverage = 'available' | 'sparse' | 'missing';

export interface TripSignalAvailabilityEvidence {
  rpm: boolean;
  throttle: boolean;
  engineLoad: boolean;
  coolant: boolean;
  tractionPower: boolean;
}

/** Optional block on GET /vehicles/:id/trips/:tripId — backward-compatible. */
export interface TripClickHouseEvidenceDto {
  evidenceAvailable: boolean;
  clickhouseStatus: ClickHouseEvidenceStatus;
  readOnly: true;
  signalQuality: TripSignalQualityLevel;
  hfAvailability: 'hf_available' | 'sparse' | 'missing' | 'unknown';
  snapshotSampleCount: number | null;
  hfPointCount: number;
  hfEventCount: number;
  hfWindowCount: number;
  gpsCoverage: TripEvidenceGpsCoverage;
  signalAvailability: TripSignalAvailabilityEvidence;
  missingSignals: string[];
  /** Human-readable evidence bullets — not scores. */
  evidenceSummary: string[];
  detectorFeasibility: TripDetectorFeasibilityHint[];
  lastEvidenceAt: string | null;
  degraded: boolean;
  debugReason?: string | null;
}
