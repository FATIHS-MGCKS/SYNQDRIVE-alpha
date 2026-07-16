/**
 * Deterministic severity/confidence reconciliation (P50).
 * Replaces monotonic maxSeverity/maxConfidence on persistence writes.
 */
import {
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import type { EvidenceCandidate } from '../misuse-case.types';
import { EVIDENCE_LEVEL_RANK, type TripEvidenceLevel } from '../../trips/trip-evidence-level.types';
import {
  CLUSTER_SEVERE_THRESHOLD,
  CLUSTER_WARNING_THRESHOLD,
  COLLISION_EVENT_TYPES,
  HIGH_VALUE_COLLISION_TYPES,
  MISUSE_RATING_RECONCILIATION_VERSION,
  PROVIDER_COLLISION_SOURCES,
  SOURCE_STRENGTH_RANK,
} from './misuse-case-rating-reconciliation.config';
import type {
  CoverageQuality,
  MisuseCaseRatingReconciliation,
  MisuseCaseRatingReconciliationInput,
  RatingReconciliationAuditEntry,
} from './misuse-case-rating-reconciliation.types';

const SEVERITY_RANK: Record<MisuseCaseSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  SEVERE: 2,
  CRITICAL: 3,
};

const CONFIDENCE_RANK: Record<MisuseCaseConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const EVIDENCE_LEVEL_TO_SEVERITY: Partial<Record<TripEvidenceLevel, MisuseCaseSeverity>> = {
  INFO: MisuseCaseSeverity.INFO,
  CHECK_RECOMMENDED: MisuseCaseSeverity.WARNING,
  MISUSE_SUSPECTED: MisuseCaseSeverity.WARNING,
  DAMAGE_RISK: MisuseCaseSeverity.SEVERE,
  CRITICAL_DAMAGE_RISK: MisuseCaseSeverity.CRITICAL,
};

function severityFromRank(rank: number): MisuseCaseSeverity {
  if (rank >= 3) return MisuseCaseSeverity.CRITICAL;
  if (rank >= 2) return MisuseCaseSeverity.SEVERE;
  if (rank >= 1) return MisuseCaseSeverity.WARNING;
  return MisuseCaseSeverity.INFO;
}

function confidenceFromRank(rank: number): MisuseCaseConfidence {
  if (rank >= 2) return MisuseCaseConfidence.HIGH;
  if (rank >= 1) return MisuseCaseConfidence.MEDIUM;
  return MisuseCaseConfidence.LOW;
}

function minSeverityRank(a: MisuseCaseSeverity, b: MisuseCaseSeverity): MisuseCaseSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function minConfidenceRank(a: MisuseCaseConfidence, b: MisuseCaseConfidence): MisuseCaseConfidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

export function resolveSourceStrength(sourceType: MisuseEvidenceSourceType): number {
  return SOURCE_STRENGTH_RANK[sourceType] ?? 0;
}

export function isProxyOnlyEvidence(qualifiedEvidence: EvidenceCandidate[]): boolean {
  if (qualifiedEvidence.length === 0) return false;
  return qualifiedEvidence.every((e) => e.sourceType === MisuseEvidenceSourceType.DERIVED_PATTERN);
}

export function hasHighValueEvidence(input: {
  caseType: MisuseCaseRatingReconciliationInput['caseType'];
  qualifiedEvidence: EvidenceCandidate[];
}): boolean {
  if (input.qualifiedEvidence.some((e) => e.sourceType === MisuseEvidenceSourceType.MANUAL_VERIFICATION)) {
    return true;
  }
  if (!HIGH_VALUE_COLLISION_TYPES.has(input.caseType)) {
    return false;
  }
  return input.qualifiedEvidence.some(
    (e) =>
      PROVIDER_COLLISION_SOURCES.has(e.sourceType) &&
      (COLLISION_EVENT_TYPES.has(e.eventType) ||
        e.sourceType === MisuseEvidenceSourceType.DIMO_EVENT),
  );
}

