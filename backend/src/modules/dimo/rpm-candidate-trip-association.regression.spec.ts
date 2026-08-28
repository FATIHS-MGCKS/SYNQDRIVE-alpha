/**
 * End-to-end intake regression for the 2026-08-28 production defect.
 *
 * Candidate 941382ca (RPM 5213 at 11:58:11Z) was persisted with trip_id = NULL
 * even though trip 61715ecd was ONGOING and the vehicle was demonstrably
 * driving. The trip's rolling end_time was 11:58:02Z — the last ACTIVE_TRACKING
 * tick, 9 seconds before the event — and the old resolver required
 * `end_time >= observed_at`.
 *
 * This test drives the real intake path (RpmWebhookCandidateService ->
 * EventTripAssociationService) and asserts on the row that actually gets
 * written, not on the resolver in isolation.
 */
import { TripStatus } from '@prisma/client';
import { RpmWebhookCandidateService } from './rpm-webhook-candidate.service';
import { EventTripAssociationService } from '../vehicle-intelligence/trips/event-association/event-trip-association.service';

const VEHICLE = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const REAL_TRIP = '61715ecd-b9f7-41eb-a41b-4be852c9eb02';

const TRIP_START = new Date('2026-08-28T11:29:08Z');
const ROLLING_END = new Date('2026-08-28T11:58:02Z');
const EVENT_AT = new Date('2026-08-28T11:58:11Z');

const KS_MX_2024 = {
  id: VEHICLE,
  organizationId: 'org-ks-mx',
  hardwareType: 'LTE_R1' as const,
  fuelType: 'PETROL',
};

function buildHarness(options: {
  tripStatus: TripStatus;
  endTime: Date | null;
  activeTripId: string | null;
}) {
  const upsert = jest.fn(async ({ create }: { create: { tripId: string | null } }) => ({
    id: 'cand-under-test',
    createdAt: EVENT_AT,
    updatedAt: EVENT_AT,
    status: 'RECEIVED',
    tripId: create.tripId,
  }));

  const prisma = {
    rpmWebhookCandidate: { upsert, update: jest.fn() },
    vehicleTrip: {
      findMany: jest.fn(async () => [
        {
          id: REAL_TRIP,
          tripStatus: options.tripStatus,
          startTime: TRIP_START,
          endTime: options.endTime,
        },
      ]),
    },
    vehicleTripDetectionState: {
      findUnique: jest.fn(async () => ({ activeTripId: options.activeTripId })),
    },
  };

  const association = new EventTripAssociationService(prisma as never);
  const service = new RpmWebhookCandidateService(prisma as never, association);

  return { service, upsert };
}

async function ingest(service: RpmWebhookCandidateService) {
  return service.ingestRpmThresholdEvent({
    vehicle: KS_MX_2024,
    tokenId: 187336,
    observedAt: EVENT_AT,
    observedValue: 5213,
    rawPayload: { signal: { name: 'powertrainCombustionEngineSpeed', value: 5213 } },
  });
}

describe('RPM intake — Aug 28 rolling end_time race', () => {
  it('persists the live trip id when the rolling end_time trails the event', async () => {
    const { service, upsert } = buildHarness({
      tripStatus: TripStatus.ONGOING,
      endTime: ROLLING_END,
      activeTripId: REAL_TRIP,
    });

    const result = await ingest(service);

    expect(result.outcome).toBe('created');
    expect(upsert.mock.calls[0][0].create.tripId).toBe(REAL_TRIP);
  });

  it('persists a null trip id rather than a stale cancelled trip', async () => {
    const { service, upsert } = buildHarness({
      tripStatus: TripStatus.CANCELLED,
      endTime: null,
      activeTripId: null,
    });

    const result = await ingest(service);

    expect(result.outcome).toBe('created');
    expect(upsert.mock.calls[0][0].create.tripId).toBeNull();
  });
});
