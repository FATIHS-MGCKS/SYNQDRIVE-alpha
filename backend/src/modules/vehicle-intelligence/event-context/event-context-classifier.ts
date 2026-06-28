/**
 * SynqDrive — Conservative Context Classification Engine (Phase 2/3).
 *
 * Pure, read-only. It NEVER creates misuse cases and never overstates sparse
 * data. When evidence is too thin it returns INSUFFICIENT_CONTEXT. Emitted
 * classifications are explicitly preliminary CANDIDATE/LIKELY-style hypotheses for
 * a later (Prompt 4+) misuse-aggregation layer to consume — they are evidence /
 * reason codes, NOT hard misuse verdicts.
 *
 * Phase 3 adds behaviour-event-aware classification: when the window is anchored
 * on a native DIMO event the classifier reasons about the event category
 * (acceleration vs braking vs cornering) plus pre/post speed and engine context.
 *
 * Thresholds here are context-labeling thresholds (see event-context-stats.ts),
 * not the existing abuse-detector thresholds.
 */
import type {
  AnchorType,
  ContextClassification,
  ContextConfidence,
  ContextReasonCode,
  ContextWindowDataQuality,
  EngineContextSignal,
  EvidenceGrade,
} from './event-context.types';
import type { AnchorEventInfo, ContextSignalStats } from './event-context-assessment.types';
import {
  COLD_COOLANT_C,
  HIGH_ENGINE_LOAD_PCT,
  HIGH_RPM_ABS,
  STANDSTILL_KMH,
} from './event-context-stats';

const REV_IN_IDLE_MIN_RPM = 2_000;
const MIN_SAMPLES_FOR_GRADE = 3;

// ── Behaviour-classification speed thresholds (context labels, conservative) ────
const AGGRESSIVE_START_MAX_PRE_KMH = 5;
const LAUNCH_LIKE_MAX_PRE_KMH = 3;
const KICKDOWN_MIN_PRE_KMH = 20;
const OVERTAKING_MIN_PRE_KMH = 50;
const EMERGENCY_BRAKING_MIN_PRE_KMH = 50;

// ── Confidence proximity thresholds (ms) ───────────────────────────────────────
const NEAREST_HIGH_MS = 5_000;
const NEAREST_MEDIUM_MS = 10_000;

export interface ClassifyContextInput {
  anchorType: AnchorType;
  engineSignalsApplicable: boolean;
  perSignal: Record<EngineContextSignal, ContextSignalStats>;
  dataQuality: ContextWindowDataQuality;
  reasonCodes: ContextReasonCode[];
  /** Native event semantics (absent for RPM webhook candidates). */
  anchorEvent?: AnchorEventInfo | null;
}

export interface ClassifyContextResult {
  status: 'COMPLETED' | 'INSUFFICIENT_CONTEXT';
  preliminaryClassifications: ContextClassification[];
  confidence: ContextConfidence;
  evidenceGrade: EvidenceGrade;
  reasonCodes: ContextReasonCode[];
}

const present = (q: ContextSignalStats['coverageQuality']): boolean =>
  q === 'GOOD' || q === 'SPARSE';

/** Count of engine-context signals (incl. speed) actually present in the window. */
function relevantSignalCount(perSignal: ClassifyContextInput['perSignal']): number {
  return (Object.values(perSignal) as ContextSignalStats[]).filter(
    (s) => s.nonNullCount > 0,
  ).length;
}

function deriveEvidenceGrade(input: ClassifyContextInput): EvidenceGrade {
  const { perSignal, dataQuality } = input;
  const speedQ = perSignal.speed.coverageQuality;
  if (!present(speedQ) || dataQuality.sampleCount < MIN_SAMPLES_FOR_GRADE) return 'D';

  const rpmGood = perSignal.rpm.coverageQuality === 'GOOD';
  const throttleGood = perSignal.throttle.coverageQuality === 'GOOD';
  const loadGood = perSignal.engineLoad.coverageQuality === 'GOOD';
  const rpmPresent = present(perSignal.rpm.coverageQuality);

  if (speedQ === 'GOOD' && rpmGood && (throttleGood || loadGood)) return 'A';
  if (rpmPresent) return 'B';
  return 'C';
}

/**
 * Context confidence (Phase 3 rule):
 *   HIGH         — anchor + 3+ relevant signals + nearest sample ≤ 5s
 *   MEDIUM       — anchor + 2 relevant signals + nearest sample ≤ 10s
 *   LOW          — anchor + 1 relevant signal, or sparse cadence
 *   INSUFFICIENT — no usable context data
 */
function deriveConfidence(input: ClassifyContextInput): ContextConfidence {
  const relevant = relevantSignalCount(input.perSignal);
  const nearest = input.dataQuality.nearestSampleToAnchorMs;
  const sparse = input.reasonCodes.includes('SPARSE_SIGNAL_CADENCE');

  if (relevant === 0 || nearest == null) return 'INSUFFICIENT';
  if (relevant >= 3 && nearest <= NEAREST_HIGH_MS && !sparse) return 'HIGH';
  if (relevant >= 2 && nearest <= NEAREST_MEDIUM_MS) return 'MEDIUM';
  if (relevant >= 1 || sparse) return 'LOW';
  return 'INSUFFICIENT';
}

