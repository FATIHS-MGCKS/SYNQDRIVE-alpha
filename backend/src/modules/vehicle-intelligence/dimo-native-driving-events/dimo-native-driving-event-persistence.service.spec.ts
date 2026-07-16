import { DrivingEventType, DrivingEventTripAssignment } from '@prisma/client';
import { DimoNativeDrivingEventPersistenceService } from './dimo-native-driving-event-persistence.service';
import type { PersistNativeDimoEventInput } from './dimo-native-driving-event-persistence.service';

function makeEvent(overrides: Partial<PersistNativeDimoEventInput> = {}): PersistNativeDimoEventInput {
  return {
    organizationId: 'org-a',
    vehicleId: 'veh-1',
    providerEventName: 'behavior.harshBraking',
    providerSourceId: '0xDEVICE',
    durationNs: 0,
    metadataJson: '{"counterValue":1}',
    recordedAt: new Date('2026-06-26T12:00:00.000Z'),
    eventType: DrivingEventType.HARSH_BRAKING,
    classification: 'HARD',
    severity: 0.6,
    speedKmh: null,
    durationMs: 0,
    mapping: {
      providerEventName: 'behavior.harshBraking',
      canonicalEventType: DrivingEventType.HARSH_BRAKING,
      classification: 'HARD',
      severity: 0.6,
      providerSource: 'DIMO_TELEMETRY',
      evidenceSourceType: 'PROVIDER_CLASSIFIED_EVENT',
      mappingVersion: '2026-07-16.1',
      isKnownMapping: true,
    },
    enrichmentMetadata: { hardwareSource: 'LTE_R1' },
    ...overrides,
  };
}

describe('DimoNativeDrivingEventPersistenceService', () => {
  const trip = {
    id: 'trip-1',
    startTime: new Date('2026-06-26T11:00:00.000Z'),
    endTime: new Date('2026-06-26T12:30:00.000Z'),
  };

  it('does not duplicate on repeated provider upsert', async () => {
    const store = new Map<string, any>();
    let createCount = 0;
    let updateCount = 0;

    const prisma = {
      drivingEvent: {
        findUnique: jest.fn(async ({ where }: any) => {
          const key = where.organizationId_providerFingerprint.organizationId +
            ':' + where.organizationId_providerFingerprint.providerFingerprint;
          return store.get(key) ?? null;
        }),
        create: jest.fn(async ({ data }: any) => {
          createCount += 1;
          const row = {
            id: `de-${createCount}`,
            tripId: data.tripId,
            tripAssignment: data.tripAssignment,
            eventType: data.eventType,
            providerFingerprint: data.providerFingerprint,
          };
          store.set(`${data.organizationId}:${data.providerFingerprint}`, row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          updateCount += 1;
          const existing = [...store.values()].find((r) => r.id === where.id);
          const row = { ...existing, ...data };
          store.set(`${data.organizationId ?? 'org-a'}:${row.providerFingerprint}`, row);
          return row;
        }),
        findMany: jest.fn(),
      },
      vehicleTrip: { findFirst: jest.fn() },
    };

    const service = new DimoNativeDrivingEventPersistenceService(prisma as any);
    const event = makeEvent();

    const first = await service.upsertNativeEvents([event], trip);
    const second = await service.upsertNativeEvents([event], trip);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].created).toBe(true);
    expect(second[0].created).toBe(false);
    expect(first[0].providerFingerprint).toBe(second[0].providerFingerprint);
    expect(createCount).toBe(1);
    expect(updateCount).toBe(1);
  });

  it('updates trip assignment on existing fingerprint without creating a new row', async () => {
    const existingRow = {
      id: 'de-1',
      tripId: null,
      tripAssignment: DrivingEventTripAssignment.UNASSIGNED,
      eventType: DrivingEventType.HARSH_BRAKING,
      providerFingerprint: 'fp-1',
    };

    const prisma = {
      drivingEvent: {
        findUnique: jest.fn(async () => existingRow),
        update: jest.fn(async ({ data }: any) => ({
          ...existingRow,
          tripId: data.tripId,
          tripAssignment: data.tripAssignment,
        })),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      vehicleTrip: { findFirst: jest.fn() },
    };

    const service = new DimoNativeDrivingEventPersistenceService(prisma as any);
    const [result] = await service.upsertNativeEvents([makeEvent()], trip);

    expect(prisma.drivingEvent.create).not.toHaveBeenCalled();
    expect(result.tripId).toBe('trip-1');
    expect(result.tripAssignment).toBe(DrivingEventTripAssignment.ASSIGNED);
  });

  it('reconciles delayed assignment for unassigned events', async () => {
    const prisma = {
      drivingEvent: {
        findMany: jest.fn(async () => [
          { id: 'de-1', recordedAt: new Date('2026-06-26T12:00:00.000Z') },
        ]),
        update: jest.fn(async () => ({})),
      },
      vehicleTrip: {
        findFirst: jest.fn(async () => ({ id: 'trip-late' })),
      },
    };

    const service = new DimoNativeDrivingEventPersistenceService(prisma as any);
    const result = await service.reconcileUnassignedEvents('org-a', 'veh-1');

    expect(result).toEqual({ assigned: 1, examined: 1 });
    expect(prisma.drivingEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'de-1' },
        data: {
          tripId: 'trip-late',
          tripAssignment: DrivingEventTripAssignment.ASSIGNED,
        },
      }),
    );
  });

  it('stores out-of-bound ingest as unassigned', async () => {
    const prisma = {
      drivingEvent: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({
          id: 'de-oob',
          tripId: data.tripId,
          tripAssignment: data.tripAssignment,
          eventType: data.eventType,
        })),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      vehicleTrip: { findFirst: jest.fn() },
    };

    const service = new DimoNativeDrivingEventPersistenceService(prisma as any);
    const [result] = await service.upsertNativeEvents(
      [makeEvent({ recordedAt: new Date('2026-06-26T13:30:00.000Z') })],
      trip,
    );

    expect(result.tripId).toBeNull();
    expect(result.tripAssignment).toBe(DrivingEventTripAssignment.UNASSIGNED);
  });
});
