import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import {
  isTemporallyUncertainEvidence,
  tagR1TemporallyUncertainEvidence,
} from './misuse-case-r1-temporal-containment';
import { reconcileMisuseCaseRating } from './misuse-case-rating-reconciliation/misuse-case-rating-reconciliation';
import { buildQualifiedEvidenceKeys } from './misuse-case-fingerprint/misuse-case-fingerprint';
import { MisuseCaseRulesService } from './misuse-case-rules.service';
import { MisuseCasePersistenceHelper } from './misuse-case-persistence.helper';
import { MisuseCaseEvidenceService } from './misuse-case-evidence.service';
import type { CaseCandidate, EvidenceCandidate, TripEvaluationContext } from './misuse-case.types';

const T0 = new Date('2026-09-01T10:00:00.000Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

function hfEvidence(id: string, eventType: string, min: number): EvidenceCandidate {
  return {
    sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
    sourceId: id,
    eventType,
    occurredAt: at(min),
    snapshotJson: { classification: 'SEVERE' },
  };
}

function nativeEvidence(id: string, eventType: string, min: number): EvidenceCandidate {
  return {
    sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
    sourceId: id,
    eventType,
    occurredAt: at(min),
    snapshotJson: { severity: 3 },
  };
}

function candidate(type: MisuseCaseType, evidence: EvidenceCandidate[]): CaseCandidate {
  return {
    type,
    category: MisuseCaseCategory.MISUSE_SUSPICION,
    severity: MisuseCaseSeverity.SEVERE,
    confidence: MisuseCaseConfidence.HIGH,
    title: 't',
    description: 'd',
    evidence,
    eventCount: evidence.length,
    firstDetectedAt: at(0),
    lastDetectedAt: at(30),
  };
}

function rate(type: MisuseCaseType, evidence: EvidenceCandidate[], evidenceLevel = 'DAMAGE_RISK') {
  return reconcileMisuseCaseRating({
    caseType: type,
    qualifiedEvidence: evidence,
    evidenceLevel: evidenceLevel as any,
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    attributionConfidence: 'HIGH' as any,
    modelVersion: 'test',
  });
}

describe('Misuse evidence tagging — R1 temporal containment (EXP-021 C0.3)', () => {
  const mixed = candidate(MisuseCaseType.BRAKE_ABUSE_PATTERN, [
    hfEvidence('b1', 'FULL_BRAKING', 1),
    {
      sourceType: MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
      sourceId: 'de-9',
      eventType: 'KICKDOWN_LIKELY',
      occurredAt: at(2),
      snapshotJson: { evidenceGrade: 'B' },
    },
    nativeEvidence('d1', 'EXTREME_BRAKING', 3),
    {
      sourceType: MisuseEvidenceSourceType.DTC,
      sourceId: 'dtc-1',
      eventType: 'C0035',
      occurredAt: at(40),
      snapshotJson: null,
    },
  ]);

  it('tags only R1 OBD-derived evidence and discloses the containment in evidenceSummary', () => {
    const tagged = tagR1TemporallyUncertainEvidence(mixed, 'RUPTELA_R1');
    expect(tagged.evidence.map(isTemporallyUncertainEvidence)).toEqual([true, true, false, false]);
    expect(tagged.evidence[1].snapshotJson).toEqual({
      evidenceGrade: 'B',
      temporalProvenance: 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN',
    });
    expect(tagged.evidenceSummary?.r1TemporalContainment).toEqual({
      version: 'r1-temporal-containment-v2',
      reason: 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN',
      uncertainEvidenceCount: 2,
      independentEvidenceCount: 2,
    });
    expect(mixed.evidence[0].snapshotJson).toEqual({ classification: 'SEVERE' });
  });

  it('does not change category, type, severity input or qualified evidence keys (fingerprint stable)', () => {
    const tagged = tagR1TemporallyUncertainEvidence(mixed, 'RUPTELA_R1');
    expect(tagged.type).toBe(mixed.type);
    expect(tagged.category).toBe(mixed.category);
    expect(tagged.evidence).toHaveLength(mixed.evidence.length);
    expect(buildQualifiedEvidenceKeys(tagged.evidence)).toEqual(buildQualifiedEvidenceKeys(mixed.evidence));
  });

  it.each([undefined, 'API_SYNTHETIC', 'UNKNOWN'] as const)('leaves %s candidates untouched', (family) => {
    expect(tagR1TemporallyUncertainEvidence(mixed, family)).toBe(mixed);
  });
});

describe('Misuse rating — temporally uncertain evidence cap (EXP-021 C0.3)', () => {
  const r1Only = tagR1TemporallyUncertainEvidence(
    candidate(MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT, [hfEvidence('b1', 'POSSIBLE_IMPACT', 1)]),
    'RUPTELA_R1',
  );

  it('baseline: the same untagged HF impact evidence would rate CRITICAL', () => {
    const baseline = rate(MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT, [hfEvidence('b1', 'POSSIBLE_IMPACT', 1)]);
    expect(baseline.severity).toBe(MisuseCaseSeverity.CRITICAL);
    expect(baseline.temporallyUncertainOnly).toBe(false);
    expect(baseline.audit.temporalContainment).toBeUndefined();
  });

  it('R1-only uncertain evidence cannot establish SEVERE+ and caps confidence at MEDIUM', () => {
    const rating = rate(MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT, r1Only.evidence);
    expect(rating.severity).toBe(MisuseCaseSeverity.WARNING);
    expect(rating.confidence).not.toBe(MisuseCaseConfidence.HIGH);
    expect(rating.temporallyUncertainOnly).toBe(true);
    expect(rating.shouldResolve).toBe(false);
    expect(rating.audit.reasons).toContain('temporallyUncertainOnlyCap');
    expect(rating.audit.temporalContainment).toEqual({
      uncertainEvidenceCount: 1,
      temporallyUncertainOnly: true,
    });
  });

  it('R1 uncertain evidence cannot upgrade a weakly supported mixed case to SEVERE', () => {
    const evidence = tagR1TemporallyUncertainEvidence(
      candidate(MisuseCaseType.BRAKE_ABUSE_PATTERN, [
        hfEvidence('b1', 'FULL_BRAKING', 1),
        hfEvidence('b2', 'FULL_BRAKING', 2),
        hfEvidence('b3', 'FULL_BRAKING', 3),
        nativeEvidence('d1', 'EXTREME_BRAKING', 4),
      ]),
      'RUPTELA_R1',
    ).evidence;
    const untagged = rate(MisuseCaseType.BRAKE_ABUSE_PATTERN, evidence.map((e) => ({ ...e, snapshotJson: {} })), 'CHECK_RECOMMENDED');
    expect(untagged.severity).toBe(MisuseCaseSeverity.SEVERE);

    const rating = rate(MisuseCaseType.BRAKE_ABUSE_PATTERN, evidence, 'CHECK_RECOMMENDED');
    expect(rating.severity).toBe(MisuseCaseSeverity.WARNING);
    expect(rating.temporallyUncertainOnly).toBe(false);
    expect(rating.audit.reasons).toContain('temporallyUncertainEvidenceCap');
  });

  it('independent evidence that supports SEVERE on its own keeps SEVERE', () => {
    const evidence = tagR1TemporallyUncertainEvidence(
      candidate(MisuseCaseType.BRAKE_ABUSE_PATTERN, [
        hfEvidence('b1', 'FULL_BRAKING', 1),
        nativeEvidence('d1', 'EXTREME_BRAKING', 2),
        nativeEvidence('d2', 'EXTREME_BRAKING', 3),
        nativeEvidence('d3', 'EXTREME_BRAKING', 4),
      ]),
      'RUPTELA_R1',
    ).evidence;
    const rating = rate(MisuseCaseType.BRAKE_ABUSE_PATTERN, evidence, 'CHECK_RECOMMENDED');
    expect(rating.severity).toBe(MisuseCaseSeverity.SEVERE);
  });
});

describe('Misuse rules — R1 evidence tagging end to end (EXP-021 C0.3)', () => {
  function context(family: TripEvaluationContext['telemetrySourceFamily']): TripEvaluationContext {
    const fb = (id: string, min: number) =>
      ({
        id,
        eventCategory: 'ABUSE',
        eventType: 'FULL_BRAKING',
        classification: 'SEVERE',
        startedAt: at(min),
        durationMs: 1000,
        peakValue: 9,
      }) as any;
    return {
      trip: {
        id: 't1',
        vehicleId: 'v1',
        organizationId: 'org-1',
        startTime: at(0),
        endTime: at(60),
        assignmentStatus: 'ASSIGNED_BOOKING_CUSTOMER',
        assignmentSubjectType: 'BOOKING_CUSTOMER',
        assignmentSubjectId: 'cust-1',
        assignedBookingId: 'book-1',
        bookingLinkSource: 'EXPLICIT',
        bookingCustomerId: 'cust-1',
        assignedDriverId: null,
        actualDriverId: null,
        isPrivateTrip: false,
        kickdownCount: 0,
        possibleImpactCount: 0,
        coldEngineAbuseCount: 0,
        hardAccelerationCount: 0,
        hardBrakingCount: 0,
        fullBrakingCount: 3,
        abuseEvents: 3,
      } as any,
      behaviorEvents: [fb('b1', 1), fb('b2', 5), fb('b3', 9)],
      drivingEvents: [],
      dimoSafetyEvents: [],
      dtcEvents: [],
      telemetrySourceFamily: family,
    };
  }

  it('R1 HF FULL_BRAKING evidence is tagged; case type/category unchanged', () => {
    const [brake] = new MisuseCaseRulesService()
      .evaluate(context('RUPTELA_R1'))
      .filter((c) => c.type === MisuseCaseType.BRAKE_ABUSE_PATTERN);
    expect(brake.category).toBe(MisuseCaseCategory.MISUSE_SUSPICION);
    expect(brake.evidence.every(isTemporallyUncertainEvidence)).toBe(true);
    expect((brake.evidenceSummary as any).r1TemporalContainment.uncertainEvidenceCount).toBe(3);
  });

  it('Tesla (API synthetic) evidence is not tagged', () => {
    const [brake] = new MisuseCaseRulesService()
      .evaluate(context('API_SYNTHETIC'))
      .filter((c) => c.type === MisuseCaseType.BRAKE_ABUSE_PATTERN);
    expect(brake.evidence.some(isTemporallyUncertainEvidence)).toBe(false);
    expect((brake.evidenceSummary as any).r1TemporalContainment).toBeUndefined();
  });
});

describe('Misuse persistence — R1-only case stays REVIEW_REQUIRED at WARNING (EXP-021 C0.3)', () => {
  const store = new Map<string, any>();
  const evidenceRows: any[] = [];
  const prisma = {
    misuseCase: {
      findUnique: jest.fn(async ({ where }: any) => store.get(where.fingerprint) ?? null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `case-${store.size + 1}`, ...data };
        store.set(data.fingerprint, row);
        return row;
      }),
      update: jest.fn(),
    },
    misuseCaseEvidence: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async ({ data }: any) => {
        evidenceRows.push(...data);
        return { count: data.length };
      }),
    },
  };
  const helper = new MisuseCasePersistenceHelper(prisma as any, new MisuseCaseEvidenceService(prisma as any));
  const attribution = {
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    bookingId: 'book-1',
    customerId: 'cust-1',
    bookingCustomerId: 'cust-1',
    assignedDriverId: null,
    actualDriverId: null,
    customerDecisionEligible: true,
    driverDecisionEligible: false,
    assignmentStatusSnapshot: 'ASSIGNED_BOOKING_CUSTOMER' as const,
    assignmentSubjectTypeSnapshot: 'BOOKING_CUSTOMER' as const,
    assignmentSubjectIdSnapshot: 'cust-1',
    assignedBookingIdSnapshot: 'book-1',
    isPrivateTripSnapshot: false,
  };
  const upsertContext = {
    tripEndTime: at(60),
    behaviorEventCount: 3,
    drivingEventCount: 0,
    contextAnchorCount: 0,
    dimoSafetyEventCount: 0,
    dtcEventCount: 0,
    analysisRunId: null,
  };

  it('creates a review case capped at WARNING with the disclosure persisted', async () => {
    const tagged = tagR1TemporallyUncertainEvidence(
      {
        ...candidate(MisuseCaseType.BRAKE_ABUSE_PATTERN, [
          hfEvidence('b1', 'FULL_BRAKING', 1),
          hfEvidence('b2', 'FULL_BRAKING', 5),
          hfEvidence('b3', 'FULL_BRAKING', 9),
        ]),
        evidenceSummary: {
          evidenceCase: { evidenceLevel: 'DAMAGE_RISK', title: 't', explanation: 'e' },
        },
      },
      'RUPTELA_R1',
    );

    await helper.upsertCandidate('org-1', 'v1', 't1', tagged, attribution, upsertContext);

    const stored = [...store.values()][0];
    expect(stored).toBeDefined();
    expect(stored.severity).toBe(MisuseCaseSeverity.WARNING);
    expect(stored.status).toBe(MisuseCaseStatus.REVIEW_REQUIRED);
    expect(stored.evidenceSummary.r1TemporalContainment.uncertainEvidenceCount).toBe(3);
    expect(stored.evidenceSummary.ratingReconciliation.temporalContainment).toEqual({
      uncertainEvidenceCount: 3,
      temporallyUncertainOnly: true,
    });
    expect(evidenceRows.every((row) => row.snapshotJson?.temporalProvenance)).toBe(true);
  });
});