/** Classifications for an acceleration-anchored window. */
function classifyAcceleration(
  perSignal: ClassifyContextInput['perSignal'],
  reasonCodes: ContextReasonCode[],
  extreme: boolean,
): ContextClassification[] {
  const out = new Set<ContextClassification>();
  const preSpeed = perSignal.speed.valueBeforeAnchor ?? perSignal.speed.nearestValueToAnchor;
  const postSpeed = perSignal.speed.valueAfterAnchor;
  const coolantNear = perSignal.coolant.nearestValueToAnchor;
  const cold = coolantNear != null && coolantNear < COLD_COOLANT_C;
  const warm = coolantNear != null && coolantNear >= COLD_COOLANT_C;
  const highLoad =
    reasonCodes.includes('HIGH_RPM') ||
    reasonCodes.includes('HIGH_THROTTLE') ||
    reasonCodes.includes('HIGH_ENGINE_LOAD');

  // Cold-engine takes precedence (it carries an extra damage-risk meaning).
  if (cold && highLoad) {
    out.add(preSpeed != null && preSpeed > KICKDOWN_MIN_PRE_KMH
      ? 'COLD_ENGINE_KICKDOWN'
      : 'COLD_ENGINE_ACCELERATION');
  } else if (highLoad && preSpeed != null) {
    if (extreme && preSpeed <= LAUNCH_LIKE_MAX_PRE_KMH) out.add('LAUNCH_LIKE_START');
    else if (preSpeed <= AGGRESSIVE_START_MAX_PRE_KMH) out.add('AGGRESSIVE_START');
    else if (preSpeed > KICKDOWN_MIN_PRE_KMH) out.add('KICKDOWN_LIKELY');
  }

  // Overtaking is additive evidence (speed rose from an already-fast cruise).
  if (
    warm &&
    preSpeed != null &&
    preSpeed >= OVERTAKING_MIN_PRE_KMH &&
    postSpeed != null &&
    postSpeed > preSpeed
  ) {
    out.add('OVERTAKING_LIKELY');
  }

  // Generic high-load fallback when nothing more specific matched.
  if (out.size === 0 && highLoad && preSpeed != null && preSpeed > STANDSTILL_KMH) {
    out.add('HIGH_LOAD_ACCELERATION');
  }

  return [...out];
}

/** Classifications for a braking-anchored window. */
function classifyBraking(
  perSignal: ClassifyContextInput['perSignal'],
  extreme: boolean,
): ContextClassification[] {
  const preSpeed = perSignal.speed.valueBeforeAnchor ?? perSignal.speed.nearestValueToAnchor;
  if (preSpeed != null && (preSpeed >= EMERGENCY_BRAKING_MIN_PRE_KMH || extreme)) {
    return ['EMERGENCY_LIKE_BRAKING'];
  }
  return [];
}

/** Generic (RPM-candidate / uncategorised) classifications. */
function classifyGeneric(
  perSignal: ClassifyContextInput['perSignal'],
  reasonCodes: ContextReasonCode[],
): ContextClassification[] {
  const out = new Set<ContextClassification>();
  const rpmMax = perSignal.rpm.max;
  const coolantNear = perSignal.coolant.nearestValueToAnchor;
  const speedNear = perSignal.speed.nearestValueToAnchor;
  const loadMax = perSignal.engineLoad.max;

  const standstill =
    reasonCodes.includes('STANDSTILL_BEFORE_EVENT') ||
    (speedNear != null && speedNear <= STANDSTILL_KMH);
  const moving = !standstill && speedNear != null;

  if (rpmMax != null) {
    if (standstill && rpmMax >= REV_IN_IDLE_MIN_RPM) out.add('REV_IN_IDLE_CANDIDATE');
    if (coolantNear != null && coolantNear < COLD_COOLANT_C && rpmMax >= HIGH_RPM_ABS) {
      out.add('COLD_ENGINE_HIGH_RPM');
    }
    if (moving && rpmMax >= HIGH_RPM_ABS) out.add('HIGH_RPM_SPIKE');
  }
  if (loadMax != null && loadMax >= HIGH_ENGINE_LOAD_PCT && moving) {
    out.add('HIGH_LOAD_ACCELERATION');
  }
  return [...out];
}

export function classifyEventContext(input: ClassifyContextInput): ClassifyContextResult {
  const anchorReason: ContextReasonCode = 'NATIVE_EVENT_ANCHOR';
  const reasonCodes = [...new Set<ContextReasonCode>([anchorReason, ...input.reasonCodes])];

  const grade = deriveEvidenceGrade(input);

  if (grade === 'D') {
    return {
      status: 'INSUFFICIENT_CONTEXT',
      preliminaryClassifications: ['INSUFFICIENT_CONTEXT'],
      confidence: 'INSUFFICIENT',
      evidenceGrade: 'D',
      reasonCodes,
    };
  }

  const extreme = input.anchorEvent?.extreme ?? false;
  let classifications: ContextClassification[];
  switch (input.anchorEvent?.category) {
    case 'ACCELERATION':
      classifications = classifyAcceleration(input.perSignal, reasonCodes, extreme);
      break;
    case 'BRAKING':
      classifications = classifyBraking(input.perSignal, extreme);
      break;
    case 'CORNERING':
      classifications = [];
      break;
    default:
      classifications = classifyGeneric(input.perSignal, reasonCodes);
      break;
  }

  return {
    status: 'COMPLETED',
    preliminaryClassifications: classifications,
    confidence: deriveConfidence(input),
    evidenceGrade: grade,
    reasonCodes,
  };
}
