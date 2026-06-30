/**
 * SynqDrive — LTE_R1 Event / Trigger Context Foundation (V4.10 groundwork)
 *
 * Central, read-only type vocabulary for the new LTE_R1 Misuse/Event architecture.
 * This file declares NAMES and SHAPES only. It contains NO detection logic, NO
 * thresholds, and is NOT wired into any pipeline yet. Importing it cannot change
 * any misuse result.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Why this exists — reframing of the legacy "Post-Trip HF Abuse Detection"
 * ──────────────────────────────────────────────────────────────────────────────
 * DIMO `signals(... interval:"1s")` *requests* 1-second buckets, but for LTE_R1
 * vehicles it frequently returns only SPARSE whole-trip telemetry (observed
 * median ~3–6 s, P95 ~21 s, multi-second gaps). Whole-trip sparse HF is therefore
 * NOT a trustworthy basis for short-lived "abuse moment" detection.
 *
 * The legacy whole-trip HF pass is reframed as **Trip Signal Summary Enrichment**:
 * a descriptive summary of a trip (speed summary, signal cadence, data quality,
 * signal coverage, detector feasibility, trip assessment status) — NOT a primary
 * short-event misuse detector.
 *
 * The LTE_R1 architecture anchors misuse classification on discrete,
 * trustworthy triggers — native DIMO `behavior.*` events only. DIMO Developer
 * Console does NOT offer RPM/throttle/engine-load webhooks; there is no RPM
 * webhook intake path. Context enrichment uses HF signals (incl. RPM) around
 * those native anchors where the powertrain and signal quality allow it.
 *
 * Target layers (this file underpins layers 3–6):
 *   1. LTE_R1 Native Event Intake
 *   2. Event / Trigger Context Enrichment (native anchors only)
 *   3. Context Classification Engine
 *   4. Misuse Case Aggregation
 *   5. UI / Data Analyse Evidence Layer
 *
 * Tesla/EV is intentionally out of scope here and handled separately later.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Reframing label (Trip Signal Summary Enrichment)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Canonical reframing descriptor for the legacy whole-trip HF pass. Use this for
 * labels/copy so the whole-trip HF summary is never presented as aggressive,
 * short-event "abuse detection". Purely descriptive.
 */