export function inferCoverageQuality(
  qualifiedEvidence: EvidenceCandidate[],
  explicit?: CoverageQuality,
): CoverageQuality {
  if (explicit) return explicit;
  if (qualifiedEvidence.length === 0) return 'NONE';

  const contextSnapshots = qualifiedEvidence
    .filter((e) => e.sourceType === MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT)
    .map((e) => e.snapshotJson as { evidenceGrade?: string } | null | undefined);

  if (contextSnapshots.some((s) => s?.evidenceGrade === 'A' || s?.evidenceGrade === 'B')) {
    return 'GOOD';
  }
  if (contextSnapshots.some((s) => s?.evidenceGrade === 'C')) {
    return 'SPARSE';
  }

  const hasDirectSource = qualifiedEvidence.some(
    (e) =>
      e.sourceType === MisuseEvidenceSourceType.DIMO_EVENT ||
      e.sourceType === MisuseEvidenceSourceType.DRIVING_EVENT ||
      e.sourceType === MisuseEvidenceSourceType.MANUAL_VERIFICATION,
  );
  if (hasDirectSource) return 'GOOD';
  if (qualifiedEvidence.length >= 2) return 'SPARSE';
  return 'SPARSE';
}

export function inferClusterCount(
  qualifiedEvidence: EvidenceCandidate[],
  explicit?: number,
): number {
  if (explicit != null && explicit > 0) return explicit;
  return qualifiedEvidence.length;
}

function evidenceItemSeverity(item: EvidenceCandidate): MisuseCaseSeverity {
  if (item.severity) return item.severity;
  if (COLLISION_EVENT_TYPES.has(item.eventType)) {
    return MisuseCaseSeverity.CRITICAL;
  }
  if (item.sourceType === MisuseEvidenceSourceType.MANUAL_VERIFICATION) {
    return MisuseCaseSeverity.SEVERE;
  }
  if (item.sourceType === MisuseEvidenceSourceType.DERIVED_PATTERN) {
    return MisuseCaseSeverity.WARNING;
  }
  return MisuseCaseSeverity.WARNING;
}

function evidenceItemConfidence(item: EvidenceCandidate): MisuseCaseConfidence {
  if (item.confidence) return item.confidence;
  const strength = resolveSourceStrength(item.sourceType);
  if (strength >= 5) return MisuseCaseConfidence.HIGH;
  if (strength >= 3) return MisuseCaseConfidence.MEDIUM;
  return MisuseCaseConfidence.LOW;
}

function deriveBaseSeverity(
  input: MisuseCaseRatingReconciliationInput,
  highValue: boolean,
  clusterCount: number,
): {
  severity: MisuseCaseSeverity;
  reasons: string[];
} {
  const reasons: string[] = [];
  let rank = 0;

  const levelSeverity = EVIDENCE_LEVEL_TO_SEVERITY[input.evidenceLevel];
  if (levelSeverity) {
    rank = Math.max(rank, SEVERITY_RANK[levelSeverity]);
    reasons.push(`evidenceLevel:${input.evidenceLevel}`);
  }

  for (const item of input.qualifiedEvidence) {
    const itemSev = evidenceItemSeverity(item);
    rank = Math.max(rank, SEVERITY_RANK[itemSev]);
  }

  if (clusterCount >= CLUSTER_SEVERE_THRESHOLD) {
    rank = Math.max(rank, SEVERITY_RANK[MisuseCaseSeverity.SEVERE]);
    reasons.push(`cluster:${clusterCount}`);
  } else if (clusterCount >= CLUSTER_WARNING_THRESHOLD) {
    rank = Math.max(rank, SEVERITY_RANK[MisuseCaseSeverity.WARNING]);
    reasons.push(`cluster:${clusterCount}`);
  }

  if (highValue) {
    rank = Math.max(rank, SEVERITY_RANK[MisuseCaseSeverity.SEVERE]);
    reasons.push('highValueEvidence');
    if (input.caseType === 'DIMO_COLLISION_REPORTED') {
      rank = Math.max(rank, SEVERITY_RANK[MisuseCaseSeverity.CRITICAL]);
      reasons.push('providerCollision');
    }
  }

  return { severity: severityFromRank(rank), reasons };
}

