/**
 * Regression matrix for the Event → Trip association contract.
 *
 * Anchored on the 2026-08-28 production forensic case:
 *   vehicle  KS MX 2024
 *   trip     ONGOING, start 11:29:08Z, finalized end 12:01:35Z
 *   event    RPM 5213 at 11:58:11Z
 *   defect   the ~30s tracking tick had last written end_time = 11:58:02Z,
 *            so the old `endTime >= observedAt` predicate rejected the trip
 *            the vehicle was demonstrably driving, orphaning the candidate.
 */
import { TripStatus } from '@prisma/client';
import { EventTripAssociationService } from './event-trip-association.service';
import { EVENT_TRIP_ASSOCIATION_REASONS } from './event-trip-association.types';

const VEHICLE = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const REAL_TRIP = '61715ecd-b9f7-41eb-a41b-4be852c9eb02';
const CANDIDATE = '941382ca-cd2b-48a0-b800-56c4c03abfc7';

const TRIP_START = new Date('2026-08-28T11:29:08Z');
/** Rolling activity cursor from the last ACTIVE_TRACKING tick — 9s before the event. */
const ROLLING_END = new Date('2026-08-28T11:58:02Z');
const EVENT_AT = new Date('2026-08-28T11:58:11Z');
const FINAL_END = new Date('2026-08-28T12:01:35Z');
/** "Now" for every test — well past the delayed-sweep minimum candidate age. */
const NOW = new Date('2026-08-28T12:30:00Z');

interface TripRow {
  id: string;
  vehicleId: string;
  tripStatus: TripStatus;
  startTime: Date;
  endTime: Date | null;
}

interface CandidateRow {
  id: string;
  vehicleId: string;
  tripId: string | null;
  observedAt: Date;
}

/**
 * In-memory stand-in for the Prisma surface the association service uses.
 * Implements real filter/order/take semantics so the tests exercise the actual
 * query shapes rather than a hand-fed result set.
 */
class FakePrisma {
  readonly trips: TripRow[] = [];
  readonly candidates: CandidateRow[] = [];
  private activeTripId: string | null = null;

  readonly writes = { updateMany: 0, create: 0 };

  addTrip(trip: Partial<TripRow> & Pick<TripRow, 'id' | 'tripStatus' | 'startTime'>): this {
    this.trips.push({
      vehicleId: VEHICLE,
      endTime: null,
      ...trip,
    });
    return this;
  }

  addCandidate(candidate: Partial<CandidateRow> & Pick<CandidateRow, 'id' | 'observedAt'>): this {
    this.candidates.push({
      vehicleId: VEHICLE,
      tripId: null,
      ...candidate,
    });
    return this;
  }

  setActiveTrip(tripId: string | null): this {
    this.activeTripId = tripId;
    return this;
  }

  readonly vehicleTripDetectionState = {
    findUnique: jest.fn(async ({ where }: { where: { vehicleId: string } }) =>
      where.vehicleId === VEHICLE ? { activeTripId: this.activeTripId } : null,
    ),
  };

  readonly vehicleTrip = {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      this.trips.find((t) => t.id === where.id) ?? null,
    ),
    findMany: jest.fn(
      async ({
        where,
        take,
      }: {
        where: { vehicleId: string; startTime: { lte: Date } };
        take: number;
      }) =>
        this.trips
          .filter(
            (t) =>
              t.vehicleId === where.vehicleId &&
              t.startTime.getTime() <= where.startTime.lte.getTime(),
          )
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
          .slice(0, take),
    ),
  };

  readonly rpmWebhookCandidate = {
    findMany: jest.fn(
      async ({
        where,
        take,
      }: {
        where: {
          vehicleId: string;
          tripId: null;
          observedAt: { gte: Date; lte: Date };
        };
        take: number;
      }) =>
        this.candidates
          .filter(
            (c) =>
              c.vehicleId === where.vehicleId &&
              c.tripId === null &&
              c.observedAt.getTime() >= where.observedAt.gte.getTime() &&
              c.observedAt.getTime() <= where.observedAt.lte.getTime(),
          )
          .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
          .slice(0, take)
          .map((c) => ({ id: c.id, observedAt: c.observedAt })),
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; tripId: null };
        data: { tripId: string };
      }) => {
        this.writes.updateMany += 1;
        const row = this.candidates.find(
          (c) => c.id === where.id && c.tripId === where.tripId,
        );
        if (!row) return { count: 0 };
        row.tripId = data.tripId;
        return { count: 1 };
      },
    ),
    create: jest.fn(async () => {
      this.writes.create += 1;
      return {};
    }),
  };
}

