/**
 * SynqDrive — Event Context quality block (P27).
 *
 * Traceable, UI-ready quality metadata for a context assessment. The HF query
 * requests `interval:"1s"` buckets — effective cadence is always derived from
 * observed sample timestamps and must never be conflated with a true 1 Hz grid.
 */
import type { ContextConfidence, EngineContextSignal } from './event-context.types';
import type { ContextWindowDataQuality } from './event-context.types';
import type { SignalCoverage } from './event-context.types';
import type { EventContextStatus } from './event-context-assessment.types';
import {
  COVERAGE_GOOD_MIN_SAMPLES,
  SPARSE_CADENCE_MEDIAN_MS,
} from './event-context-stats';

/** HF GraphQL query requests this bucket — NOT the observed sample cadence. */
export const HF_REQUESTED_INTERVAL = '1s' as const;

/** Tolerance: effective cadence within this band of 1s may be labelled ~1 Hz. */
export const EFFECTIVE_1HZ_TOLERANCE_MS = 1_500;

/**
 * UI-ready quality reason codes — explain degradation without misuse logic.
 * Frontend mirrors labels in `event-context-ui.ts`.
 */
export type ContextQualityReasonCode =
  | 'HF_INTERVAL_REQUESTED_NOT_EFFECTIVE'
  | 'EFFECTIVE_CADENCE_SPARSE'
  | 'EFFECTIVE_CADENCE_INSUFFICIENT'
  | 'LOW_SAMPLE_COUNT'
  | 'WINDOW_GAPS'
  | 'MISSING_ENGINE_SIGNALS'
  | 'PROVIDER_SAMPLE_DELAY'
  | 'NATIVE_EVENT_ANCHOR_PRESERVED'
  | 'CONTEXT_SIGNALS_EXPLAIN_ONLY';

export const CONTEXT_QUALITY_REASON_CODES: readonly ContextQualityReasonCode[] = [
  'HF_INTERVAL_REQUESTED_NOT_EFFECTIVE',
  'EFFECTIVE_CADENCE_SPARSE',
  'EFFECTIVE_CADENCE_INSUFFICIENT',
  'LOW_SAMPLE_COUNT',
  'WINDOW_GAPS',
  'MISSING_ENGINE_SIGNALS',
  'PROVIDER_SAMPLE_DELAY',
  'NATIVE_EVENT_ANCHOR_PRESERVED',
  'CONTEXT_SIGNALS_EXPLAIN_ONLY',
] as const;

/** German UI labels for quality reasons (backend reference; mirrored in frontend). */
export const CONTEXT_QUALITY_REASON_LABELS: Record<ContextQualityReasonCode, string> = {
  HF_INTERVAL_REQUESTED_NOT_EFFECTIVE:
    'Angefordertes 1s-Intervall — effektive Kadenz weicht ab (kein echtes 1 Hz)',
  EFFECTIVE_CADENCE_SPARSE: 'Effektive Kadenz dünn — Kontext nur eingeschränkt belastbar',
  EFFECTIVE_CADENCE_INSUFFICIENT:
    'Effektive Kadenz zu gering — Kontext nicht zuverlässig bewertbar',
  LOW_SAMPLE_COUNT: 'Zu wenige Messpunkte im Kontextfenster',
  WINDOW_GAPS: 'Lücken im Signalfenster',
  MISSING_ENGINE_SIGNALS: 'Fehlende Motorsignale im Fenster',
  PROVIDER_SAMPLE_DELAY: 'Verzögerung bis zum nächsten Provider-Sample am Anker',
  NATIVE_EVENT_ANCHOR_PRESERVED:
    'Natives DIMO-Ereignis bleibt Anker — Kontextsignale ersetzen es nicht',
  CONTEXT_SIGNALS_EXPLAIN_ONLY:
    'Kontextsignale erklären das Ereignis, ersetzen aber nicht den Provider-Trigger',
};

export interface AnchorCoverageCounts {
  /** Total readings with timestamp ≤ anchor. */
  coverageBeforeAnchor: number;
  /** Total readings with timestamp ≥ anchor. */
  coverageAfterAnchor: number;
}

export interface EventContextQuality {
  /** Requested HF bucket size — never claim this equals observed cadence. */
  requestedInterval: typeof HF_REQUESTED_INTERVAL;
  effectiveMedianCadenceMs: number | null;
  effectiveP95CadenceMs: number | null;
  sampleCount: number;
  coverageBeforeAnchor: number;
  coverageAfterAnchor: number;
  /** ms from anchor to nearest HF sample (provider timing skew). */
  providerDelayMs: number | null;
  availableSignals: EngineContextSignal[];
  missingSignals: EngineContextSignal[];
  contextConfidence: ContextConfidence;
  capabilityVersion: string | null;
  qualityReasons: ContextQualityReasonCode[];
}

