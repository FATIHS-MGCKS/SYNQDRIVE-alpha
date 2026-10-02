/**
 * EXP-021 C0.3 — R1 temporal containment for Event Context Assessments.
 *
 * For Ruptela R1 the HF context window is built from historical OBD records whose
 * row labels are query-grid bucket starts and whose underlying record time is
 * misdated by seconds to tens of seconds. Anchor-relative point-in-time values
 * ("nearest sample 0 ms from the anchor", "value just before/after the event",
 * provider delay at the anchor) are therefore not defensible.
 *
 * Containment keeps window-level aggregates (min/max/avg/coverage) and marks the
 * assessment as time-uncertain: anchor-relative fields are nulled and confidence
 * is capped at LOW. Status, classifications and evidence grade are left unchanged
 * so the view stays consistent with persisted misuse evidence snapshots.
 *
 * Applied at the presentation boundary only. The persisted assessment is the raw
 * diagnostic record consumed by misuse rules, whose R1 escalation is contained in
 * the misuse rating layer instead. Pure; never mutates its input.
 */
import {
  hasUncertainHistoricalObdRecordTime,
  type TelemetrySourceFamily,
} from '../telemetry-source-family';
import {
  R1_OBD_RECORD_TIME_UNCERTAIN,
  R1_TEMPORAL_CONTAINMENT_VERSION,
} from '../r1-temporal-containment';

export interface ContextTemporalContainmentMarker {
  version: typeof R1_TEMPORAL_CONTAINMENT_VERSION;
  reason: typeof R1_OBD_RECORD_TIME_UNCERTAIN;
}

export const R1_CONTEXT_TEMPORAL_CONTAINMENT: ContextTemporalContainmentMarker = {
  version: R1_TEMPORAL_CONTAINMENT_VERSION,
  reason: R1_OBD_RECORD_TIME_UNCERTAIN,
};

const SIGNAL_CONTEXT_KEYS = [
  'speedContext',
  'rpmContext',
  'throttleContext',
  'engineLoadContext',
  'coolantContext',
] as const;

const ANCHOR_RELATIVE_SIGNAL_FIELDS = [
  'nearestValueToAnchor',
  'nearestSampleDistanceMs',
  'valueBeforeAnchor',
  'valueAfterAnchor',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function capConfidence(value: unknown): unknown {
  return value === 'HIGH' || value === 'MEDIUM' ? 'LOW' : value;
}

export function isTemporallyContainedContextAssessment(raw: unknown): boolean {
  return isRecord(raw) && isRecord(raw.temporalContainment);
}

/**
 * Apply R1 temporal containment to a context assessment (typed or persisted JSON).
 * Non-object input and already-contained assessments are returned unchanged.
 */
export function applyR1ContextTemporalContainment<T>(assessment: T): T {
  if (!isRecord(assessment) || isTemporallyContainedContextAssessment(assessment)) {
    return assessment;
  }
  const out: Record<string, unknown> = { ...assessment };

  for (const key of SIGNAL_CONTEXT_KEYS) {
    const stats = out[key];
    if (!isRecord(stats)) continue;
    const contained: Record<string, unknown> = { ...stats };
    for (const field of ANCHOR_RELATIVE_SIGNAL_FIELDS) {
      if (field in contained) contained[field] = null;
    }
    out[key] = contained;
  }

  if (isRecord(out.dataQuality)) {
    out.dataQuality = { ...out.dataQuality, nearestSampleToAnchorMs: null };
  }

  if (isRecord(out.contextQuality)) {
    out.contextQuality = {
      ...out.contextQuality,
      providerDelayMs: null,
      contextConfidence: capConfidence(out.contextQuality.contextConfidence),
    };
  }

  if ('confidence' in out) out.confidence = capConfidence(out.confidence);
  out.temporalContainment = { ...R1_CONTEXT_TEMPORAL_CONTAINMENT };

  return out as T;
}

/** Applies containment only when the source family has uncertain OBD record time. */
export function containContextAssessmentForSourceFamily<T>(
  assessment: T,
  family: TelemetrySourceFamily,
): T {
  return hasUncertainHistoricalObdRecordTime(family)
    ? applyR1ContextTemporalContainment(assessment)
    : assessment;
}