function makeService(prisma: FakePrisma): EventTripAssociationService {
  return new EventTripAssociationService(prisma as never);
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('TEST A — Aug 28 rolling end_time race', () => {
  it('resolves the live trip when the rolling end_time trails the event by 9s', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.ONGOING,
        startTime: TRIP_START,
        endTime: ROLLING_END,
      })
      .setActiveTrip(REAL_TRIP);

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.ACTIVE_TRIP_MATCH);
  });

  it('still resolves via the ONGOING tier when the detection state is unavailable', async () => {
    const prisma = new FakePrisma().addTrip({
      id: REAL_TRIP,
      tripStatus: TripStatus.ONGOING,
      startTime: TRIP_START,
      endTime: ROLLING_END,
    });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.ONGOING_TRIP_MATCH);
  });
});

describe('TEST B — completed trip containing the event', () => {
  it('resolves via canonical temporal containment', async () => {
    const prisma = new FakePrisma().addTrip({
      id: REAL_TRIP,
      tripStatus: TripStatus.COMPLETED,
      startTime: TRIP_START,
      endTime: FINAL_END,
    });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.reason).toBe(
      EVENT_TRIP_ASSOCIATION_REASONS.FINALIZED_WINDOW_MATCH,
    );
  });
});

describe('TEST C — stale CANCELLED trip with end_time NULL', () => {
  it('never lets the cancelled row win over the real ongoing trip', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.ONGOING,
        startTime: TRIP_START,
        endTime: ROLLING_END,
      })
      // Starts later than the real trip, so `ORDER BY start_time DESC` with an
      // open end_time made this the old resolver's first pick.
      .addTrip({
        id: 'stale-cancelled',
        tripStatus: TripStatus.CANCELLED,
        startTime: new Date('2026-08-28T11:50:00Z'),
        endTime: null,
      });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.cancelledExcluded).toBe(true);
  });

  it('reports CANCELLED_EXCLUDED when the cancelled row was the only match', async () => {
    const prisma = new FakePrisma().addTrip({
      id: 'stale-cancelled',
      tripStatus: TripStatus.CANCELLED,
      startTime: new Date('2026-08-28T11:50:00Z'),
      endTime: null,
    });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBeNull();
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.CANCELLED_EXCLUDED);
  });
});

describe('TEST D — event arrives before the trip row exists', () => {
  it('is unresolved at intake and converges once the trip appears', async () => {
    const prisma = new FakePrisma().addCandidate({
      id: CANDIDATE,
      observedAt: EVENT_AT,
    });
    const service = makeService(prisma);

    const atIntake = await service.resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });
    expect(atIntake.tripId).toBeNull();
    expect(atIntake.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.NO_TRIP_YET);

    prisma.addTrip({
      id: REAL_TRIP,
      tripStatus: TripStatus.ONGOING,
      startTime: TRIP_START,
      endTime: ROLLING_END,
    });

    const outcome = await service.reconcileUnresolvedWindow({
      vehicleId: VEHICLE,
      from: new Date('2026-08-28T11:00:00Z'),
      to: NOW,
    });

    expect(outcome.associated).toBe(1);
    expect(prisma.candidates[0].tripId).toBe(REAL_TRIP);
  });
});