export function computeAnchorCoverage(
  timestampsMs: number[],
  anchorTs: number,
): AnchorCoverageCounts {
  let coverageBeforeAnchor = 0;
  let coverageAfterAnchor = 0;
  for (const ts of timestampsMs) {
    if (ts <= anchorTs) coverageBeforeAnchor += 1;
    if (ts >= anchorTs) coverageAfterAnchor += 1;
  }
  return { coverageBeforeAnchor, coverageAfterAnchor };
}

const PROVIDER_DELAY_ELEVATED_MS = 3_000;
const WINDOW_GAP_THRESHOLD_MS = 5_000;

export function buildEventContextQuality(input: {
  dataQuality: ContextWindowDataQuality;
  signalCoverage: SignalCoverage[];
  usedSignals: EngineContextSignal[];
  missingSignals: EngineContextSignal[];
  contextConfidence: ContextConfidence;
  capabilityVersion: string | null;
  status: EventContextStatus;
  anchorCoverage?: AnchorCoverageCounts;
}): EventContextQuality {
  const reasons = new Set<ContextQualityReasonCode>();
  const median = input.dataQuality.medianIntervalMs;
  const p95 = input.dataQuality.p95IntervalMs;

  reasons.add('NATIVE_EVENT_ANCHOR_PRESERVED');
  reasons.add('CONTEXT_SIGNALS_EXPLAIN_ONLY');

  if (
    median == null ||
    Math.abs(median - 1_000) > EFFECTIVE_1HZ_TOLERANCE_MS
  ) {
    reasons.add('HF_INTERVAL_REQUESTED_NOT_EFFECTIVE');
  }

  if (median != null && median > SPARSE_CADENCE_MEDIAN_MS) {
    reasons.add('EFFECTIVE_CADENCE_INSUFFICIENT');
  } else if (
    median != null &&
    median > EFFECTIVE_1HZ_TOLERANCE_MS &&
    input.status !== 'INSUFFICIENT_CADENCE'
  ) {
    reasons.add('EFFECTIVE_CADENCE_SPARSE');
  }

  if (input.dataQuality.sampleCount < COVERAGE_GOOD_MIN_SAMPLES) {
    reasons.add('LOW_SAMPLE_COUNT');
  }

  if (
    input.dataQuality.maxGapMs != null &&
    input.dataQuality.maxGapMs > WINDOW_GAP_THRESHOLD_MS
  ) {
    reasons.add('WINDOW_GAPS');
  }

  if (input.missingSignals.length > 0) {
    reasons.add('MISSING_ENGINE_SIGNALS');
  }

  const providerDelayMs = input.dataQuality.nearestSampleToAnchorMs;
  if (providerDelayMs != null && providerDelayMs > PROVIDER_DELAY_ELEVATED_MS) {
    reasons.add('PROVIDER_SAMPLE_DELAY');
  }

  const anchorCoverage =
    input.anchorCoverage ??
    ({ coverageBeforeAnchor: 0, coverageAfterAnchor: 0 } satisfies AnchorCoverageCounts);

  return {
    requestedInterval: HF_REQUESTED_INTERVAL,
    effectiveMedianCadenceMs: median,
    effectiveP95CadenceMs: p95,
    sampleCount: input.dataQuality.sampleCount,
    coverageBeforeAnchor: anchorCoverage.coverageBeforeAnchor,
    coverageAfterAnchor: anchorCoverage.coverageAfterAnchor,
    providerDelayMs,
    availableSignals: [...input.usedSignals],
    missingSignals: [...input.missingSignals],
    contextConfidence: input.contextConfidence,
    capabilityVersion: input.capabilityVersion,
    qualityReasons: [...reasons],
  };
}

/**
 * Pick the newest persisted capability probe version for context diagnostics.
 */
export function resolveContextCapabilityVersion(
  capabilities: Array<{ capabilityVersion?: string | null; checkedAt?: Date | null; row?: { capabilityVersion?: string } | null }>,
): string | null {
  let best: { version: string; checkedAt: number } | null = null;
  for (const cap of capabilities) {
    const version = cap.row?.capabilityVersion ?? cap.capabilityVersion ?? null;
    if (!version) continue;
    const checkedAt = cap.checkedAt?.getTime() ?? 0;
    if (!best || checkedAt >= best.checkedAt) {
      best = { version, checkedAt };
    }
  }
  return best?.version ?? null;
}
