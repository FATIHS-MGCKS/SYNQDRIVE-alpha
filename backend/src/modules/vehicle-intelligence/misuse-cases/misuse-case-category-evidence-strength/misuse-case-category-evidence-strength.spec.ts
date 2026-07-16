import {
  MisuseAttributionScope,
  MisuseCaseType,
  MisuseEvidenceSourceType,
  TripAssignmentStatus,
} from '@prisma/client';
import {
  MISUSE_CATEGORY_EVIDENCE_KEYS,
  MISUSE_CATEGORY_EVIDENCE_PROFILES,
} from './misuse-case-category-evidence-strength.config';
import {
  assessMisuseCategoryEvidenceStrength,
  blocksConfirmedMisuseFromProxy,
  isDataIntegrityMisuseCaseType,
  resolveCategoryMaturity,
} from './misuse-case-category-evidence-strength';
import {
  applyCategoryEffectCaps,
  gateMisuseCandidatesByCategoryEvidenceStrength,
} from './misuse-case-category-evidence-strength.gate';
import type { EvidenceCandidate } from '../misuse-case.types';

const at = (iso: string) => new Date(iso);

const behavior = (id: string, eventType = 'KICKDOWN'): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
  sourceId: id,
  eventType,
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const driving = (id: string, eventType = 'HARSH_BRAKING'): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
  sourceId: id,
  eventType,
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const dimo = (id: string, eventType = 'safety.collision'): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.DIMO_EVENT,
  sourceId: id,
  eventType,
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const context = (id: string): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
  sourceId: id,
  eventType: 'COLD_ENGINE_HIGH_LOAD',
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const proxy = (eventType = 'derived-pattern'): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
  eventType,
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const dtc = (id: string): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.DTC,
  sourceId: id,
  eventType: 'P0300',
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const manual = (id: string): EvidenceCandidate => ({
  sourceType: MisuseEvidenceSourceType.MANUAL_VERIFICATION,
  sourceId: id,
  eventType: 'operator-confirmed',
  occurredAt: at('2026-06-01T10:00:00Z'),
});

const bookingAttribution = {
  attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
  assignmentStatusSnapshot: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
  isPrivateTripSnapshot: false,
};

function assess(
  caseType: MisuseCaseType,
  qualifiedEvidence: EvidenceCandidate[],
  overrides: Partial<Parameters<typeof assessMisuseCategoryEvidenceStrength>[0]> = {},
) {
  return assessMisuseCategoryEvidenceStrength({
    caseType,
    qualifiedEvidence,
    repetitionCount: qualifiedEvidence.length,
    coverageQuality: 'GOOD',
    attributionConfidence: 'HIGH',
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    ...overrides,
  });
}