describe('TEST E — post-finalization backfill', () => {
  it('backfills exactly once and is a no-op on re-run', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .addCandidate({ id: CANDIDATE, observedAt: EVENT_AT });
    const service = makeService(prisma);

    const first = await service.reconcileFinalizedTrip({ tripId: REAL_TRIP });
    expect(first.associated).toBe(1);
    expect(prisma.candidates[0].tripId).toBe(REAL_TRIP);

    const second = await service.reconcileFinalizedTrip({ tripId: REAL_TRIP });
    expect(second.scanned).toBe(0);
    expect(second.associated).toBe(0);
    expect(prisma.candidates[0].tripId).toBe(REAL_TRIP);
  });

  it('never overwrites an existing non-null association', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .addCandidate({ id: CANDIDATE, observedAt: EVENT_AT, tripId: 'previously-linked' });

    const outcome = await makeService(prisma).reconcileFinalizedTrip({
      tripId: REAL_TRIP,
    });

    expect(outcome.scanned).toBe(0);
    expect(prisma.candidates[0].tripId).toBe('previously-linked');
  });

  it('does nothing for a trip that is not finalized', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.ONGOING,
        startTime: TRIP_START,
        endTime: ROLLING_END,
      })
      .addCandidate({ id: CANDIDATE, observedAt: EVENT_AT });

    const outcome = await makeService(prisma).reconcileFinalizedTrip({
      tripId: REAL_TRIP,
    });

    expect(outcome.scanned).toBe(0);
    expect(prisma.candidates[0].tripId).toBeNull();
  });
});

describe('TEST F — event outside any trip', () => {
  it('remains unresolved', async () => {
    const prisma = new FakePrisma().addTrip({
      id: REAL_TRIP,
      tripStatus: TripStatus.COMPLETED,
      startTime: TRIP_START,
      endTime: new Date('2026-08-28T11:40:00Z'),
    });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBeNull();
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.NO_TRIP_YET);
  });
});

describe('TEST G — ambiguous overlapping trips', () => {
  it('refuses to guess and exposes the plausible trip ids', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: 'trip-overlap-a',
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .addTrip({
        id: 'trip-overlap-b',
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date('2026-08-28T11:45:00Z'),
        endTime: new Date('2026-08-28T12:10:00Z'),
      });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBeNull();
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.AMBIGUOUS_TRIPS);
    expect(decision.ambiguousTripIds).toEqual(['trip-overlap-a', 'trip-overlap-b']);
  });

  it('leaves ambiguous candidates untouched during reconciliation', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .addTrip({
        id: 'trip-overlap-b',
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date('2026-08-28T11:45:00Z'),
        endTime: new Date('2026-08-28T12:10:00Z'),
      })
      .addCandidate({ id: CANDIDATE, observedAt: EVENT_AT });

    const outcome = await makeService(prisma).reconcileFinalizedTrip({
      tripId: REAL_TRIP,
    });

    expect(outcome.associated).toBe(0);
    expect(outcome.ambiguous).toBe(1);
    expect(prisma.candidates[0].tripId).toBeNull();
  });
});

describe('TEST H — canonical active_trip_id takes precedence', () => {
  it('wins over an otherwise ambiguous set of ongoing trips', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.ONGOING,
        startTime: TRIP_START,
        endTime: ROLLING_END,
      })
      .addTrip({
        id: 'orphan-ongoing',
        tripStatus: TripStatus.ONGOING,
        startTime: new Date('2026-08-28T10:00:00Z'),
        endTime: new Date('2026-08-28T10:20:00Z'),
      })
      .setActiveTrip(REAL_TRIP);

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.ACTIVE_TRIP_MATCH);
  });

  it('falls through to ambiguity when no active trip disambiguates', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.ONGOING,
        startTime: TRIP_START,
        endTime: ROLLING_END,
      })
      .addTrip({
        id: 'orphan-ongoing',
        tripStatus: TripStatus.ONGOING,
        startTime: new Date('2026-08-28T10:00:00Z'),
        endTime: new Date('2026-08-28T10:20:00Z'),
      });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBeNull();
    expect(decision.reason).toBe(EVENT_TRIP_ASSOCIATION_REASONS.AMBIGUOUS_TRIPS);
  });

  it('ignores a dangling active_trip_id that no longer points at an ongoing trip', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .setActiveTrip('deleted-trip');

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.reason).toBe(
      EVENT_TRIP_ASSOCIATION_REASONS.FINALIZED_WINDOW_MATCH,
    );
  });
});

