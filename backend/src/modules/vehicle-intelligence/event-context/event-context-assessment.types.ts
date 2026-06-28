/**
 * SynqDrive — Event Context Assessment payload types (LTE_R1 groundwork, Phase 2)
 *
 * Runtime shapes produced by the EventContextEnrichmentService around an anchor
 * (native DIMO behavior event or — later — an RPM webhook candidate). These build
 * on the vocabulary in `event-context.types.ts` and are persisted (for native
 * events) into `DrivingEvent.metadataJson.contextAssessment`.
 *
 * No detection logic here — these are descriptive/diagnostic structures.
 */

import type {
  AnchorType,
  ContextClassification,
  ContextConfidence,
  ContextReasonCode,
  ContextWindowDataQuality,
  EngineContextSignal,
  EvidenceGrade,
  SignalCoverage,
} from './event-context.types';

/** Schema version of the persisted context assessment payload. */
export const CONTEXT_ASSESSMENT_VERSION = 1;

/**
 * High-level category of the native behaviour event a context window is anchored
 * on. Drives behaviour-specific classification (accel vs braking vs cornering).
 */
export type AnchorEventCategory = 'ACCELERATION' | 'BRAKING' | 'CORNERING' | 'OTHER';

/**
 * Minimal description of the anchoring native event, passed into the classifier so
 * it can reason about the event semantics (e.g. "aggressive start" only makes
 * sense for an acceleration event). Optional — RPM webhook candidates have none.
 */
export interface AnchorEventInfo {
  category: AnchorEventCategory;
  /** True when DIMO classified the event as extreme (vs normal harsh). */
  extreme: boolean;
  /** Original SynqDrive DrivingEventType, for transparency. */
  eventType?: string;
}

/**
 * Outcome status of a single context-enrichment run.
 *   - COMPLETED              : window fetched and assessed.
 *   - INSUFFICIENT_CONTEXT   : fetched but too little/sparse data to assess.
 *   - FAILED                 : signal fetch failed (native event stays intact).
 *   - SKIPPED_NOT_APPLICABLE : powertrain/hardware not eligible (e.g. Tesla/EV).
 */
export type EventContextStatus =
  | 'COMPLETED'
  | 'INSUFFICIENT_CONTEXT'
  | 'FAILED'
  | 'SKIPPED_NOT_APPLICABLE';

/** Per-signal statistics over a context window. */
export interface ContextSignalStats {
  signal: EngineContextSignal;
  /** Total readings in the window (same for every signal). */
  count: number;
  /** Readings where this signal is non-null. */
  nonNullCount: number;
  firstValue: number | null;
  lastValue: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  /** Nearest non-null value to the anchor timestamp. */
  nearestValueToAnchor: number | null;
  /** Distance (ms) from anchor to the nearest non-null sample of this signal. */
  nearestSampleDistanceMs: number | null;
  /** Last non-null value at or before the anchor (pre-event framing). */
  valueBeforeAnchor: number | null;
  /** First non-null value at or after the anchor (post-event framing). */
  valueAfterAnchor: number | null;
  /** Inter-sample interval stats computed on this signal's non-null timestamps. */
  medianIntervalMs: number | null;
  p95IntervalMs: number | null;
  maxGapMs: number | null;
  gapsOver2s: number;
  gapsOver5s: number;
  gapsOver10s: number;
  coverageQuality: SignalCoverage['quality'];
}

/**
 * Full context assessment payload. Persisted under
 * `DrivingEvent.metadataJson.contextAssessment` for native events.
 */
export interface EventContextAssessment {
  version: number;
  status: EventContextStatus;
  anchorType: AnchorType;
  /** The native event the window is anchored on (absent for RPM candidates). */
  anchorEvent?: AnchorEventInfo | null;
  /** ISO timestamps. */
  anchorTimestamp: string;
  windowStart: string;
  windowEnd: string;
  /** Whether ICE engine signals are applicable for this vehicle (false for EV). */
  engineSignalsApplicable: boolean;
  /** Best-effort engine-on hint derived from RPM (no dedicated ignition in HF). */
  engineOnHint: boolean | null;
  dataQuality: ContextWindowDataQuality;
  signalCoverage: SignalCoverage[];
  speedContext: ContextSignalStats;
  rpmContext: ContextSignalStats;
  throttleContext: ContextSignalStats;
  engineLoadContext: ContextSignalStats;
  coolantContext: ContextSignalStats;
  reasonCodes: ContextReasonCode[];
  /** Conservative, preliminary context classifications — NOT misuse cases. */
  preliminaryClassifications: ContextClassification[];
  confidence: ContextConfidence;
  evidenceGrade: EvidenceGrade;
  generatedAt: string;
  /** Populated when status = FAILED. */
  error?: string | null;
}