describe('misuse-case-category-evidence-strength', () => {
  it('defines all nine prompt-51 categories', () => {
    expect(Object.keys(MISUSE_CATEGORY_EVIDENCE_PROFILES)).toHaveLength(9);
    expect(MISUSE_CATEGORY_EVIDENCE_KEYS.COLLISION).toBe(MisuseCaseType.DIMO_COLLISION_REPORTED);
    expect(MISUSE_CATEGORY_EVIDENCE_KEYS.LAUNCH_LIKE_USE).toBe(MisuseCaseType.LAUNCH_ABUSE_PATTERN);
  });

  it('blocks data integrity misuse case types from customer emission', () => {
    expect(isDataIntegrityMisuseCaseType(MisuseCaseType.TELEMETRY_INTEGRITY_ISSUE)).toBe(true);
    const gated = gateMisuseCandidatesByCategoryEvidenceStrength(
      [
        {
          type: MisuseCaseType.TELEMETRY_INTEGRITY_ISSUE,
          category: 'TAMPERING_DATA_INTEGRITY',
          severity: 'WARNING',
          confidence: 'MEDIUM',
          title: 'x',
          description: 'x',
          evidence: [behavior('e1')],
          eventCount: 1,
          firstDetectedAt: at('2026-06-01T10:00:00Z'),
          lastDetectedAt: at('2026-06-01T10:00:00Z'),
        } as any,
      ],
      bookingAttribution,
    );
    expect(gated).toHaveLength(0);
  });

  it('rejects data quality issues for profiled categories', () => {
    const result = assess(MisuseCaseType.COLD_ENGINE_ABUSE, [behavior('c1'), behavior('c2')], {
      dataQualityIssue: true,
    });
    expect(result.passes).toBe(false);
    expect(result.rejectionReasons).toContain('DATA_QUALITY_ISSUE');
  });

  it('proxy-only evidence cannot confirm misuse', () => {
    expect(blocksConfirmedMisuseFromProxy([proxy()])).toBe(true);
    const assessment = assess(MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT, [behavior('p1', 'POSSIBLE_IMPACT')], {
      coverageQuality: 'SPARSE',
    });
    const capped = applyCategoryEffectCaps(
      {
        status: 'CONFIRMED',
        decisionEligibility: 'OPERATIONAL_ELIGIBLE',
        informationalOnly: false,
        attributionConfidence: 'HIGH',
        resolvedAt: null,
        resolutionReason: null,
      },
      assessment,
    );
    expect(capped.status).not.toBe('CONFIRMED');
    expect(capped.decisionEligibility).not.toBe('OPERATIONAL_ELIGIBLE');
  });

  describe('AGGRESSIVE_DRIVING_PATTERN', () => {
    const caseType = MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN;

    it('passes with repeated direct behavior evidence', () => {
      const result = assess(caseType, [behavior('a1'), behavior('a2')]);
      expect(result.passes).toBe(true);
      expect(result.maturity).toBe('PUBLISHED');
    });

    it('rejects proxy-only evidence', () => {
      const result = assess(caseType, [proxy()], { coverageQuality: 'SPARSE' });
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('PROXY_ONLY_INSUFFICIENT');
    });
  });

  describe('COLD_ENGINE_ABUSE', () => {
    const caseType = MisuseCaseType.COLD_ENGINE_ABUSE;

    it('passes with repeated HF evidence and good coverage', () => {
      const result = assess(caseType, [behavior('c1', 'COLD_ENGINE_HIGH_RPM'), behavior('c2', 'COLD_ENGINE_FULL_THROTTLE')]);
      expect(result.passes).toBe(true);
      expect(result.healthEligibility).toBe('LIMITED');
    });

    it('rejects insufficient coverage', () => {
      const result = assess(caseType, [behavior('c1'), behavior('c2')], { coverageQuality: 'SPARSE' });
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('INSUFFICIENT_COVERAGE');
    });

    it('runs context-only evidence in shadow maturity', () => {
      const profile = MISUSE_CATEGORY_EVIDENCE_PROFILES.COLD_ENGINE_ABUSE;
      expect(resolveCategoryMaturity(profile, [context('ctx-1'), context('ctx-2')])).toBe('SHADOW');
    });
  });

  describe('LAUNCH_LIKE_USE', () => {
    const caseType = MisuseCaseType.LAUNCH_ABUSE_PATTERN;

    it('passes with two launch-like behavior events', () => {
      const result = assess(caseType, [behavior('l1', 'LAUNCH_LIKE_START'), behavior('l2', 'LAUNCH_LIKE_START')]);
      expect(result.passes).toBe(true);
    });

    it('rejects single-event repetition', () => {
      const result = assess(caseType, [behavior('l1', 'LAUNCH_LIKE_START')], { coverageQuality: 'SPARSE' });
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('INSUFFICIENT_REPETITION');
    });
  });

  describe('BRAKE_ABUSE', () => {
    const caseType = MisuseCaseType.BRAKE_ABUSE_PATTERN;

    it('passes with repeated braking evidence', () => {
      const result = assess(caseType, [behavior('b1', 'FULL_BRAKING'), behavior('b2', 'FULL_BRAKING')], {
        coverageQuality: 'SPARSE',
      });
      expect(result.passes).toBe(true);
      expect(result.healthEligibility).toBe('LIMITED');
    });

    it('caps shadow proxy evidence to review-only customer eligibility', () => {
      const result = assess(caseType, [driving('d1', 'EXTREME_BRAKING'), proxy('brake-cluster')], {
        coverageQuality: 'SPARSE',
      });
      expect(result.passes).toBe(true);
      expect(result.maturity).toBe('PUBLISHED');
    });
  });

  describe('REV_IN_IDLE', () => {
    const caseType = MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE;

    it('passes with three rev-idle events', () => {
      const result = assess(caseType, [
        behavior('r1', 'ENGINE_REV_IN_IDLE'),
        behavior('r2', 'ENGINE_REV_IN_IDLE'),
        behavior('r3', 'ENGINE_REV_IN_IDLE'),
      ]);
      expect(result.passes).toBe(true);
    });

    it('rejects low attribution on private scope', () => {
      const result = assess(caseType, [behavior('r1'), behavior('r2'), behavior('r3')], {
        attributionConfidence: 'LOW',
        attributionScope: MisuseAttributionScope.PRIVATE_UNASSIGNED,
      });
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('ATTRIBUTION_SCOPE_BLOCKED');
    });
  });

  describe('POSSIBLE_IMPACT', () => {
    const caseType = MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT;

    it('passes with kinematic impact evidence', () => {
      const result = assess(caseType, [behavior('p1', 'POSSIBLE_IMPACT')], { coverageQuality: 'SPARSE' });
      expect(result.passes).toBe(true);
      expect(result.customerEligibility).toBe('MANUAL_CONFIRMATION_ONLY');
    });

    it('rejects proxy-only impact', () => {
      const result = assess(caseType, [proxy('impact')], { coverageQuality: 'SPARSE' });
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('PROXY_ONLY_INSUFFICIENT');
    });
  });

  describe('COLLISION', () => {
    const caseType = MisuseCaseType.DIMO_COLLISION_REPORTED;

    it('passes with provider collision evidence', () => {
      const result = assess(caseType, [dimo('d1')]);
      expect(result.passes).toBe(true);
      expect(result.healthEligibility).toBe('FULL');
      expect(result.customerEligibility).toBe('MANUAL_CONFIRMATION_ONLY');
    });

    it('rejects behavior-only collision proxy', () => {
      const result = assess(caseType, [behavior('b1', 'POSSIBLE_IMPACT')]);
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('DISALLOWED_SOURCE_TYPE');
    });
  });

  describe('OVERHEATING', () => {
    const caseType = MisuseCaseType.OVERHEATING_DAMAGE_RISK;

    it('passes with overheating behavior evidence', () => {
      const result = assess(caseType, [behavior('o1', 'OVERHEATING_ENGINE')]);
      expect(result.passes).toBe(true);
      expect(result.healthEligibility).toBe('FULL');
    });

    it('rejects low coverage overheating context', () => {
      const result = assess(caseType, [context('ctx-1')], { coverageQuality: 'NONE' });
      expect(result.passes).toBe(false);
      expect(result.rejectionReasons).toContain('INSUFFICIENT_COVERAGE');
    });
  });

  describe('DTC_AFTER_ABUSE', () => {
    const caseType = MisuseCaseType.DTC_AFTER_ABUSE_OR_IMPACT;

    it('passes with DTC plus abuse context', () => {
      const result = assess(caseType, [dtc('dtc-1'), behavior('a1', 'POSSIBLE_IMPACT')], {
        coverageQuality: 'SPARSE',
      });
      expect(result.passes).toBe(true);
      expect(result.healthEligibility).toBe('LIMITED');
    });

    it('allows manual confirmation path', () => {
      const result = assess(caseType, [manual('mv-1'), dtc('dtc-1')], { coverageQuality: 'SPARSE' });
      expect(result.passes).toBe(true);
      expect(result.maturity).toBe('PUBLISHED');
    });
  });
});
