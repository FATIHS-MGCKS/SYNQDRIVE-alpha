import {
  MisuseAttributionScope,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import {
  appendSupersededRatingAudit,
  hasHighValueEvidence,
  reconcileMisuseCaseRating,
} from './misuse-case-rating-reconciliation';
import { MISUSE_RATING_RECONCILIATION_VERSION } from './misuse-case-rating-reconciliation.config';

const baseInput = {
  caseType: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
  evidenceLevel: 'CHECK_RECOMMENDED' as const,
  attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
  attributionConfidence: 'HIGH' as const,
  modelVersion: 'misuse-fingerprint-v1',
  existingSeverity: null,
  existingConfidence: null,
};

describe('misuse-case-rating-reconciliation', () => {
  it('upgrades severity when cluster and direct evidence grow', () => {
    const first = reconcileMisuseCaseRating({
      ...baseInput,
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
    });

    const second = reconcileMisuseCaseRating({
      ...baseInput,
      clusterCount: 3,
      existingSeverity: first.severity,
      existingConfidence: first.confidence,
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e2',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:05:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e3',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:10:00Z'),
        },
      ],
    });

    expect(second.severity).toBe(MisuseCaseSeverity.SEVERE);
    expect(second.audit.direction).toBe('UPGRADE');
    expect(second.shouldResolve).toBe(false);
  });

  it('downgrades severity when evidence shrinks to a single weak unit', () => {
    const prior = reconcileMisuseCaseRating({
      ...baseInput,
      clusterCount: 3,
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e1',
          eventType: 'KICKDOWN',
          severity: MisuseCaseSeverity.SEVERE,
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e2',
          eventType: 'KICKDOWN',
          severity: MisuseCaseSeverity.SEVERE,
          occurredAt: new Date('2026-06-01T10:05:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e3',
          eventType: 'KICKDOWN',
          severity: MisuseCaseSeverity.SEVERE,
          occurredAt: new Date('2026-06-01T10:10:00Z'),
        },
      ],
    });

    const next = reconcileMisuseCaseRating({
      ...baseInput,
      existingSeverity: prior.severity,
      existingConfidence: prior.confidence,
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
          eventType: 'pattern',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
    });

    expect(next.severity).toBe(MisuseCaseSeverity.WARNING);
    expect(next.confidence).not.toBe(MisuseCaseConfidence.HIGH);
    expect(next.proxyOnly).toBe(true);
    expect(next.audit.direction).toBe('DOWNGRADE');
  });

  it('resolves when qualified evidence disappears', () => {
    const result = reconcileMisuseCaseRating({
      ...baseInput,
      existingSeverity: MisuseCaseSeverity.WARNING,
      existingConfidence: MisuseCaseConfidence.MEDIUM,
      qualifiedEvidence: [],
    });

    expect(result.shouldResolve).toBe(true);
    expect(result.resolutionReason).toContain('Evidence entfallen');
    expect(result.severity).toBe(MisuseCaseSeverity.INFO);
    expect(result.confidence).toBe(MisuseCaseConfidence.LOW);
  });

  it('caps proxy-only evidence at WARNING / MEDIUM', () => {
    const result = reconcileMisuseCaseRating({
      ...baseInput,
      evidenceLevel: 'DAMAGE_RISK',
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
          eventType: 'proxy-cluster',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
          eventType: 'proxy-cluster',
          occurredAt: new Date('2026-06-01T10:30:00Z'),
        },
      ],
    });

    expect(result.proxyOnly).toBe(true);
    expect(result.severity).toBe(MisuseCaseSeverity.WARNING);
    expect(result.confidence).not.toBe(MisuseCaseConfidence.HIGH);
  });

  it('elevates collision and manual evidence', () => {
    expect(
      hasHighValueEvidence({
        caseType: MisuseCaseType.DIMO_COLLISION_REPORTED,
        qualifiedEvidence: [
          {
            sourceType: MisuseEvidenceSourceType.DIMO_EVENT,
            sourceId: 'dimo-1',
            eventType: 'safety.collision',
            occurredAt: new Date(),
          },
        ],
      }),
    ).toBe(true);

    const collision = reconcileMisuseCaseRating({
      ...baseInput,
      caseType: MisuseCaseType.DIMO_COLLISION_REPORTED,
      evidenceLevel: 'CRITICAL_DAMAGE_RISK',
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.DIMO_EVENT,
          sourceId: 'dimo-1',
          eventType: 'safety.collision',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
    });

    expect(collision.severity).toBe(MisuseCaseSeverity.CRITICAL);
    expect(collision.confidence).toBe(MisuseCaseConfidence.HIGH);
    expect(collision.hasHighValueEvidence).toBe(true);

    const manual = reconcileMisuseCaseRating({
      ...baseInput,
      caseType: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
      evidenceLevel: 'DAMAGE_RISK',
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.MANUAL_VERIFICATION,
          sourceId: 'mv-1',
          eventType: 'operator-confirmed',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
    });

    expect(manual.hasHighValueEvidence).toBe(true);
    expect(manual.confidence).toBe(MisuseCaseConfidence.HIGH);
  });

  it('is deterministic across identical evaluations', () => {
    const evidence = [
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'e1',
        eventType: 'KICKDOWN',
        occurredAt: new Date('2026-06-01T10:00:00Z'),
      },
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'e2',
        eventType: 'KICKDOWN',
        occurredAt: new Date('2026-06-01T10:05:00Z'),
      },
    ];

    const a = reconcileMisuseCaseRating({ ...baseInput, qualifiedEvidence: evidence });
    const b = reconcileMisuseCaseRating({ ...baseInput, qualifiedEvidence: evidence });
    const c = reconcileMisuseCaseRating({ ...baseInput, qualifiedEvidence: evidence });

    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.modelVersion).toBe(MISUSE_RATING_RECONCILIATION_VERSION);
  });

  it('appends superseded rating audit instead of silent overwrite', () => {
    const first = reconcileMisuseCaseRating({
      ...baseInput,
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
      ],
    });

    const second = reconcileMisuseCaseRating({
      ...baseInput,
      clusterCount: 3,
      existingSeverity: first.severity,
      existingConfidence: first.confidence,
      qualifiedEvidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:00:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e2',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:05:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'e3',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T10:10:00Z'),
        },
      ],
    });

    const merged = appendSupersededRatingAudit(
      { ratingReconciliation: first.audit },
      second,
    ) as {
      ratingReconciliation: typeof second.audit;
      ratingReconciliationHistory?: Array<{ reconciledSeverity: string }>;
    };

    expect(merged.ratingReconciliation).toEqual(second.audit);
    expect(merged.ratingReconciliationHistory).toHaveLength(1);
    expect(merged.ratingReconciliationHistory?.[0]?.reconciledSeverity).toBe(first.severity);
  });
});
