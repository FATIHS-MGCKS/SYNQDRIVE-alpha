import {
  MisuseAttributionScope,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
  TripAssignmentStatus,
} from '@prisma/client';
import { MisuseCaseReconcileService } from './misuse-case-reconcile.service';
import { inferMisuseReconcileTrigger } from './misuse-case-reconcile.trigger';
import { MISUSE_RECONCILE_RESOLUTION_REASON } from './misuse-case-reconcile.config';

describe('misuse-case-reconcile', () => {
  const trip = {
    id: 'trip-1',
    vehicleId: 'veh-1',
    endTime: new Date('2026-06-01T12:00:00Z'),
    startTime: new Date('2026-06-01T10:00:00Z'),
    assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
    assignmentSubjectType: 'BOOKING_CUSTOMER' as const,
    assignmentSubjectId: 'cust-1',
    assignedBookingId: 'book-1',
    isPrivateTrip: false,
    kickdownCount: 2,
    possibleImpactCount: 0,
    coldEngineAbuseCount: 0,
    hardAccelerationCount: 0,
    hardBrakingCount: 0,
    fullBrakingCount: 0,
    abuseEvents: 0,
    behaviorEvents: [
      {
        id: 'b1',
        eventCategory: 'ABUSE',
        eventType: 'KICKDOWN',
        startedAt: new Date('2026-06-01T10:05:00Z'),
        classification: 'WARNING',
      },
      {
        id: 'b2',
        eventCategory: 'ABUSE',
        eventType: 'KICKDOWN',
        startedAt: new Date('2026-06-01T10:10:00Z'),
        classification: 'WARNING',
      },
    ],
    events: [],
    vehicle: {
      organizationId: 'org-1',
      dimoVehicle: null,
    },
  };

  const store = new Map<string, any>();
  const upsertCalls: any[] = [];

  const prisma = {
    vehicleTrip: {
      findUnique: jest.fn(async () => trip),
    },
    vehicleDtcEvent: {
      findMany: jest.fn(async () => []),
    },
    drivingAnalysisRun: {
      findFirst: jest.fn(async () => ({ id: 'run-1' })),
    },
    misuseCase: {
      findUnique: jest.fn(async ({ where }: any) => store.get(where.fingerprint) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        [...store.values()].filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.tripId && row.tripId !== where.tripId) return false;
          if (where.status?.in && !where.status.in.includes(row.status)) return false;
          if (where.fingerprint?.notIn && where.fingerprint.notIn.includes(row.fingerprint)) {
            return false;
          }
          return true;
        }),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = [...store.values()].find((r) => r.id === where.id);
        const updated = { ...existing, ...data };
        store.set(existing.fingerprint, updated);
        return updated;
      }),
    },
  };

  const rules = {
    evaluate: jest.fn(() => [
      {
        type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
        category: 'USAGE_ANOMALY',
        severity: 'WARNING',
        confidence: 'MEDIUM',
        title: 'Test',
        description: 'Test',
        evidence: [
          {
            sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
            sourceId: 'b1',
            eventType: 'KICKDOWN',
            occurredAt: new Date('2026-06-01T10:05:00Z'),
          },
          {
            sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
            sourceId: 'b2',
            eventType: 'KICKDOWN',
            occurredAt: new Date('2026-06-01T10:10:00Z'),
          },
        ],
        eventCount: 2,
        firstDetectedAt: new Date('2026-06-01T10:05:00Z'),
        lastDetectedAt: new Date('2026-06-01T10:10:00Z'),
      },
    ]),
  };

  const persistence = {
    upsertCandidate: jest.fn(async (...args: any[]) => {
      upsertCalls.push(args);
      const fingerprint = `fp-${upsertCalls.length}`;
      store.set(fingerprint, {
        id: `case-${upsertCalls.length}`,
        organizationId: 'org-1',
        tripId: 'trip-1',
        fingerprint,
        status: MisuseCaseStatus.REVIEW_REQUIRED,
        severity: 'WARNING',
        confidence: 'MEDIUM',
        evidenceSummary: {},
      });
    }),
  };

  const dimoSegments = {
    fetchSafetyEvents: jest.fn(async () => []),
  };

  const service = new MisuseCaseReconcileService(
    prisma as any,
    dimoSegments as any,
    rules as any,
    persistence as any,
  );

  beforeEach(() => {
    store.clear();
    upsertCalls.length = 0;
    jest.clearAllMocks();
  });

  it('reconciles deterministically with analysis run and gated candidates', async () => {
    const first = await service.reconcileTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      trigger: 'EVENT_CONTEXT',
    });

    expect(first.analysisRunId).toBe('run-1');
    expect(first.upserted).toBe(1);
    expect(first.candidatesGated).toBe(1);
    expect(persistence.upsertCandidate).toHaveBeenCalledTimes(1);
    expect(persistence.upsertCandidate.mock.calls[0][6]).toEqual({ trigger: 'EVENT_CONTEXT' });
  });

  it('is idempotent across identical reconcile runs', async () => {
    const a = await service.reconcileTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      trigger: 'DRIVING_IMPACT',
    });
    const b = await service.reconcileTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      trigger: 'DRIVING_IMPACT',
    });

    expect(a.upserted).toBe(b.upserted);
    expect(persistence.upsertCandidate).toHaveBeenCalledTimes(2);
  });

  it('resolves stale active cases not present in reconcile output', async () => {
    store.set('stale-fp', {
      id: 'stale-1',
      organizationId: 'org-1',
      tripId: 'trip-1',
      fingerprint: 'stale-fp',
      status: MisuseCaseStatus.ACTIVE,
      evidenceSummary: {},
    });

    persistence.upsertCandidate.mockImplementation(async () => undefined);

    const result = await service.reconcileTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      trigger: 'ATTRIBUTION',
    });

    expect(result.resolved).toBe(1);
    const stale = store.get('stale-fp');
    expect(stale.status).toBe(MisuseCaseStatus.RESOLVED);
    expect(stale.resolutionReason).toBe(MISUSE_RECONCILE_RESOLUTION_REASON);
  });

  it('infers reconcile triggers from job correlation ids', () => {
    expect(
      inferMisuseReconcileTrigger({
        correlationId: 'reconcile:trip-1',
      } as any),
    ).toBe('PERIODIC_STUCK_TRIP');
    expect(
      inferMisuseReconcileTrigger({
        correlationId: 'stage-chain:impact',
      } as any),
    ).toBe('DRIVING_IMPACT');
    expect(
      inferMisuseReconcileTrigger({
        correlationId: 'stage-chain:attribution',
      } as any),
    ).toBe('ATTRIBUTION');
  });
});
