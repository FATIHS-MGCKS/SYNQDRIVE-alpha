import { MisuseCaseType, MisuseAttributionScope, MisuseCaseStatus, MisuseEvidenceSourceType } from '@prisma/client';
import { MisuseCasePersistenceHelper } from './misuse-case-persistence.helper';
import { MisuseCaseEvidenceService } from './misuse-case-evidence.service';
import { buildMisuseCaseFingerprintPair, buildMisuseCaseScope } from './misuse-case-fingerprint/misuse-case-fingerprint';
import { MISUSE_CASE_FINGERPRINT_VERSION } from './misuse-case-fingerprint/misuse-case-fingerprint.config';
import { MISUSE_EVENT_COUNT_VERSION } from './misuse-case-evidence-count/misuse-case-evidence-count.config';
import { MISUSE_RATING_RECONCILIATION_VERSION } from './misuse-case-rating-reconciliation/misuse-case-rating-reconciliation.config';

describe('MisuseCasePersistenceHelper idempotency', () => {
  const store = new Map<string, any>();
  const evidenceRows: any[] = [];

  const prisma = {
    misuseCase: {
      findUnique: jest.fn(async ({ where }: any) => store.get(where.fingerprint) ?? null),
      findFirst: jest.fn(async ({ where }: any) => {
        const rows = [...store.values()].filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.inputFingerprint && row.inputFingerprint !== where.inputFingerprint) return false;
          if (where.status?.not && row.status === where.status.not) return false;
          if (where.modelVersion?.not && row.modelVersion === where.modelVersion.not) return false;
          return true;
        });
        return rows.sort((a, b) => b.createdAtMs - a.createdAtMs)[0] ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `case-${store.size + 1}`,
          createdAtMs: store.size + 1,
          ...data,
          eventCount: data.eventCount,
          status: data.status ?? MisuseCaseStatus.CANDIDATE,
          evidenceCount: data.evidenceCount ?? 0,
        };
        store.set(data.fingerprint, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = [...store.values()].find((r) => r.id === where.id);
        const updated = { ...existing, ...data };
        store.set(existing.fingerprint, updated);
        return updated;
      }),
    },
    misuseCaseEvidence: {
      findMany: jest.fn(async ({ where }: any) =>
        evidenceRows.filter((e) => e.caseId === where.caseId),
      ),
      createMany: jest.fn(async ({ data }: any) => {
        for (const row of data) evidenceRows.push(row);
        return { count: data.length };
      }),
    },
  };

  const helper = new MisuseCasePersistenceHelper(
    prisma as any,
    new MisuseCaseEvidenceService(prisma as any),
  );

  const attribution = {
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    bookingId: 'book-1',
    customerId: 'cust-1',
    assignmentStatusSnapshot: 'ASSIGNED_BOOKING_CUSTOMER' as const,
    assignmentSubjectTypeSnapshot: 'BOOKING_CUSTOMER' as const,
    assignmentSubjectIdSnapshot: 'cust-1',
    assignedBookingIdSnapshot: 'book-1',
    isPrivateTripSnapshot: false,
  };

  const upsertContext = {
    tripEndTime: new Date('2026-06-01T11:00:00Z'),
    behaviorEventCount: 5,
    drivingEventCount: 2,
    contextAnchorCount: 0,
    dimoSafetyEventCount: 0,
    dtcEventCount: 0,
    analysisRunId: null,
  };

  const candidate = {
    type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
    category: 'USAGE_ANOMALY' as const,
    severity: 'WARNING' as const,
    confidence: 'HIGH' as const,
    title: 'Test',
    description: 'Test case',
    recommendedAction: null,
    firstDetectedAt: new Date('2026-06-01T10:00:00Z'),
    lastDetectedAt: new Date('2026-06-01T10:30:00Z'),
    eventCount: 5,
    evidence: [
      {
        sourceType: 'TRIP_BEHAVIOR_EVENT' as const,
        sourceId: 'e1',
        eventType: 'KICKDOWN',
        occurredAt: new Date('2026-06-01T10:05:00Z'),
      },
      {
        sourceType: 'TRIP_BEHAVIOR_EVENT' as const,
        sourceId: 'e2',
        eventType: 'KICKDOWN',
        occurredAt: new Date('2026-06-01T10:10:00Z'),
      },
      {
        sourceType: MisuseEvidenceSourceType.VEHICLE_TRIP_COUNTER,
        eventType: 'kickdownCount',
        occurredAt: new Date('2026-06-01T10:05:00Z'),
      },
    ],
    evidenceSummary: {
      evidenceCase: {
        evidenceLevel: 'CHECK_RECOMMENDED',
        title: 'Test',
        explanation: 'Test case',
      },
    },
  };

  beforeEach(() => {
    store.clear();
    evidenceRows.length = 0;
    jest.clearAllMocks();
  });

  it('reprocessing does not create duplicate cases', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    expect(store.size).toBe(1);
    expect(prisma.misuseCase.create).toHaveBeenCalledTimes(1);
    expect(prisma.misuseCase.update).toHaveBeenCalledTimes(1);
  });

  it('attaches only qualified evidence without duplicates', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    expect(evidenceRows.length).toBe(2);
    expect(evidenceRows[0]?.sourceType).toBe('TRIP_BEHAVIOR_EVENT');
  });

  it('recalculates eventCount from qualified evidence, ignoring inflated candidate.eventCount', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    const stored = [...store.values()][0];
    expect(stored.eventCount).toBe(2);
    expect(stored.evidenceCount).toBe(2);
    expect(stored.eventCount).not.toBe(candidate.eventCount);
  });

  it('keeps eventCount stable across identical reprocessing runs', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    const stored = [...store.values()][0];
    expect(stored.eventCount).toBe(2);
    expect(stored.evidenceCount).toBe(2);
    expect(store.size).toBe(1);
  });

  it('audits rejected unqualified evidence in evidenceSummary', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    const stored = [...store.values()][0];
    const summary = stored.evidenceSummary as Record<string, unknown>;
    const audit = summary.rejectedEvidenceAudit as { rejected: Array<{ reason: string }> };
    expect(summary.eventCountModelVersion).toBe(MISUSE_EVENT_COUNT_VERSION);
    expect(audit.rejected).toHaveLength(1);
    expect(audit.rejected[0]?.reason).toBe('AGGREGATE_SOURCE');
  });

  it('ignores inflated candidate.eventCount on repeated identical evaluations', async () => {
    for (const inflatedCount of [5, 10, 99]) {
      await helper.upsertCandidate(
        'org-1',
        'veh-1',
        'trip-1',
        { ...candidate, eventCount: inflatedCount } as any,
        attribution,
        upsertContext,
      );
    }

    const stored = [...store.values()][0];
    expect(stored.eventCount).toBe(2);
    expect(store.size).toBe(1);
    expect(prisma.misuseCase.create).toHaveBeenCalledTimes(1);
  });

  it('creates telemetry cases as REVIEW_REQUIRED, never CONFIRMED', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    const stored = [...store.values()][0];
    expect(stored.status).toBe(MisuseCaseStatus.REVIEW_REQUIRED);
    expect(stored.status).not.toBe(MisuseCaseStatus.CONFIRMED);
    expect(stored.informationalOnly).toBe(true);
    expect(stored.decisionEligibility).toBe('REVIEW_ONLY');
    expect(stored.modelVersion).toBe(MISUSE_CASE_FINGERPRINT_VERSION);
    expect(stored.inputFingerprint).toHaveLength(64);
    expect(stored.fingerprint).toHaveLength(64);
  });

  it('creates separate cases for temporally separated evidence patterns', async () => {
    const morning = {
      ...candidate,
      evidence: [
        {
          sourceType: 'TRIP_BEHAVIOR_EVENT' as const,
          sourceId: 'e-morning-1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T08:00:00Z'),
        },
        {
          sourceType: 'TRIP_BEHAVIOR_EVENT' as const,
          sourceId: 'e-morning-2',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T08:05:00Z'),
        },
      ],
    };
    const evening = {
      ...candidate,
      evidence: [
        {
          sourceType: 'TRIP_BEHAVIOR_EVENT' as const,
          sourceId: 'e-evening-1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T20:00:00Z'),
        },
        {
          sourceType: 'TRIP_BEHAVIOR_EVENT' as const,
          sourceId: 'e-evening-2',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-06-01T20:05:00Z'),
        },
      ],
    };

    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', morning as any, attribution, upsertContext);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', evening as any, attribution, upsertContext);

    expect(store.size).toBe(2);
    expect(prisma.misuseCase.create).toHaveBeenCalledTimes(2);
  });

  it('supersedes prior case when model version changes for same logical fingerprint', async () => {
    const fingerprintsV0 = buildMisuseCaseFingerprintPair({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      scope: buildMisuseCaseScope({ tripId: 'trip-1', bookingId: 'book-1' }),
      category: candidate.category,
      caseType: candidate.type,
      attributionScope: attribution.attributionScope,
      evidence: [candidate.evidence[0], candidate.evidence[1]] as any,
      modelVersion: 'misuse-fingerprint-v0',
    });

    store.set(fingerprintsV0.caseFingerprint, {
      id: 'case-old',
      createdAtMs: 1,
      organizationId: 'org-1',
      fingerprint: fingerprintsV0.caseFingerprint,
      inputFingerprint: fingerprintsV0.logicalFingerprint,
      modelVersion: 'misuse-fingerprint-v0',
      status: MisuseCaseStatus.ACTIVE,
      eventCount: 5,
      evidenceCount: 1,
      informationalOnly: true,
      decisionEligibility: 'INFORMATIONAL_ONLY',
      attributionConfidence: 'HIGH',
      analysisRunId: null,
      resolvedAt: null,
      resolutionReason: null,
      severity: 'WARNING',
      confidence: 'HIGH',
      lastDetectedAt: new Date('2026-06-01T10:30:00Z'),
      recommendedAction: null,
    });

    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    expect(store.size).toBe(2);
    const prior = [...store.values()].find((r) => r.id === 'case-old');
    const next = [...store.values()].find((r) => r.id !== 'case-old');
    expect(prior?.status).toBe(MisuseCaseStatus.SUPERSEDED);
    expect(next?.supersedesCaseId).toBe('case-old');
    expect(next?.modelVersion).toBe(MISUSE_CASE_FINGERPRINT_VERSION);
    expect(next?.inputFingerprint).toBe(fingerprintsV0.logicalFingerprint);
    expect(next?.eventCount).toBe(2);
  });

  it('uses reconciled rating instead of monotonic max on update (P50)', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution, upsertContext);

    const inflatedCandidate = {
      ...candidate,
      severity: 'SEVERE' as const,
      confidence: 'HIGH' as const,
      evidence: [candidate.evidence[0]],
    };

    await helper.upsertCandidate(
      'org-1',
      'veh-1',
      'trip-1',
      inflatedCandidate as any,
      attribution,
      upsertContext,
    );

    const stored = [...store.values()][0];
    expect(stored.severity).toBe('WARNING');
    expect(stored.confidence).toBe('MEDIUM');
    const summary = stored.evidenceSummary as Record<string, unknown>;
    expect(summary.ratingReconciliationModelVersion).toBe(MISUSE_RATING_RECONCILIATION_VERSION);
    expect(summary.ratingReconciliation).toBeDefined();
  });
});
