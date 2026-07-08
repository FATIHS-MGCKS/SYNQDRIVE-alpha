import {
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import type { CaseCandidate } from '../misuse-cases/misuse-case.types';
import {
  EVIDENCE_LEVEL_RANK,
  maxEvidenceLevel,
  requiresHumanReviewForLevel,
  toTripEvidenceConfidence,
  type TripEvidenceCase,
  type TripEvidenceCaseSource,
  type TripEvidenceLevel,
  type TripEvidenceMeasurements,
} from './trip-evidence-level.types';

const REVIEW_DISCLAIMER = 'Prüfung empfohlen — kein automatisierter Vorwurf.';

interface ContextEvidenceSummary {
  evidenceGrade?: string | null;
  confidence?: string | null;
  usedSignals?: string[];
  missingSignals?: string[];
  reasonCodes?: string[];
  keyValues?: Record<string, number | null | undefined>;
  dataQuality?: {
    sampleCount?: number;
    medianIntervalMs?: number | null;
    p95IntervalMs?: number | null;
  };
}

function readContextEvidence(
  candidate: CaseCandidate,
): ContextEvidenceSummary | null {
  const summary = candidate.evidenceSummary?.contextEvidence;
  if (!summary || typeof summary !== 'object') return null;
  return summary as ContextEvidenceSummary;
}

function isSparseContext(ctx: ContextEvidenceSummary | null): boolean {
  if (!ctx) return false;
  const grade = ctx.evidenceGrade;
  const conf = ctx.confidence;
  const sampleCount = ctx.dataQuality?.sampleCount ?? 0;
  const p95 = ctx.dataQuality?.p95IntervalMs ?? 0;
  if (grade === 'C' || grade === 'D') return true;
  if (conf === 'LOW' || conf === 'INSUFFICIENT') return true;
  if (sampleCount > 0 && sampleCount < 5) return true;
  if (p95 > 15_000) return true;
  return false;
}

function capLevelForSparseContext(
  level: TripEvidenceLevel,
  sparse: boolean,
): TripEvidenceLevel {
  if (!sparse) return level;
  if (EVIDENCE_LEVEL_RANK[level] <= EVIDENCE_LEVEL_RANK.CHECK_RECOMMENDED) {
    return level;
  }
  return 'CHECK_RECOMMENDED';
}

function resolveEvidenceSource(candidate: CaseCandidate): TripEvidenceCaseSource {
  const sources = new Set(candidate.evidence.map((e) => e.sourceType));
  const hasNative =
    sources.has(MisuseEvidenceSourceType.DRIVING_EVENT) ||
    sources.has(MisuseEvidenceSourceType.DIMO_EVENT);
  const hasHf = sources.has(MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT);
  const hasContext = sources.has(MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT);

  const count = [hasNative, hasHf, hasContext].filter(Boolean).length;
  if (count > 1) return 'MIXED';
  if (hasContext) return 'CONTEXT_ENRICHMENT';
  if (hasHf) return 'HF_RECONSTRUCTION';
  if (hasNative) return 'NATIVE_EVENT';
  return 'MIXED';
}

function num(...values: Array<number | null | undefined>): number | undefined {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  return present.length ? Math.max(...present) : undefined;
}

function buildMeasurements(candidate: CaseCandidate): TripEvidenceMeasurements {
  const ctx = readContextEvidence(candidate);
  const kv = ctx?.keyValues ?? {};
  const measurements: TripEvidenceMeasurements = {};

  const rpm = num(kv.maxRpm);
  const throttle = num(kv.maxThrottle);
  const engineLoad = num(kv.maxEngineLoad);
  const coolant = num(kv.coolantAtEvent, kv.coolantMax);

  if (rpm != null) measurements.rpm = Math.round(rpm);
  if (throttle != null) measurements.throttle = Math.round(throttle);
  if (engineLoad != null) measurements.engineLoad = Math.round(engineLoad);
  if (coolant != null) measurements.coolant = Math.round(coolant);

  if (kv.preSpeed != null || kv.postSpeed != null) {
    const before = kv.preSpeed != null ? Math.round(kv.preSpeed) : '—';
    const after = kv.postSpeed != null ? Math.round(kv.postSpeed) : '—';
    measurements.speedBeforeAfter = `${before} → ${after} km/h`;
  }

  for (const ev of candidate.evidence) {
    const snap = ev.snapshotJson ?? {};
    if (typeof snap.durationMs === 'number' && measurements.durationMs == null) {
      measurements.durationMs = snap.durationMs;
    }
    if (typeof snap.peakValue === 'number') {
      if (ev.eventType.includes('rpm') || snap.classification) {
        // peak values from behavior evidence handled via context keyValues
      }
    }
  }

  return measurements;
}

function buildReasons(candidate: CaseCandidate): string[] {
  const reasons: string[] = [];
  const ctx = readContextEvidence(candidate);

  if (ctx?.reasonCodes?.length) {
    reasons.push(...ctx.reasonCodes.slice(0, 6));
  }

  const eventTypes = [...new Set(candidate.evidence.map((e) => e.eventType))];
  for (const type of eventTypes.slice(0, 4)) {
    if (!reasons.includes(type)) reasons.push(type);
  }

  if (candidate.eventCount > 1) {
    reasons.push(`${candidate.eventCount} zusammenhängende Ereignisse`);
  }

  if (isSparseContext(ctx)) {
    reasons.push('Sparse HF-Kontext — vorsichtige Einordnung');
  }

  return reasons.slice(0, 8);
}

function resolveConfidence(
  candidate: CaseCandidate,
  sparse: boolean,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const base = toTripEvidenceConfidence(candidate.confidence);
  if (sparse && base === 'HIGH') return 'MEDIUM';
  if (sparse && base === 'MEDIUM' && candidate.confidence === MisuseCaseConfidence.LOW) {
    return 'LOW';
  }
  return base;
}

function levelForAggressiveDriving(
  candidate: CaseCandidate,
  sparse: boolean,
): TripEvidenceLevel {
  const isUsageOnly = candidate.category === MisuseCaseCategory.USAGE_ANOMALY;
  const titleIndicatesAccel =
    candidate.title.toLowerCase().includes('beschleunigung') ||
    candidate.description.toLowerCase().includes('beschleunigung');

  if (isUsageOnly || titleIndicatesAccel) {
    return 'CHECK_RECOMMENDED';
  }

  const strongMisuse =
    candidate.category === MisuseCaseCategory.MISUSE_SUSPICION &&
    candidate.confidence === MisuseCaseConfidence.HIGH &&
    candidate.eventCount >= 3;

  if (strongMisuse && !sparse) {
    return 'MISUSE_SUSPECTED';
  }

  if (
    candidate.category === MisuseCaseCategory.MISUSE_SUSPICION &&
    candidate.confidence === MisuseCaseConfidence.HIGH &&
    candidate.eventCount >= 2 &&
    !sparse
  ) {
    return 'MISUSE_SUSPECTED';
  }

  return 'CHECK_RECOMMENDED';
}

function levelForBrakeAbuse(candidate: CaseCandidate): TripEvidenceLevel {
  if (candidate.severity === MisuseCaseSeverity.CRITICAL) {
    return 'DAMAGE_RISK';
  }
  if (
    candidate.severity === MisuseCaseSeverity.SEVERE &&
    candidate.eventCount >= 3
  ) {
    return 'DAMAGE_RISK';
  }
  return 'CHECK_RECOMMENDED';
}

function levelForOverheating(candidate: CaseCandidate): TripEvidenceLevel {
  const ctx = readContextEvidence(candidate);
  const maxCoolant = num(
    ctx?.keyValues?.coolantMax,
    ctx?.keyValues?.coolantAtEvent,
  );
  const repeated = candidate.eventCount >= 2;

  if (
    candidate.severity === MisuseCaseSeverity.CRITICAL ||
    (maxCoolant != null && maxCoolant >= 120) ||
    repeated
  ) {
    return 'CRITICAL_DAMAGE_RISK';
  }
  return 'DAMAGE_RISK';
}

function levelForEngineShutdown(candidate: CaseCandidate): TripEvidenceLevel {
  if (candidate.severity === MisuseCaseSeverity.CRITICAL) {
    return 'CRITICAL_DAMAGE_RISK';
  }
  return 'DAMAGE_RISK';
}

function levelForPossibleImpact(candidate: CaseCandidate): TripEvidenceLevel {
  const hasCriticalEvidence = candidate.evidence.some((e) => {
    const snap = e.snapshotJson ?? {};
    const peak = typeof snap.peakDecelMs2 === 'number' ? snap.peakDecelMs2 : null;
    return peak != null && peak >= 14;
  });

  if (
    candidate.severity === MisuseCaseSeverity.CRITICAL ||
    hasCriticalEvidence
  ) {
    return 'CRITICAL_DAMAGE_RISK';
  }
  return 'DAMAGE_RISK';
}

export function resolveEvidenceLevel(candidate: CaseCandidate): TripEvidenceLevel {
  const ctx = readContextEvidence(candidate);
  const sparse = isSparseContext(ctx);
  let level: TripEvidenceLevel;

  switch (candidate.type) {
    case MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN:
      level = levelForAggressiveDriving(candidate, sparse);
      break;
    case MisuseCaseType.COLD_ENGINE_ABUSE:
    case MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE:
    case MisuseCaseType.LAUNCH_ABUSE_PATTERN:
      level =
        candidate.category === MisuseCaseCategory.MISUSE_SUSPICION &&
        candidate.confidence === MisuseCaseConfidence.HIGH &&
        !sparse
          ? 'MISUSE_SUSPECTED'
          : 'CHECK_RECOMMENDED';
      break;
    case MisuseCaseType.BRAKE_ABUSE_PATTERN:
      level = levelForBrakeAbuse(candidate);
      break;
    case MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT:
      level = levelForPossibleImpact(candidate);
      break;
    case MisuseCaseType.DIMO_COLLISION_REPORTED:
      level = 'CRITICAL_DAMAGE_RISK';
      break;
    case MisuseCaseType.OVERHEATING_DAMAGE_RISK:
      level = levelForOverheating(candidate);
      break;
    case MisuseCaseType.DTC_AFTER_ABUSE_OR_IMPACT:
      level = 'CHECK_RECOMMENDED';
      break;
    default:
      if (candidate.category === MisuseCaseCategory.DAMAGE_SUSPICION) {
        level = 'DAMAGE_RISK';
      } else if (candidate.category === MisuseCaseCategory.TECHNICAL_RISK) {
        level = 'DAMAGE_RISK';
      } else if (candidate.category === MisuseCaseCategory.MISUSE_SUSPICION) {
        level = sparse ? 'CHECK_RECOMMENDED' : 'MISUSE_SUSPECTED';
      } else {
        level = 'CHECK_RECOMMENDED';
      }
  }

  return capLevelForSparseContext(level, sparse);
}

export function resolveEvidenceLevelForAbuseEventType(
  eventType: string,
  opts: {
    severity?: string;
    durationMs?: number;
    peakCoolantC?: number;
    sparseContext?: boolean;
    strongContextSignals?: number;
    confidence?: MisuseCaseConfidence;
  } = {},
): TripEvidenceLevel {
  const sparse = opts.sparseContext === true;
  const strongSignals = opts.strongContextSignals ?? 0;

  switch (eventType) {
    case 'LONG_IDLE':
      return opts.durationMs != null && opts.durationMs > 600_000
        ? 'CHECK_RECOMMENDED'
        : 'INFO';
    case 'POSSIBLE_IMPACT':
      return opts.severity === 'CRITICAL' ? 'CRITICAL_DAMAGE_RISK' : 'DAMAGE_RISK';
    case 'OVERHEATING_ENGINE':
      if ((opts.peakCoolantC ?? 0) >= 120) return 'CRITICAL_DAMAGE_RISK';
      return 'DAMAGE_RISK';
    case 'ENGINE_SHUTDOWN_WHILE_DRIVING':
      return opts.severity === 'CRITICAL' ? 'CRITICAL_DAMAGE_RISK' : 'DAMAGE_RISK';
    case 'KICKDOWN':
    case 'HIGH_RPM_CONSTANT':
    case 'COLD_ENGINE_HIGH_RPM':
    case 'COLD_ENGINE_FULL_THROTTLE':
      if (
        strongSignals >= 3 &&
        opts.confidence === MisuseCaseConfidence.HIGH &&
        !sparse
      ) {
        return 'MISUSE_SUSPECTED';
      }
      return 'CHECK_RECOMMENDED';
    case 'FULL_BRAKING':
      return opts.severity === 'CRITICAL' || opts.severity === 'SEVERE'
        ? 'DAMAGE_RISK'
        : 'CHECK_RECOMMENDED';
    case 'HARSH_ACCELERATION':
      return 'CHECK_RECOMMENDED';
    default:
      return 'CHECK_RECOMMENDED';
  }
}

export function evidenceTitleForLevel(
  level: TripEvidenceLevel,
  fallbackTitle: string,
): string {
  switch (level) {
    case 'CHECK_RECOMMENDED':
      if (
        fallbackTitle.toLowerCase().includes('aggressiv') ||
        fallbackTitle.toLowerCase().includes('beschleunigung')
      ) {
        return 'Auffälliges Fahrmuster';
      }
      return fallbackTitle.includes('Fahrmuster')
        ? fallbackTitle
        : 'Auffälliges Fahrmuster';
    case 'MISUSE_SUSPECTED':
      return 'Missbrauchsverdacht';
    case 'DAMAGE_RISK':
      return 'Schadenverdacht';
    case 'CRITICAL_DAMAGE_RISK':
      return 'Kritischer Schadenverdacht';
    case 'INFO':
      return fallbackTitle;
    default:
      return fallbackTitle;
  }
}

export function buildEvidenceCase(
  candidate: CaseCandidate,
  caseId?: string,
): TripEvidenceCase {
  const ctx = readContextEvidence(candidate);
  const sparse = isSparseContext(ctx);
  const evidenceLevel = resolveEvidenceLevel(candidate);
  const confidence = resolveConfidence(candidate, sparse);
  const title = evidenceTitleForLevel(evidenceLevel, candidate.title);

  let explanation = candidate.description;
  if (evidenceLevel === 'CHECK_RECOMMENDED' && !explanation.includes(REVIEW_DISCLAIMER)) {
    explanation = `${explanation.trim()} ${REVIEW_DISCLAIMER}`.trim();
  }
  if (sparse && !explanation.toLowerCase().includes('prüfung')) {
    explanation =
      'Auffälliges Muster im Ereigniskontext. Prüfung empfohlen — kein automatisierter Vorwurf.';
  }

  return {
    id: caseId ?? candidate.type,
    type: candidate.type,
    evidenceLevel,
    title,
    explanation,
    confidence,
    chargeable: false,
    requiresHumanReview: requiresHumanReviewForLevel(evidenceLevel),
    reasons: buildReasons(candidate),
    measurements: buildMeasurements(candidate),
    source: resolveEvidenceSource(candidate),
  };
}

export function enrichCaseWithEvidence(
  candidate: CaseCandidate,
  caseId?: string,
): CaseCandidate {
  const evidenceCase = buildEvidenceCase(candidate, caseId);
  return {
    ...candidate,
    evidenceSummary: {
      ...(candidate.evidenceSummary ?? {}),
      evidenceCase,
    },
  };
}

export function maxEvidenceLevelFromCases(
  levels: TripEvidenceLevel[],
): TripEvidenceLevel {
  return levels.reduce(
    (acc, level) => maxEvidenceLevel(acc, level),
    'NONE' as TripEvidenceLevel,
  );
}

export function tripAssessmentStatusFromEvidenceLevel(
  level: TripEvidenceLevel,
): 'PRUEFHINWEIS' | 'KRITISCH' | null {
  switch (level) {
    case 'CRITICAL_DAMAGE_RISK':
      return 'KRITISCH';
    case 'DAMAGE_RISK':
    case 'MISUSE_SUSPECTED':
    case 'CHECK_RECOMMENDED':
      return 'PRUEFHINWEIS';
    default:
      return null;
  }
}
