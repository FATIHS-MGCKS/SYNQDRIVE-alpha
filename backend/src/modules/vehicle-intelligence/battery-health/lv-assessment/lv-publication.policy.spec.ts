import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';
import type { LvEstimatedHealthAssessment } from './lv-estimated-health-assessment.policy';
import {
  evaluateLvPublicationPolicy,
  type LvPublicationEvidenceSummary,
  type LvPublicationPreviousState,
} from './lv-publication.policy';
import {
  LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_PROVISIONAL,
  LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE,
  LV_PUBLICATION_MIN_DAYS_FOR_STABLE,
} from './lv-publication-thresholds';

const NOW = new Date('2026-07-16T12:00:00.000Z');
const VEHICLE_ID = 'veh-1';

function iceAgmPolicy() {
  return resolveBatteryPolicy({
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    lvSignalPresent: true,
  });
}

function baseAssessment(
  partial: Partial<LvEstimatedHealthAssessment> = {},
): LvEstimatedHealthAssessment {
  return {
    assessmentType: 'LV_ESTIMATED_HEALTH',
    scoreSemantics: 'ESTIMATED_HEALTH_NOT_SOH',
    assessmentTrack: 'TELEMETRY',
    assessmentMode: 'CANONICAL',
    modelVersion: 1,
    estimatedHealthScore: 82,
    confidence: 'HIGH',
    confidenceScore: 0.85,
    evidenceStrength: 'PRIMARY',
    dataQuality: 'ESTIMATED',
    measurementCoverage: {
      selectedCount: 6,
      rejectedCount: 0,
      restMeasurementCount: 6,
      startProxyCount: 0,
      workshopMeasurementCount: 0,
      shadowExperimentalCount: 0,
      weightedInputCount: 6,
      coverageRatio: 1,
    },
    validFrom: new Date('2026-07-01T08:00:00.000Z').toISOString(),
    validUntil: new Date('2026-08-15T08:00:00.000Z').toISOString(),
    publicationEligible: true,
    reasons: [],
    idempotencyKey: 'assess-key-1',
    inputSummary: {},
    ...partial,
  };
}

function stableEvidence(): LvPublicationEvidenceSummary {
  return {
    compatibleCycleCount: LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE,
    validEvidenceCount: 6,
    rejectedEvidenceCount: 0,
    contaminationRejectedCount: 0,
    latestAssessmentEvidenceObservedAt: NOW.toISOString(),
    firstAssessmentEvidenceObservedAt: new Date(
      NOW.getTime() - LV_PUBLICATION_MIN_DAYS_FOR_STABLE * 24 * 60 * 60_000,
    ).toISOString(),
  };
}

function calibratingEvidence(): LvPublicationEvidenceSummary {
  return {
    compatibleCycleCount: 1,
    validEvidenceCount: 1,
    rejectedEvidenceCount: 0,
    contaminationRejectedCount: 0,
    latestAssessmentEvidenceObservedAt: NOW.toISOString(),
    firstAssessmentEvidenceObservedAt: NOW.toISOString(),
  };
}

