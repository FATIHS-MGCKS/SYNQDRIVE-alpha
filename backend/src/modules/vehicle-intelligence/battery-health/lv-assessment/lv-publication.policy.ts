import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import { BatteryPolicyProfile } from '../../battery-policy-profile/battery-policy-profile.types';
import {
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from '../battery-freshness.policy';
import { shouldPublish, stabilize } from '../soh-publication';
import type { LvEstimatedHealthAssessment } from './lv-estimated-health-assessment.policy';
import {
  LV_PUBLICATION_CONTAMINATION_DOMINANCE_MAX_RATIO,
  LV_PUBLICATION_EWMA_ALPHA,
  LV_PUBLICATION_EWMA_DAMPED_ALPHA,
  LV_PUBLICATION_HYSTERESIS_MIN_DELTA_PP,
  LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_PROVISIONAL,
  LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE,
  LV_PUBLICATION_MIN_CONFIDENCE_SCORE_PROVISIONAL,
  LV_PUBLICATION_MIN_CONFIDENCE_SCORE_STABLE,
  LV_PUBLICATION_MIN_DAYS_FOR_STABLE,
  LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT,
  LV_PUBLICATION_OBSERVATION_STALE_MS,
  LV_PUBLICATION_POLICY_VERSION,
  type LvPublicationMaturity,
} from './lv-publication-thresholds';

export {
  LV_PUBLICATION_MATURITY_STATES,
  LV_PUBLICATION_POLICY_VERSION,
  type LvPublicationMaturity,
} from './lv-publication-thresholds';

export interface LvPublicationReason {
  code: string;
  labelDe: string;
}

export interface LvPublicationEvidenceSummary {
  compatibleCycleCount: number;
  validEvidenceCount: number;
  rejectedEvidenceCount: number;
  contaminationRejectedCount: number;
  /** Latest observedAt from assessment evidence — never live voltage. */
  latestAssessmentEvidenceObservedAt: string | null;
  firstAssessmentEvidenceObservedAt: string | null;
}

export interface LvPublicationPreviousState {
  publicationId: string;
  publishedEstimatedHealth: number | null;
  stabilizedEstimatedHealth: number | null;
  maturity: LvPublicationMaturity;
  publishedAt: string;
  /** Evidence anchor for freshness — live voltage must not refresh this. */
  assessmentEvidenceObservedAt: string | null;
}

export interface EvaluateLvPublicationPolicyInput {
  publicationEnabled: boolean;
  policy: ResolvedBatteryPolicy;
  assessment: LvEstimatedHealthAssessment | null;
  evidence: LvPublicationEvidenceSummary;
  previous: LvPublicationPreviousState | null;
  /** Explicitly ignored for publication freshness (Rule 9). */
  liveVoltageObservedAt?: string | null;
  now?: Date;
}

export interface LvPublicationDecision {
  policyVersion: string;
  maturity: LvPublicationMaturity;
  userFacingPublished: boolean;
  shouldPersistPublication: boolean;
  publishedEstimatedHealth: number | null;
  stabilizedEstimatedHealth: number | null;
  hysteresisBlocked: boolean;
  supersedePublicationId: string | null;
  staleAt: string | null;
  assessmentEvidenceObservedAt: string | null;
  reasons: LvPublicationReason[];
}

function reason(code: string, labelDe: string): LvPublicationReason {
  return { code, labelDe };
}

function isSupportedPublicationProfile(policy: ResolvedBatteryPolicy): boolean {
  return (
    policy.lvAssessmentAllowed &&
    policy.profile !== BatteryPolicyProfile.UNSUPPORTED_PROFILE &&
    policy.profile !== BatteryPolicyProfile.UNKNOWN_PROFILE
  );
}

function daysBetween(
  fromIso: string | null | undefined,
  to: Date,
): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function contaminationDominates(evidence: LvPublicationEvidenceSummary): boolean {
  const considered =
    evidence.validEvidenceCount +
    evidence.rejectedEvidenceCount +
    evidence.contaminationRejectedCount;
  if (considered <= 0) return false;
  return (
    evidence.contaminationRejectedCount / considered >
    LV_PUBLICATION_CONTAMINATION_DOMINANCE_MAX_RATIO
  );
}

function assessmentEvidenceIsFresh(
  observedAt: string | null,
  now: Date,
): boolean {
  const freshness = buildObservationFreshness({
    observedAt,
    maxAgeMs: LV_PUBLICATION_OBSERVATION_STALE_MS,
    now,
    hasValueCarrier: observedAt != null,
  });
  return observationFreshnessIsDecisionFresh(freshness);
}

function deriveTargetMaturity(input: {
  assessment: LvEstimatedHealthAssessment;
  evidence: LvPublicationEvidenceSummary;
  now: Date;
}): { maturity: LvPublicationMaturity; reasons: LvPublicationReason[] } {
  const reasons: LvPublicationReason[] = [];
  const { assessment, evidence, now } = input;

  if (assessment.assessmentMode === 'SHADOW') {
    return {
      maturity: 'SHADOW',
      reasons: [
        reason(
          'shadow_not_user_facing',
          'Shadow-Assessment wird nicht user-facing publiziert',
        ),
      ],
    };
  }

  if (!assessment.publicationEligible) {
    return {
      maturity: 'CALIBRATING',
      reasons: [
        reason(
          'assessment_not_publication_eligible',
          'Assessment ist noch nicht publizierbar',
        ),
      ],
    };
  }

  if (evidence.validEvidenceCount < LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT) {
    reasons.push(
      reason(
        'insufficient_valid_evidence',
        'Nicht genügend valide Evidence für Publication',
      ),
    );
    return { maturity: 'CALIBRATING', reasons };
  }

  if (contaminationDominates(evidence)) {
    reasons.push(
      reason(
        'contamination_dominance',
        'Kontamination dominiert — Publication gesperrt',
      ),
    );
    return { maturity: 'CALIBRATING', reasons };
  }

  if (
    assessment.confidenceScore < LV_PUBLICATION_MIN_CONFIDENCE_SCORE_PROVISIONAL
  ) {
    reasons.push(
      reason('confidence_too_low', 'Confidence unter Mindestschwelle'),
    );
    return { maturity: 'CALIBRATING', reasons };
  }

  if (
    evidence.compatibleCycleCount <
    LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_PROVISIONAL
  ) {
    reasons.push(
      reason(
        'insufficient_compatible_cycles',
        'Zu wenige kompatible Messzyklen für Publication',
      ),
    );
    return { maturity: 'CALIBRATING', reasons };
  }

  if (
    !assessmentEvidenceIsFresh(
      evidence.latestAssessmentEvidenceObservedAt,
      now,
    )
  ) {
    reasons.push(
      reason(
        'assessment_evidence_stale',
        'Assessment-Evidence nicht mehr fresh genug',
      ),
    );
    return { maturity: 'CALIBRATING', reasons };
  }

  const spanDays = daysBetween(
    evidence.firstAssessmentEvidenceObservedAt,
    now,
  );
  const stableRepetition =
    evidence.compatibleCycleCount >= LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE &&
    (spanDays ?? 0) >= LV_PUBLICATION_MIN_DAYS_FOR_STABLE &&
    assessment.confidenceScore >= LV_PUBLICATION_MIN_CONFIDENCE_SCORE_STABLE;

  if (stableRepetition) {
    reasons.push(
      reason('stable_repetition_met', 'Stabile Wiederholung über Messzyklen'),
    );
    return { maturity: 'STABLE', reasons };
  }

  reasons.push(
    reason(
      'provisional_publication',
      'Provisorische Publication — Stabilisierung läuft',
    ),
  );
  return { maturity: 'PROVISIONAL', reasons };
}

function evaluateStalePrevious(
  previous: LvPublicationPreviousState,
  now: Date,
): boolean {
  if (previous.maturity === 'SUPERSEDED') return false;
  const anchor = previous.assessmentEvidenceObservedAt ?? previous.publishedAt;
  const freshness = buildObservationFreshness({
    observedAt: anchor,
    maxAgeMs: LV_PUBLICATION_OBSERVATION_STALE_MS,
    now,
    hasValueCarrier: anchor != null,
  });
  return freshness.observationState === 'STALE';
}

/**
 * Evaluates LV Battery Health V2 publication policy.
 * Live voltage timestamps must not be passed as assessment evidence freshness.
 */
export function evaluateLvPublicationPolicy(
  input: EvaluateLvPublicationPolicyInput,
): LvPublicationDecision {
  const now = input.now ?? new Date();
  const reasons: LvPublicationReason[] = [];

  if (!input.publicationEnabled) {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity: 'UNAVAILABLE',
      userFacingPublished: false,
      shouldPersistPublication: false,
      publishedEstimatedHealth: input.previous?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth: input.previous?.stabilizedEstimatedHealth ?? null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt:
        input.previous?.assessmentEvidenceObservedAt ?? null,
      reasons: [
        reason(
          'publication_flag_disabled',
          'LV Publication V2 ist deaktiviert (batteryV2PublicationEnabled)',
        ),
      ],
    };
  }

  if (!isSupportedPublicationProfile(input.policy)) {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity: 'UNAVAILABLE',
      userFacingPublished: false,
      shouldPersistPublication: false,
      publishedEstimatedHealth: null,
      stabilizedEstimatedHealth: null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt: null,
      reasons: [
        reason(
          'unsupported_profile',
          'Kein LV-Publication ohne unterstütztes Profil',
        ),
      ],
    };
  }

  if (!input.assessment) {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity: 'UNAVAILABLE',
      userFacingPublished: false,
      shouldPersistPublication: false,
      publishedEstimatedHealth: input.previous?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth: input.previous?.stabilizedEstimatedHealth ?? null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt:
        input.previous?.assessmentEvidenceObservedAt ?? null,
      reasons: [
        reason('missing_assessment', 'Kein Assessment für Publication'),
      ],
    };
  }

  if (input.previous && evaluateStalePrevious(input.previous, now)) {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity: 'STALE',
      userFacingPublished: false,
      shouldPersistPublication: true,
      publishedEstimatedHealth: input.previous.publishedEstimatedHealth,
      stabilizedEstimatedHealth: input.previous.stabilizedEstimatedHealth,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: new Date(
        new Date(input.previous.publishedAt).getTime() +
          LV_PUBLICATION_OBSERVATION_STALE_MS,
      ).toISOString(),
      assessmentEvidenceObservedAt: input.previous.assessmentEvidenceObservedAt,
      reasons: [
        reason(
          'publication_stale',
          'Publication-Evidence ist veraltet — kein Live-Spannungs-Refresh',
        ),
      ],
    };
  }

  const { maturity, reasons: maturityReasons } = deriveTargetMaturity({
    assessment: input.assessment,
    evidence: input.evidence,
    now,
  });
  reasons.push(...maturityReasons);

  if (maturity === 'SHADOW' || maturity === 'CALIBRATING') {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity,
      userFacingPublished: false,
      shouldPersistPublication: false,
      publishedEstimatedHealth: input.previous?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth: input.previous?.stabilizedEstimatedHealth ?? null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt:
        input.evidence.latestAssessmentEvidenceObservedAt,
      reasons,
    };
  }

  const rawScore = input.assessment.estimatedHealthScore;
  if (rawScore == null) {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity: 'CALIBRATING',
      userFacingPublished: false,
      shouldPersistPublication: false,
      publishedEstimatedHealth: input.previous?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth: input.previous?.stabilizedEstimatedHealth ?? null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt:
        input.evidence.latestAssessmentEvidenceObservedAt,
      reasons: [
        ...reasons,
        reason('missing_score', 'Kein Score für Publication'),
      ],
    };
  }

  const { stabilized } = stabilize(
    input.previous?.stabilizedEstimatedHealth ?? null,
    rawScore,
    LV_PUBLICATION_EWMA_ALPHA,
    LV_PUBLICATION_EWMA_DAMPED_ALPHA,
  );
  const roundedStabilized = Math.round(stabilized * 100) / 100;

  const maturityAllowsFirstPublish =
    maturity === 'PROVISIONAL' || maturity === 'STABLE';
  const currentPublished = input.previous?.publishedEstimatedHealth ?? null;
  const hysteresisBlocked =
    currentPublished != null &&
    !shouldPublish(
      roundedStabilized,
      currentPublished,
      LV_PUBLICATION_HYSTERESIS_MIN_DELTA_PP,
    );

  let publishedEstimatedHealth = currentPublished;
  if (maturityAllowsFirstPublish) {
    if (currentPublished == null || !hysteresisBlocked) {
      publishedEstimatedHealth = Math.round(roundedStabilized);
    }
  }

  if (hysteresisBlocked) {
    reasons.push(
      reason(
        'hysteresis_blocked',
        'Hysterese verhindert Flattern — Publication unverändert',
      ),
    );
  }

  const valueChanged =
    publishedEstimatedHealth != null &&
    publishedEstimatedHealth !== currentPublished;
  const firstPublication = currentPublished == null && publishedEstimatedHealth != null;
  const shouldPersistPublication =
    maturityAllowsFirstPublish && (firstPublication || valueChanged);

  const supersedePublicationId =
    shouldPersistPublication && input.previous?.publicationId
      ? input.previous.publicationId
      : null;

  if (supersedePublicationId) {
    reasons.push(
      reason(
        'supersedes_previous',
        'Neue Publication ersetzt vorherige auditierbar',
      ),
    );
  }

  reasons.push(
    reason(
      'published_estimated_health_not_soh',
      'Publizierter LV-Wert ist estimatedHealth — nie publishedSohPct',
    ),
  );

  const staleAt = new Date(
    now.getTime() + LV_PUBLICATION_OBSERVATION_STALE_MS,
  ).toISOString();

  return {
    policyVersion: LV_PUBLICATION_POLICY_VERSION,
    maturity,
    userFacingPublished:
      maturityAllowsFirstPublish && publishedEstimatedHealth != null,
    shouldPersistPublication,
    publishedEstimatedHealth,
    stabilizedEstimatedHealth: roundedStabilized,
    hysteresisBlocked,
    supersedePublicationId,
    staleAt,
    assessmentEvidenceObservedAt:
      input.evidence.latestAssessmentEvidenceObservedAt,
    reasons,
  };
}

export function buildLvPublicationReasonPayload(
  decision: LvPublicationDecision,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    policyVersion: decision.policyVersion,
    maturity: decision.maturity,
    publishedEstimatedHealth: decision.publishedEstimatedHealth,
    stabilizedEstimatedHealth: decision.stabilizedEstimatedHealth,
    hysteresisBlocked: decision.hysteresisBlocked,
    supersedePublicationId: decision.supersedePublicationId,
    assessmentEvidenceObservedAt: decision.assessmentEvidenceObservedAt,
    liveVoltageIgnoredForFreshness: true,
    reasons: decision.reasons,
    ...extra,
  };
}