function deriveBaseConfidence(
  input: MisuseCaseRatingReconciliationInput,
  highValue: boolean,
  clusterCount: number,
): {
  confidence: MisuseCaseConfidence;
  reasons: string[];
} {
  const reasons: string[] = [];
  let rank = 0;

  for (const item of input.qualifiedEvidence) {
    const itemConf = evidenceItemConfidence(item);
    rank = Math.max(rank, CONFIDENCE_RANK[itemConf]);
  }

  if (input.coverageQuality === 'GOOD') {
    rank = Math.max(rank, CONFIDENCE_RANK[MisuseCaseConfidence.MEDIUM]);
    reasons.push('coverage:GOOD');
  } else if (input.coverageQuality === 'SPARSE') {
    reasons.push('coverage:SPARSE');
  }

  if (clusterCount >= 2) {
    rank = Math.max(rank, CONFIDENCE_RANK[MisuseCaseConfidence.MEDIUM]);
    reasons.push(`cluster:${clusterCount}`);
  }
  if (clusterCount >= 3) {
    rank = Math.max(rank, CONFIDENCE_RANK[MisuseCaseConfidence.HIGH]);
  }

  if (highValue) {
    rank = Math.max(rank, CONFIDENCE_RANK[MisuseCaseConfidence.HIGH]);
    reasons.push('highValueEvidence');
  }

  if (input.attributionConfidence === 'LOW') {
    rank = Math.min(rank, CONFIDENCE_RANK[MisuseCaseConfidence.MEDIUM]);
    reasons.push('attributionCap:LOW');
  }

  return { confidence: confidenceFromRank(rank), reasons };
}

function applyNormalization(
  severity: MisuseCaseSeverity,
  confidence: MisuseCaseConfidence,
  input: MisuseCaseRatingReconciliationInput & {
    proxyOnly: boolean;
    sourceStrengthMax: number;
  },
  reasons: string[],
): { severity: MisuseCaseSeverity; confidence: MisuseCaseConfidence } {
  let nextSeverity = severity;
  let nextConfidence = confidence;

  if (input.proxyOnly) {
    nextSeverity = minSeverityRank(nextSeverity, MisuseCaseSeverity.WARNING);
    nextConfidence = minConfidenceRank(nextConfidence, MisuseCaseConfidence.MEDIUM);
    reasons.push('proxyOnlyCap');
  }

  if (EVIDENCE_LEVEL_RANK[input.evidenceLevel] <= EVIDENCE_LEVEL_RANK.INFO) {
    nextSeverity = minSeverityRank(nextSeverity, MisuseCaseSeverity.WARNING);
    reasons.push('lowEvidenceLevelCap');
  }

  if (input.sourceStrengthMax <= 1) {
    nextConfidence = minConfidenceRank(nextConfidence, MisuseCaseConfidence.MEDIUM);
    reasons.push('weakSourceCap');
  }

  return { severity: nextSeverity, confidence: nextConfidence };
}

function buildAuditEntry(
  input: MisuseCaseRatingReconciliationInput,
  severity: MisuseCaseSeverity,
  confidence: MisuseCaseConfidence,
  reasons: string[],
  meta: {
    proxyOnly: boolean;
    clusterCount: number;
    coverageQuality: CoverageQuality;
    sourceStrengthMax: number;
    hasHighValueEvidence: boolean;
  },
  evaluatedAt: Date = new Date(),
): RatingReconciliationAuditEntry {
  const previousSeverity = input.existingSeverity ?? null;
  const previousConfidence = input.existingConfidence ?? null;

  let direction: RatingReconciliationAuditEntry['direction'] = 'INITIAL';
  if (previousSeverity != null || previousConfidence != null) {
    const sevDelta =
      SEVERITY_RANK[severity] - SEVERITY_RANK[previousSeverity ?? MisuseCaseSeverity.INFO];
    const confDelta =
      CONFIDENCE_RANK[confidence] - CONFIDENCE_RANK[previousConfidence ?? MisuseCaseConfidence.LOW];
    if (sevDelta > 0 || confDelta > 0) direction = 'UPGRADE';
    else if (sevDelta < 0 || confDelta < 0) direction = 'DOWNGRADE';
    else direction = 'UNCHANGED';
  }

  return {
    modelVersion: MISUSE_RATING_RECONCILIATION_VERSION,
    evaluatedAt: evaluatedAt.toISOString(),
    previousSeverity,
    previousConfidence,
    reconciledSeverity: severity,
    reconciledConfidence: confidence,
    direction,
    reasons,
    sourceStrengthMax: meta.sourceStrengthMax,
    coverageQuality: meta.coverageQuality,
    clusterCount: meta.clusterCount,
    proxyOnly: meta.proxyOnly,
    hasHighValueEvidence: meta.hasHighValueEvidence,
  };
}