describe('lv-publication.policy', () => {
  it('returns UNAVAILABLE when publication flag is disabled', () => {
    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: false,
      policy: iceAgmPolicy(),
      assessment: baseAssessment(),
      evidence: stableEvidence(),
      previous: null,
      now: NOW,
    });

    expect(decision.maturity).toBe('UNAVAILABLE');
    expect(decision.userFacingPublished).toBe(false);
    expect(decision.shouldPersistPublication).toBe(false);
    expect(decision.reasons.some((r) => r.code === 'publication_flag_disabled')).toBe(
      true,
    );
  });

  it('stays in CALIBRATING with insufficient compatible cycles', () => {
    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment({ confidence: 'LOW', confidenceScore: 0.55 }),
      evidence: {
        compatibleCycleCount: 1,
        validEvidenceCount: 3,
        rejectedEvidenceCount: 0,
        contaminationRejectedCount: 0,
        latestAssessmentEvidenceObservedAt: NOW.toISOString(),
        firstAssessmentEvidenceObservedAt: NOW.toISOString(),
      },
      previous: null,
      now: NOW,
    });

    expect(decision.maturity).toBe('CALIBRATING');
    expect(decision.userFacingPublished).toBe(false);
    expect(decision.reasons.some((r) => r.code === 'insufficient_compatible_cycles')).toBe(
      true,
    );
  });

  it('reaches PROVISIONAL after calibration gates with moderate repetition', () => {
    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment(),
      evidence: {
        compatibleCycleCount: LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_PROVISIONAL,
        validEvidenceCount: 4,
        rejectedEvidenceCount: 0,
        contaminationRejectedCount: 0,
        latestAssessmentEvidenceObservedAt: NOW.toISOString(),
        firstAssessmentEvidenceObservedAt: new Date(
          NOW.getTime() - 5 * 24 * 60 * 60_000,
        ).toISOString(),
      },
      previous: null,
      now: NOW,
    });

    expect(decision.maturity).toBe('PROVISIONAL');
    expect(decision.userFacingPublished).toBe(true);
    expect(decision.shouldPersistPublication).toBe(true);
    expect(decision.publishedEstimatedHealth).toBe(82);
  });

  it('reaches STABLE when stable repetition gates are met', () => {
    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment(),
      evidence: stableEvidence(),
      previous: null,
      now: NOW,
    });

    expect(decision.maturity).toBe('STABLE');
    expect(decision.userFacingPublished).toBe(true);
    expect(decision.shouldPersistPublication).toBe(true);
    expect(decision.reasons.some((r) => r.code === 'stable_repetition_met')).toBe(
      true,
    );
  });

  it('blocks shadow assessments from user-facing publication', () => {
    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment({
        assessmentMode: 'SHADOW',
        publicationEligible: false,
      }),
      evidence: stableEvidence(),
      previous: null,
      now: NOW,
    });

    expect(decision.maturity).toBe('SHADOW');
    expect(decision.userFacingPublished).toBe(false);
    expect(decision.shouldPersistPublication).toBe(false);
  });

  it('applies hysteresis to prevent flutter on small score changes', () => {
    const previous: LvPublicationPreviousState = {
      publicationId: 'pub-1',
      publishedEstimatedHealth: 80,
      stabilizedEstimatedHealth: 80,
      maturity: 'STABLE',
      publishedAt: new Date(NOW.getTime() - 24 * 60 * 60_000).toISOString(),
      assessmentEvidenceObservedAt: NOW.toISOString(),
    };

    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment({ estimatedHealthScore: 81 }),
      evidence: stableEvidence(),
      previous,
      now: NOW,
    });

    expect(decision.hysteresisBlocked).toBe(true);
    expect(decision.publishedEstimatedHealth).toBe(80);
    expect(decision.shouldPersistPublication).toBe(false);
    expect(decision.reasons.some((r) => r.code === 'hysteresis_blocked')).toBe(true);
  });

  it('marks publication STALE without using live voltage freshness', () => {
    const staleAnchor = new Date(
      NOW.getTime() - 50 * 24 * 60 * 60_000,
    ).toISOString();
    const previous: LvPublicationPreviousState = {
      publicationId: 'pub-stale',
      publishedEstimatedHealth: 78,
      stabilizedEstimatedHealth: 78,
      maturity: 'STABLE',
      publishedAt: staleAnchor,
      assessmentEvidenceObservedAt: staleAnchor,
    };

    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment(),
      evidence: stableEvidence(),
      previous,
      liveVoltageObservedAt: NOW.toISOString(),
      now: NOW,
    });

    expect(decision.maturity).toBe('STALE');
    expect(decision.userFacingPublished).toBe(false);
    expect(decision.shouldPersistPublication).toBe(true);
    expect(decision.reasons.some((r) => r.code === 'publication_stale')).toBe(
      true,
    );
  });

  it('supersedes previous publication when a new value is published', () => {
    const previous: LvPublicationPreviousState = {
      publicationId: 'pub-old',
      publishedEstimatedHealth: 68,
      stabilizedEstimatedHealth: 70,
      maturity: 'PROVISIONAL',
      publishedAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000).toISOString(),
      assessmentEvidenceObservedAt: NOW.toISOString(),
    };

    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment({ estimatedHealthScore: 76 }),
      evidence: stableEvidence(),
      previous,
      now: NOW,
    });

    expect(decision.shouldPersistPublication).toBe(true);
    expect(decision.supersedePublicationId).toBe('pub-old');
    expect(decision.publishedEstimatedHealth).toBe(70);
    expect(decision.reasons.some((r) => r.code === 'supersedes_previous')).toBe(
      true,
    );
  });

  it('blocks publication when contamination dominates', () => {
    const decision = evaluateLvPublicationPolicy({
      publicationEnabled: true,
      policy: iceAgmPolicy(),
      assessment: baseAssessment(),
      evidence: {
        compatibleCycleCount: 6,
        validEvidenceCount: 2,
        rejectedEvidenceCount: 1,
        contaminationRejectedCount: 4,
        latestAssessmentEvidenceObservedAt: NOW.toISOString(),
        firstAssessmentEvidenceObservedAt: new Date(
          NOW.getTime() - 20 * 24 * 60 * 60_000,
        ).toISOString(),
      },
      previous: null,
      now: NOW,
    });

    expect(decision.maturity).toBe('CALIBRATING');
    expect(decision.reasons.some((r) => r.code === 'contamination_dominance')).toBe(
      true,
    );
  });
});
