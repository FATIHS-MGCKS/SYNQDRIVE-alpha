import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import { BatteryPolicyProfile } from '../../battery-policy-profile/battery-policy-profile.types';
import {
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from '../battery-freshness.policy';
import { shouldPublish, stabilize } from '../soh-publication';
import type {
  LvAssessmentTrack,
  LvEstimatedHealthAssessment,
} from './lv-estimated-health-assessment.policy';
import {
  isKnownPublicationTrack,
  resolvePublicationAuthorityEpochChanged,
  type LvPublicationTrackObservability,
} from './lv-publication-authority-epoch.policy';
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
  assessmentId: string | null;
  assessmentTrack: LvPublicationTrackObservability;
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
  /** When true, execution is a same-assessment retry — no new EWMA/hysteresis evolution. */
  isSameAssessmentRetry?: boolean;
  /** When true, evaluate stale lifecycle materialization for previous only. */
  materializeStaleLifecycle?: boolean;
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
  publicationAuthorityEpochChanged: boolean;
  previousAssessmentTrack: LvPublicationTrackObservability;
  currentAssessmentTrack: LvAssessmentTrack | 'UNKNOWN';
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

/** Exported for service-layer lifecycle repair (same pub identity, no new EWMA). */
export function isLvPublicationPreviousStale(
  previous: LvPublicationPreviousState,
  now: Date = new Date(),
): boolean {
  return evaluateStalePrevious(previous, now);
}

function emptyAuthorityContext(
  assessment: LvEstimatedHealthAssessment | null,
  previous: LvPublicationPreviousState | null,
): Pick<
  LvPublicationDecision,
  | 'publicationAuthorityEpochChanged'
  | 'previousAssessmentTrack'
  | 'currentAssessmentTrack'
> {
  const currentTrack = assessment?.assessmentTrack ?? 'UNKNOWN';
  const previousTrack = previous?.assessmentTrack ?? 'UNKNOWN';
  return {
    previousAssessmentTrack: previousTrack,
    currentAssessmentTrack: isKnownPublicationTrack(currentTrack)
      ? currentTrack
      : 'UNKNOWN',
    publicationAuthorityEpochChanged: isKnownPublicationTrack(currentTrack)
      ? resolvePublicationAuthorityEpochChanged({
          previousTrack,
          currentTrack,
        })
      : false,
  };
}

function roundedStabilizedFrom(
  baseline: number | null,
  rawScore: number,
): number {
  const { stabilized } = stabilize(
    baseline,
    rawScore,
    LV_PUBLICATION_EWMA_ALPHA,
    LV_PUBLICATION_EWMA_DAMPED_ALPHA,
  );
  return Math.round(stabilized * 100) / 100;
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
      ...emptyAuthorityContext(input.assessment, input.previous),
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
      ...emptyAuthorityContext(input.assessment, input.previous),
      reasons: [
        reason(
          'unsupported_profile',
          'Kein LV-Publication ohne unterstütztes Profil',
        ),
      ],
    };
  }

  if (!input.assessment) {
    if (
      input.materializeStaleLifecycle &&
      input.previous &&
      evaluateStalePrevious(input.previous, now)
    ) {
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
        ...emptyAuthorityContext(input.assessment, input.previous),
        reasons: [
          reason(
            'publication_stale',
            'Publication-Evidence ist veraltet — kein Live-Spannungs-Refresh',
          ),
        ],
      };
    }

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
      ...emptyAuthorityContext(input.assessment, input.previous),
      reasons: [
        reason('missing_assessment', 'Kein Assessment für Publication'),
      ],
    };
  }

  const authorityContext = emptyAuthorityContext(input.assessment, input.previous);

  if (!isKnownPublicationTrack(input.assessment.assessmentTrack)) {
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
        input.evidence.latestAssessmentEvidenceObservedAt,
      ...authorityContext,
      reasons: [
        reason(
          'unknown_assessment_track',
          'Assessment-Track unbekannt — keine Publication',
        ),
      ],
    };
  }

  if (
    input.materializeStaleLifecycle &&
    input.previous &&
    evaluateStalePrevious(input.previous, now)
  ) {
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
      ...authorityContext,
      reasons: [
        reason(
          'publication_stale',
          'Publication-Evidence ist veraltet — kein Live-Spannungs-Refresh',
        ),
      ],
    };
  }

  const stabilizationPrevious =
    input.previous && !evaluateStalePrevious(input.previous, now)
      ? input.previous
      : null;
  const stabilizationBaseline =
    authorityContext.publicationAuthorityEpochChanged
      ? null
      : (stabilizationPrevious?.stabilizedEstimatedHealth ?? null);
  const hysteresisBaseline =
    authorityContext.publicationAuthorityEpochChanged
      ? null
      : (stabilizationPrevious?.publishedEstimatedHealth ?? null);

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
      publishedEstimatedHealth: stabilizationPrevious?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth: stabilizationPrevious?.stabilizedEstimatedHealth ?? null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt:
        input.evidence.latestAssessmentEvidenceObservedAt,
      ...authorityContext,
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
      publishedEstimatedHealth: stabilizationPrevious?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth: stabilizationPrevious?.stabilizedEstimatedHealth ?? null,
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: null,
      assessmentEvidenceObservedAt:
        input.evidence.latestAssessmentEvidenceObservedAt,
      ...authorityContext,
      reasons: [
        ...reasons,
        reason('missing_score', 'Kein Score für Publication'),
      ],
    };
  }

  if (input.isSameAssessmentRetry) {
    return {
      policyVersion: LV_PUBLICATION_POLICY_VERSION,
      maturity,
      userFacingPublished:
        stabilizationPrevious?.publishedEstimatedHealth != null,
      shouldPersistPublication: false,
      publishedEstimatedHealth:
        stabilizationPrevious?.publishedEstimatedHealth ?? null,
      stabilizedEstimatedHealth:
        stabilizationPrevious?.stabilizedEstimatedHealth ?? roundedStabilizedFrom(
          stabilizationBaseline,
          rawScore,
        ),
      hysteresisBlocked: false,
      supersedePublicationId: null,
      staleAt: new Date(
        now.getTime() + LV_PUBLICATION_OBSERVATION_STALE_MS,
      ).toISOString(),
      assessmentEvidenceObservedAt:
        input.evidence.latestAssessmentEvidenceObservedAt,
      ...authorityContext,
      reasons: [
        ...reasons,
        reason(
          'same_assessment_retry_converged',
          'Wiederholte Ausführung — keine neue Evidence-Anwendung',
        ),
      ],
    };
  }

  const roundedStabilized = roundedStabilizedFrom(stabilizationBaseline, rawScore);

  const maturityAllowsFirstPublish =
    maturity === 'PROVISIONAL' || maturity === 'STABLE';
  const currentPublished = hysteresisBaseline;
  const hysteresisBlocked =
    currentPublished != null &&
    !authorityContext.publicationAuthorityEpochChanged &&
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
  const publicationPersistSignificant =
    firstPublication ||
    valueChanged ||
    authorityContext.publicationAuthorityEpochChanged;
  const shouldPersistPublication =
    maturityAllowsFirstPublish && publicationPersistSignificant && !hysteresisBlocked;

  const supersedePublicationId =
    shouldPersistPublication && stabilizationPrevious?.publicationId
      ? stabilizationPrevious.publicationId
      : null;

  if (authorityContext.publicationAuthorityEpochChanged) {
    reasons.push(
      reason(
        'publication_authority_epoch_changed',
        'Track-Autorität gewechselt — Stabilisierung zurückgesetzt',
      ),
    );
  }

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
    ...authorityContext,
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
    publicationAuthorityEpochChanged: decision.publicationAuthorityEpochChanged,
    previousAssessmentTrack: decision.previousAssessmentTrack,
    currentAssessmentTrack: decision.currentAssessmentTrack,
    liveVoltageIgnoredForFreshness: true,
    reasons: decision.reasons,
    ...extra,
  };
}