export const TRIP_SIGNAL_SUMMARY_ENRICHMENT = {
  key: 'TRIP_SIGNAL_SUMMARY_ENRICHMENT',
  label: 'Trip Signal Summary Enrichment',
  /** What the whole-trip HF pass legitimately produces. */
  purpose: [
    'speed summary',
    'signal cadence',
    'data quality',
    'signal coverage',
    'detector feasibility',
    'trip assessment status',
  ],
  description:
    'Descriptive per-trip signal summary (speed, cadence, data quality, signal ' +
    'coverage, detector feasibility, trip assessment status). It is NOT a primary ' +
    'short-event misuse detector and must not claim aggressive misuse from sparse ' +
    'whole-trip high-frequency data.',
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Anchor types — what a context window is built around (layers 1–3)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The trustworthy trigger a context window is anchored on. Context is enriched
 * AROUND an anchor; anchors are never invented from sparse whole-trip HF.
 *   - DIMO_NATIVE_BEHAVIOR_EVENT : a native DIMO `behavior.*` event (LTE_R1).
 */
export type AnchorType = 'DIMO_NATIVE_BEHAVIOR_EVENT';

export const ANCHOR_TYPES: readonly AnchorType[] = [
  'DIMO_NATIVE_BEHAVIOR_EVENT',
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Context classification (layer 4)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Classification a context-enrichment engine MAY assign to a native DIMO behavior
 * anchor window. `*_CANDIDATE` / `*_LIKELY` encode conservative confidence.
 * `INSUFFICIENT_CONTEXT` is the honest fallback when the window cannot be evaluated.
 *
 * RPM-related entries (REV_IN_IDLE_*, HIGH_RPM_*, COLD_ENGINE_HIGH_RPM) describe
 * engine signal patterns in the ±30s window around a native event — NOT DIMO
 * webhook triggers. See `FUTURE_ONLY_CONTEXT_CLASSIFICATIONS` for values kept in
 * the union but not currently emitted by the classifier.
 */
export type ContextClassification =
  | 'AGGRESSIVE_START'
  | 'LAUNCH_LIKE_START'
  | 'KICKDOWN_LIKELY'
  | 'FULL_THROTTLE_LIKELY'
  | 'OVERTAKING_LIKELY'
  | 'COLD_ENGINE_ACCELERATION'
  | 'COLD_ENGINE_KICKDOWN'
  | 'HIGH_LOAD_ACCELERATION'
  | 'REV_IN_IDLE_CANDIDATE'
  | 'REV_IN_IDLE_CONFIRMED'
  | 'HIGH_RPM_SPIKE'
  | 'HIGH_RPM_CONSTANT'
  | 'COLD_ENGINE_HIGH_RPM'
  | 'HIGH_RPM_UNDER_LOAD'
  | 'OVERHEATING_RISK'
  | 'EMERGENCY_LIKE_BRAKING'
  | 'INSUFFICIENT_CONTEXT';

/** Classifications the live classifier may emit today (native DIMO anchors only). */
export const CONTEXT_CLASSIFICATIONS: readonly ContextClassification[] = [
  'AGGRESSIVE_START',
  'LAUNCH_LIKE_START',
  'KICKDOWN_LIKELY',
  'FULL_THROTTLE_LIKELY',
  'OVERTAKING_LIKELY',
  'COLD_ENGINE_ACCELERATION',
  'COLD_ENGINE_KICKDOWN',
  'HIGH_LOAD_ACCELERATION',
  'REV_IN_IDLE_CANDIDATE',
  'HIGH_RPM_SPIKE',
  'HIGH_RPM_CONSTANT',
  'COLD_ENGINE_HIGH_RPM',
  'OVERHEATING_RISK',
  'EMERGENCY_LIKE_BRAKING',
  'INSUFFICIENT_CONTEXT',
] as const;

/**
 * Inactive / future-only classification names — NOT produced by DIMO webhook intake
 * and NOT emitted by the current native-event classifier. Kept on the type union for
 * forward compatibility and historical persisted assessments only.
 */
export const FUTURE_ONLY_CONTEXT_CLASSIFICATIONS: readonly ContextClassification[] = [
  'REV_IN_IDLE_CONFIRMED',
  'HIGH_RPM_UNDER_LOAD',
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Evidence grade + confidence (layers 4 & 6)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Evidence grade for a classified context window — how strong the supporting
 * signal evidence is, independent of severity.
 *   A — anchor + dense, complete supporting signals.
 *   B — anchor + partial supporting signals.
 *   C — anchor only / sparse supporting signals.
 *   D — anchor present but context not evaluable (kept for transparency).
 */
export type EvidenceGrade = 'A' | 'B' | 'C' | 'D';

export const EVIDENCE_GRADES: readonly EvidenceGrade[] = ['A', 'B', 'C', 'D'] as const;

/**
 * Confidence in a context classification.
 * NOTE: distinct from Prisma `MisuseCaseConfidence` (LOW|MEDIUM|HIGH). This adds
 * an explicit `INSUFFICIENT` state for un-evaluable windows. Mapping to the
 * persisted misuse confidence is intentionally left to a later layer.
 */
export type ContextConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

export const CONTEXT_CONFIDENCES: readonly ContextConfidence[] = [
  'HIGH',
  'MEDIUM',
  'LOW',
  'INSUFFICIENT',
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Reason codes (layers 3–6) — explainability for a context decision
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Machine-readable reason codes that explain WHY a context window received its
 * classification/confidence. Multiple codes may apply to one window. Designed for
 * transparent UI evidence rendering, never for silent suppression.
 */
export type ContextReasonCode =
  | 'NATIVE_EVENT_ANCHOR'
  | 'SPARSE_SIGNAL_CADENCE'
  | 'MISSING_RPM'
  | 'MISSING_SPEED'
  | 'MISSING_THROTTLE'
  | 'MISSING_ENGINE_LOAD'
  | 'MISSING_COOLANT'
  | 'COLD_ENGINE'
  | 'WARM_ENGINE'
  | 'HIGH_RPM'
  | 'HIGH_THROTTLE'
  | 'HIGH_ENGINE_LOAD'
  | 'STANDSTILL_BEFORE_EVENT'
  | 'MOVING_BEFORE_EVENT'
  | 'NOT_APPLICABLE_POWERTRAIN';

export const CONTEXT_REASON_CODES: readonly ContextReasonCode[] = [
  'NATIVE_EVENT_ANCHOR',
  'SPARSE_SIGNAL_CADENCE',
  'MISSING_RPM',
  'MISSING_SPEED',
  'MISSING_THROTTLE',
  'MISSING_ENGINE_LOAD',
  'MISSING_COOLANT',
  'COLD_ENGINE',
  'WARM_ENGINE',
  'HIGH_RPM',
  'HIGH_THROTTLE',
  'HIGH_ENGINE_LOAD',
  'STANDSTILL_BEFORE_EVENT',
  'MOVING_BEFORE_EVENT',
  'NOT_APPLICABLE_POWERTRAIN',
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Data-quality semantics (layers 3 & 6)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Engine-context signals relevant to LTE_R1/ICE classification. `speed` is always
 * part of the HF stream; the remaining four require a combustion engine.
 */
export type EngineContextSignal =
  | 'speed'
  | 'rpm'
  | 'throttle'
  | 'engineLoad'
  | 'coolant';

export const ENGINE_CONTEXT_SIGNALS: readonly EngineContextSignal[] = [
  'speed',
  'rpm',
  'throttle',
  'engineLoad',
  'coolant',
] as const;

/**
 * Per-signal coverage quality within a context window.
 *   GOOD           — enough non-null samples at acceptable cadence.
 *   SPARSE         — present but too sparse/gappy to rely on.
 *   MISSING        — applicable to this powertrain but absent in the window.
 *   NOT_APPLICABLE — physically impossible for this powertrain (e.g. RPM on a BEV).
 */
export type SignalCoverageQuality = 'GOOD' | 'SPARSE' | 'MISSING' | 'NOT_APPLICABLE';

export const SIGNAL_COVERAGE_QUALITIES: readonly SignalCoverageQuality[] = [
  'GOOD',
  'SPARSE',
  'MISSING',
  'NOT_APPLICABLE',
] as const;

/** Coverage assessment for a single signal inside a context window. */
export interface SignalCoverage {
  signal: EngineContextSignal;
  /** Number of non-null samples of this signal in the window. */
  nonNullCount: number;
  quality: SignalCoverageQuality;
}

/**
 * Quantitative data-quality assessment of a single anchored context window.
 * Foundation shape for layer 3/6 — populated later, no computation here.
 */
export interface ContextWindowDataQuality {
  /** Total samples in the context window (all signals, by timestamp). */
  sampleCount: number;
  /** Median inter-sample interval (ms), or null when not computable. */
  medianIntervalMs: number | null;
  /** P95 inter-sample interval (ms), or null when not computable. */
  p95IntervalMs: number | null;
  /** Largest gap between consecutive samples (ms), or null. */
  maxGapMs: number | null;
  /** Distance (ms) from the anchor timestamp to the nearest sample, or null. */
  nearestSampleToAnchorMs: number | null;
  /** Per-signal coverage assessment. */
  coverage: SignalCoverage[];
}
