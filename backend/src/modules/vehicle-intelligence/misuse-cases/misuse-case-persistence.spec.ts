import { MisuseCaseType, MisuseAttributionScope } from '@prisma/client';
import {
  MisuseCaseEvidenceService,
  MisuseCasePersistenceHelper,
} from './misuse-case-evidence.service';

describe('MisuseCasePersistenceHelper idempotency', () => {
  const store = new Map<string, any>();
  const evidenceRows: any[] = [];

  const prisma = {
    misuseCase: {
      findUnique: jest.fn(async ({ where }: any) => store.get(where.fingerprint) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `case-${store.size + 1}`, ...data, eventCount: data.eventCount };
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
    ],
  };

  beforeEach(() => {
    store.clear();
    evidenceRows.length = 0;
    jest.clearAllMocks();
  });

  it('reprocessing does not create duplicate cases', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution);

    expect(store.size).toBe(1);
    expect(prisma.misuseCase.create).toHaveBeenCalledTimes(1);
    expect(prisma.misuseCase.update).toHaveBeenCalledTimes(1);
  });

  it('attaches evidence without duplicates', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution);

    expect(evidenceRows.length).toBe(1);
  });

  it('keeps eventCount idempotent when upserting the same candidate twice', async () => {
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution);
    await helper.upsertCandidate('org-1', 'veh-1', 'trip-1', candidate as any, attribution);

    const stored = [...store.values()][0];
    expect(stored.eventCount).toBe(5);
    expect(store.size).toBe(1);
    expect(evidenceRows.length).toBe(1);
  });
});
