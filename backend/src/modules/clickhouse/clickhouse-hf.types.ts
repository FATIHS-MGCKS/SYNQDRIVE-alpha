/**
 * High-Frequency (HF) telemetry types — ClickHouse analytics mirror only.
 *
 * These types are intentionally framework-free (no Prisma, no Nest imports)
 * so they can be shared by the ClickHouse HF ingestion service and the
 * data-analyse layer without creating circular imports.
 *
 * PostgreSQL stays the canonical truth; HF data is an analytics mirror.
 */

export type HfSignalGroup =
  | 'gps'
  | 'speed'
  | 'powertrain'
  | 'battery'
  | 'charging'
  | 'brake'
  | 'tire'
  | 'environment'
  | 'unknown';

export type HfSignalQuality = 'raw' | 'normalized' | 'estimated' | 'invalid';

export type HfEventSeverity = 'info' | 'watch' | 'warning' | 'critical';

export type HfEventConfidence = 'low' | 'medium' | 'high';

/** Known HF event types (string-typed for forward compatibility). */
export type HfEventType =
  | 'HARSH_ACCELERATION'
  | 'HARSH_BRAKING'
  | 'LAUNCH_LIKE_START'
  | 'SPEED_SPIKE'
  | 'GPS_GAP'
  | 'SIGNAL_GAP'
  | 'CHARGING_SESSION_SIGNAL'
  | (string & {});

/** A single normalized HF signal point (maps to telemetry_hf_points). */
export interface HfSignalPoint {
  orgId: string;
  vehicleId: string;
  tokenId: number;
  /** Origin of the signal, e.g. 'dimo'. */
  source: string;
  signalName: string;
  signalGroup: HfSignalGroup;
  recordedAt: Date;
  valueFloat?: number | null;
  valueInt?: number | null;
  valueBool?: boolean | null;
  valueString?: string | null;
  unit?: string | null;
  quality: HfSignalQuality;
  requestId?: string | null;
  tripId?: string | null;
  bookingId?: string | null;
}

/** An aggregated HF window summary (maps to telemetry_hf_windows). */
export interface HfWindowSummary {
  orgId: string;
  vehicleId: string;
  windowStart: Date;
  windowEnd: Date;
  signalGroup: HfSignalGroup;
  pointCount: number;
  sampleIntervalMinMs?: number | null;
  sampleIntervalMaxMs?: number | null;
  sampleIntervalAvgMs?: number | null;
  maxSpeedKmh?: number | null;
  maxAccelMps2?: number | null;
  minAccelMps2?: number | null;
  maxTractionKw?: number | null;
  minTractionKw?: number | null;
  socDeltaPct?: number | null;
  gpsPointCount: number;
  missingGapCount: number;
  largestGapMs?: number | null;
}

/** A derived HF event (maps to telemetry_hf_events). */
export interface HfDerivedEvent {
  orgId: string;
  vehicleId: string;
  eventType: HfEventType;
  severity: HfEventSeverity;
  eventStart: Date;
  eventEnd?: Date | null;
  durationMs?: number | null;
  confidence: HfEventConfidence;
  primaryValue?: number | null;
  primaryUnit?: string | null;
  /** JSON-serialized evidence payload (never raw secrets). */
  evidenceJson: string;
  tripId?: string | null;
  bookingId?: string | null;
}

// ── Query result shapes (read side) ─────────────────────────────────────────

export interface HfAvailabilitySummary {
  available: boolean;
  vehicleId: string;
  from: string;
  to: string;
  pointCount: number;
  earliestPointAt: string | null;
  latestPointAt: string | null;
  signalGroups: string[];
  /** Set when ClickHouse is disabled/unreachable or the query failed. */
  degradedReason?: string | null;
}

export interface HfSignalFrequencyRow {
  signalName: string;
  signalGroup: string;
  pointCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  avgIntervalMs: number | null;
}

export interface HfSignalFrequencySummary {
  available: boolean;
  vehicleId: string;
  from: string;
  to: string;
  signals: HfSignalFrequencyRow[];
  degradedReason?: string | null;
}

export interface HfEventRow {
  eventType: string;
  severity: string;
  eventStart: string;
  eventEnd: string | null;
  durationMs: number | null;
  confidence: string;
  primaryValue: number | null;
  primaryUnit: string | null;
  tripId: string | null;
  bookingId: string | null;
}

export interface HfRecentEventsResult {
  available: boolean;
  vehicleId: string;
  from: string;
  to: string;
  events: HfEventRow[];
  degradedReason?: string | null;
}