describe('TEST I — wrong CANCELLED selection regression', () => {
  it('selects the canonical completed trip instead of the stale cancelled row', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .addTrip({
        id: 'stale-cancelled',
        tripStatus: TripStatus.CANCELLED,
        startTime: new Date('2026-08-28T11:55:00Z'),
        endTime: null,
      });

    const decision = await makeService(prisma).resolveForEvent({
      vehicleId: VEHICLE,
      observedAt: EVENT_AT,
    });

    expect(decision.tripId).toBe(REAL_TRIP);
    expect(decision.tripId).not.toBe('stale-cancelled');
  });

  it('never associates a candidate with a cancelled trip during reconciliation', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: 'stale-cancelled',
        tripStatus: TripStatus.CANCELLED,
        startTime: new Date('2026-08-28T11:55:00Z'),
        endTime: null,
      })
      .addCandidate({ id: CANDIDATE, observedAt: EVENT_AT });

    const outcome = await makeService(prisma).reconcileUnresolvedWindow({
      vehicleId: VEHICLE,
      from: new Date('2026-08-28T11:00:00Z'),
      to: NOW,
    });

    expect(outcome.associated).toBe(0);
    expect(prisma.candidates[0].tripId).toBeNull();
  });
});

describe('TEST J — no duplicate events or enrichment', () => {
  it('only updates the existing row and does so once across both paths', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: FINAL_END,
      })
      .addCandidate({ id: CANDIDATE, observedAt: EVENT_AT });
    const service = makeService(prisma);

    await service.reconcileFinalizedTrip({ tripId: REAL_TRIP });
    await service.reconcileFinalizedTrip({ tripId: REAL_TRIP });
    await service.reconcileUnresolvedWindow({
      vehicleId: VEHICLE,
      from: new Date('2026-08-28T11:00:00Z'),
      to: NOW,
    });

    expect(prisma.candidates).toHaveLength(1);
    expect(prisma.candidates[0].tripId).toBe(REAL_TRIP);
    expect(prisma.writes.create).toBe(0);
    // A single write attempt total — the `trip_id IS NULL` scan filter keeps
    // every subsequent pass from even reaching the update.
    expect(prisma.writes.updateMany).toBe(1);
  });

  it('performs no writes when there is nothing to reconcile', async () => {
    const prisma = new FakePrisma().addTrip({
      id: REAL_TRIP,
      tripStatus: TripStatus.COMPLETED,
      startTime: TRIP_START,
      endTime: FINAL_END,
    });

    await makeService(prisma).reconcileFinalizedTrip({ tripId: REAL_TRIP });

    expect(prisma.writes.updateMany).toBe(0);
  });
});

describe('delayed sweep bounds', () => {
  it('skips candidates younger than the minimum age so it cannot race intake', async () => {
    const prisma = new FakePrisma()
      .addTrip({
        id: REAL_TRIP,
        tripStatus: TripStatus.COMPLETED,
        startTime: TRIP_START,
        endTime: new Date(NOW.getTime() + 60_000),
      })
      .addCandidate({
        id: 'fresh-candidate',
        observedAt: new Date(NOW.getTime() - 5_000),
      });

    const outcome = await makeService(prisma).reconcileUnresolvedWindow({
      vehicleId: VEHICLE,
      from: TRIP_START,
      to: new Date(NOW.getTime() + 60_000),
    });

    expect(outcome.scanned).toBe(0);
    expect(prisma.candidates[0].tripId).toBeNull();
  });
});