/**
 * Deterministic severity/confidence from current qualified evidence and context.
 * Never reads stored case counters — evaluates the current batch only.
 */
export function reconcileMisuseCaseRating(
  input: MisuseCaseRatingReconciliationInput,
): MisuseCaseRatingReconciliation {
  const clusterCount = inferClusterCount(input.qualifiedEvidence, input.clusterCount);
  const coverageQuality = inferCoverageQuality(input.qualifiedEvidence, input.coverageQuality);
  const proxyOnly = isProxyOnlyEvidence(input.qualifiedEvidence);
  const highValue = hasHighValueEvidence({
    caseType: input.caseType,
    qualifiedEvidence: input.qualifiedEvidence,
  });
  const sourceStrengthMax = input.qualifiedEvidence.reduce(
    (max, item) => Math.max(max, resolveSourceStrength(item.sourceType)),
    0,
  );

  if (input.qualifiedEvidence.length === 0) {
    const audit = buildAuditEntry(
      input,
      MisuseCaseSeverity.INFO,
      MisuseCaseConfidence.LOW,
      ['noQualifiedEvidence'],
      {
        proxyOnly: false,
        clusterCount: 0,
        coverageQuality: 'NONE',
        sourceStrengthMax: 0,
        hasHighValueEvidence: false,
      },
    );
    return {
      severity: MisuseCaseSeverity.INFO,
      confidence: MisuseCaseConfidence.LOW,
      shouldResolve: true,
      resolutionReason: 'Evidence entfallen — automatische Auflösung',
      proxyOnly: false,
      clusterCount: 0,
      coverageQuality: 'NONE',
      sourceStrengthMax: 0,
      hasHighValueEvidence: false,
      modelVersion: MISUSE_RATING_RECONCILIATION_VERSION,
      audit,
    };
  }

  const enrichedInput: MisuseCaseRatingReconciliationInput = {
    ...input,
    clusterCount,
    coverageQuality,
  };

  const severityBase = deriveBaseSeverity(enrichedInput, highValue, clusterCount);
  const confidenceBase = deriveBaseConfidence(enrichedInput, highValue, clusterCount);
  const reasons = [...severityBase.reasons, ...confidenceBase.reasons];

  const normalized = applyNormalization(
    severityBase.severity,
    confidenceBase.confidence,
    {
      ...enrichedInput,
      proxyOnly,
      sourceStrengthMax,
    },
    reasons,
  );

  const audit = buildAuditEntry(
    input,
    normalized.severity,
    normalized.confidence,
    reasons,
    {
      proxyOnly,
      clusterCount,
      coverageQuality,
      sourceStrengthMax,
      hasHighValueEvidence: highValue,
    },
  );

  return {
    severity: normalized.severity,
    confidence: normalized.confidence,
    shouldResolve: false,
    resolutionReason: null,
    proxyOnly,
    clusterCount,
    coverageQuality,
    sourceStrengthMax,
    hasHighValueEvidence: highValue,
    modelVersion: MISUSE_RATING_RECONCILIATION_VERSION,
    audit,
  };
}

export function buildRatingReconciliationSummary(
  reconciliation: MisuseCaseRatingReconciliation,
): {
  ratingReconciliation: RatingReconciliationAuditEntry;
  ratingReconciliationHistory?: RatingReconciliationAuditEntry[];
} {
  return {
    ratingReconciliation: reconciliation.audit,
  };
}

/** Preserve prior audit entries when rating changes — no silent overwrite. */
export function appendSupersededRatingAudit(
  existingSummary: Record<string, unknown> | null | undefined,
  reconciliation: MisuseCaseRatingReconciliation,
): Record<string, unknown> {
  const current = reconciliation.audit;
  const prior = existingSummary?.ratingReconciliation as RatingReconciliationAuditEntry | undefined;
  const history = (existingSummary?.ratingReconciliationHistory as RatingReconciliationAuditEntry[] | undefined) ?? [];

  if (
    prior &&
    (prior.reconciledSeverity !== current.reconciledSeverity ||
      prior.reconciledConfidence !== current.reconciledConfidence) &&
    current.direction !== 'INITIAL'
  ) {
    return {
      ratingReconciliation: current,
      ratingReconciliationHistory: [...history, prior],
    };
  }

  return buildRatingReconciliationSummary(reconciliation);
}
