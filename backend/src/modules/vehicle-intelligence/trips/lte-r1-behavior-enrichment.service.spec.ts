import { DrivingEventType } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { EventContextEnrichmentService } from '../event-context/event-context-enrichment.service';
import { VehicleDrivingCapabilityResolverService } from '../driving-capability/vehicle-driving-capability-resolver.service';
import { DimoNativeDrivingEventPersistenceService } from '../dimo-native-driving-events/dimo-native-driving-event-persistence.service';
import {
  LteR1BehaviorEnrichmentService,
  mapDimoEventName,
  resolveNativeSeverity,
} from './lte-r1-behavior-enrichment.service';
import type { DimoVehicleEventRecord } from '../../dimo/dimo-segments.service';

describe('mapDimoEventName', () => {
  it('maps harsh acceleration to HARSH_ACCELERATION / HARD', () => {
    expect(mapDimoEventName('behavior.harshAcceleration')).toEqual({
      eventType: DrivingEventType.HARSH_ACCELERATION,
      classification: 'HARD',
    });
  });

  it('does NOT ignore extreme acceleration — maps it to HARSH_ACCELERATION / EXTREME', () => {
    expect(mapDimoEventName('behavior.extremeAcceleration')).toEqual({
      eventType: DrivingEventType.HARSH_ACCELERATION,
      classification: 'EXTREME',
    });
  });

  it('keeps extreme braking working', () => {
    expect(mapDimoEventName('behavior.extremeBraking')).toEqual({
      eventType: DrivingEventType.EXTREME_BRAKING,
      classification: 'EXTREME',
    });
  });

  it('maps the emergency braking variants to EXTREME_BRAKING', () => {
    expect(mapDimoEventName('behavior.extremeEmergency')?.eventType).toBe(DrivingEventType.EXTREME_BRAKING);
    expect(mapDimoEventName('behavior.extremeEmergencyBraking')?.eventType).toBe(DrivingEventType.EXTREME_BRAKING);
  });

  it('maps harsh braking and cornering with their existing classifications', () => {
    expect(mapDimoEventName('behavior.harshBraking')).toEqual({
      eventType: DrivingEventType.HARSH_BRAKING,
      classification: 'HARD',
    });
    expect(mapDimoEventName('behavior.harshCornering')).toEqual({
      eventType: DrivingEventType.HARSH_CORNERING,
      classification: 'MODERATE',
    });
  });

  it('is case-insensitive and separator-tolerant for extreme acceleration', () => {
    for (const raw of [
      'Behavior.ExtremeAcceleration',
      'behavior.extreme_acceleration',
      'behavior.extreme-acceleration',
      '  behavior.extremeAcceleration  ',
    ]) {
      expect(mapDimoEventName(raw)).toEqual({
        eventType: DrivingEventType.HARSH_ACCELERATION,
        classification: 'EXTREME',
      });
    }
  });

  it('safely ignores unknown DIMO event names', () => {
    expect(mapDimoEventName('behavior.someFutureEvent')).toBeNull();
    expect(mapDimoEventName('ignition.on')).toBeNull();
    expect(mapDimoEventName('')).toBeNull();
  });
});

describe('resolveNativeSeverity', () => {
  it('elevates extreme acceleration above normal harsh acceleration', () => {
    const harsh = resolveNativeSeverity(DrivingEventType.HARSH_ACCELERATION, 'HARD');
    const extreme = resolveNativeSeverity(DrivingEventType.HARSH_ACCELERATION, 'EXTREME');
    expect(harsh).toBe(0.6);
    expect(extreme).toBe(0.9);
    expect(extreme).toBeGreaterThan(harsh);
  });

  it('keeps extreme braking at its existing severity', () => {
    expect(resolveNativeSeverity(DrivingEventType.EXTREME_BRAKING, 'EXTREME')).toBe(0.9);
  });
});

describe('LteR1BehaviorEnrichmentService.mapToNormalizedEvents', () => {
  const persistence = {
    upsertNativeEvents: jest.fn(),
    reconcileUnassignedEvents: jest.fn(),
  };
  const service = new LteR1BehaviorEnrichmentService(
    {} as any,
    {} as any,
    {} as any,
    {
      resolveForVehicle: jest.fn(async () => ({ capabilities: [] })),
    } as any,
    persistence as any,
  );

  const sample = (name: string, metadata: string | null = '{"counterValue":1}'): DimoVehicleEventRecord => ({
    timestamp: '2026-01-01T12:00:00.000Z',
    name,
    source: '0xDEVICEWALLET',
    durationNs: 0,
    metadata,
  });

  function mapSamples(samples: DimoVehicleEventRecord[]): any[] {
    return (service as any).mapToNormalizedEvents(samples, 'veh-1', 'org-1', new Map());
  }

  it('preserves the original DIMO event name and tags extreme acceleration distinctly', () => {
    const [event] = mapSamples([sample('behavior.extremeAcceleration')]);
    expect(event.eventType).toBe(DrivingEventType.HARSH_ACCELERATION);
    expect(event.classification).toBe('EXTREME');
    expect(event.severity).toBe(0.9);
    expect(event.rawName).toBe('behavior.extremeAcceleration');
    expect(event.counterValue).toBe(1);
  });

  it('keeps normal harsh acceleration at HARD / 0.6', () => {
    const [event] = mapSamples([sample('behavior.harshAcceleration')]);
    expect(event.eventType).toBe(DrivingEventType.HARSH_ACCELERATION);
    expect(event.classification).toBe('HARD');
    expect(event.severity).toBe(0.6);
  });

  it('perserves unmapped provider events instead of dropping them', () => {
    const events = mapSamples([
      sample('behavior.harshBraking'),
      sample('behavior.unknownThing'),
      sample('behavior.extremeAcceleration'),
    ]);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.eventType)).toEqual([
      DrivingEventType.HARSH_BRAKING,
      DrivingEventType.UNMAPPED_PROVIDER_EVENT,
      DrivingEventType.HARSH_ACCELERATION,
    ]);
    expect(events[1].mapping.isKnownMapping).toBe(false);
    expect(events[1].mapping.evidenceSourceType).toBe('PROVIDER_CLASSIFIED_EVENT');
  });
});

describe('LteR1BehaviorEnrichmentService.scheduleNativeEventContextJobs (P26 job fan-out)', () => {
  function makeService(contextJobs?: { scheduleContextEnrichmentForTrip: jest.Mock }) {
    const prisma = {
      drivingAnalysisRun: {
        findFirst: jest.fn(async () => ({ id: 'run-1' })),
      },
    };
    const service = new LteR1BehaviorEnrichmentService(
      prisma as any,
      {} as any,
      contextJobs as any,
      {
        resolveForVehicle: jest.fn(async () => ({ capabilities: [] })),
      } as any,
      { upsertNativeEvents: jest.fn(), reconcileUnassignedEvents: jest.fn() } as any,
    );
    return { service, prisma, contextJobs };
  }

  it('schedules durable per-event context jobs when analysis run exists', async () => {
    const scheduleContextEnrichmentForTrip = jest.fn(async () => ({
      eligibleEvents: 2,
      enqueued: 2,
      skipped: 0,
    }));
    const { service } = makeService({ scheduleContextEnrichmentForTrip });
    await (service as any).scheduleNativeEventContextJobs('trip-1', 'veh-1', 'org-1', 2);
    expect(scheduleContextEnrichmentForTrip).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no native events were persisted', async () => {
    const scheduleContextEnrichmentForTrip = jest.fn();
    const { service } = makeService({ scheduleContextEnrichmentForTrip });
    await (service as any).scheduleNativeEventContextJobs('trip-1', 'veh-1', 'org-1', 0);
    expect(scheduleContextEnrichmentForTrip).not.toHaveBeenCalled();
  });

  it('defers when no V2 analysis run exists yet', async () => {
    const scheduleContextEnrichmentForTrip = jest.fn();
    const prisma = {
      drivingAnalysisRun: { findFirst: jest.fn(async () => null) },
    };
    const service = new LteR1BehaviorEnrichmentService(
      prisma as any,
      {} as any,
      { scheduleContextEnrichmentForTrip } as any,
      { resolveForVehicle: jest.fn(async () => ({ capabilities: [] })) } as any,
      { upsertNativeEvents: jest.fn(), reconcileUnassignedEvents: jest.fn() } as any,
    );
    await (service as any).scheduleNativeEventContextJobs('trip-1', 'veh-1', 'org-1', 1);
    expect(scheduleContextEnrichmentForTrip).not.toHaveBeenCalled();
  });

  it('requires DrivingEventContextJobService in the DI graph', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          LteR1BehaviorEnrichmentService,
          { provide: PrismaService, useValue: {} },
          { provide: DimoSegmentsService, useValue: {} },
          {
            provide: VehicleDrivingCapabilityResolverService,
            useValue: { resolveForVehicle: jest.fn() },
          },
          {
            provide: DimoNativeDrivingEventPersistenceService,
            useValue: { upsertNativeEvents: jest.fn(), reconcileUnassignedEvents: jest.fn() },
          },
        ],
      }).compile(),
    ).rejects.toThrow();
  });
});

describe('LteR1BehaviorEnrichmentService.enrichTrip — native event + context flow', () => {
  const tripStart = new Date('2026-06-26T11:00:00.000Z');
  const tripEnd = new Date('2026-06-26T12:30:00.000Z');
  const eventTs = '2026-06-26T12:00:00.000Z';

  function makeEnrichTripHarness(opts?: {
    fuelType?: string;
    analysisRun?: { id: string } | null;
  }) {
    const persistedIds = ['de-native-1'];
    const tx = {
      drivingEvent: {
        findMany: jest.fn(async () => [
          { eventType: DrivingEventType.HARSH_ACCELERATION },
        ]),
      },
      vehicleTrip: { update: jest.fn(async () => ({})) },
    };
    const nativeEventPersistence = {
      upsertNativeEvents: jest.fn(async () => [
        {
          id: 'de-native-1',
          providerFingerprint: 'fp-1',
          tripId: 'trip-1',
          tripAssignment: 'ASSIGNED',
          created: true,
          eventType: DrivingEventType.HARSH_ACCELERATION,
        },
      ]),
      reconcileUnassignedEvents: jest.fn(async () => ({ assigned: 0, examined: 0 })),
    };
    const scheduleContextEnrichmentForTrip = jest.fn(async () => ({
      eligibleEvents: 1,
      enqueued: 1,
      skipped: 0,
    }));
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn(async () => ({
          id: 'trip-1',
          vehicleId: 'veh-1',
          startTime: tripStart,
          endTime: tripEnd,
          vehicle: {
            organizationId: 'org-1',
            hardwareType: 'LTE_R1',
            fuelType: opts?.fuelType ?? 'GASOLINE',
            dimoVehicle: { tokenId: 4242 },
          },
        })),
      },
      drivingAnalysisRun: {
        findFirst: jest.fn(async () =>
          opts?.analysisRun === null ? null : (opts?.analysisRun ?? { id: 'run-1' }),
        ),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      drivingEvent: {
        findMany: jest.fn(async () => persistedIds.map((id) => ({ id }))),
      },
    };
    const segments = {
      fetchDrivingEvents: jest.fn(async () => [
        {
          timestamp: eventTs,
          name: 'behavior.harshAcceleration',
          source: '0xDEVICE',
          durationNs: 0,
          metadata: '{"counterValue":2}',
        },
      ]),
      fetchHighFrequency: jest.fn(async () => []),
    };
    const service = new LteR1BehaviorEnrichmentService(
      prisma as any,
      segments as any,
      { scheduleContextEnrichmentForTrip } as any,
      {
        resolveForVehicle: jest.fn(async () => ({ capabilities: [] })),
      } as any,
      nativeEventPersistence as any,
    );
    return {
      service,
      prisma,
      segments,
      tx,
      scheduleContextEnrichmentForTrip,
      persistedIds,
      nativeEventPersistence,
    };
  }

  it('persists native events via fingerprint upsert then schedules context jobs', async () => {
    const { service, tx, scheduleContextEnrichmentForTrip, nativeEventPersistence } =
      makeEnrichTripHarness();

    const result = await service.enrichTrip('trip-1');

    expect(result?.drivingEventsIngested).toBe(1);
    expect(nativeEventPersistence.upsertNativeEvents).toHaveBeenCalledTimes(1);
    expect(nativeEventPersistence.reconcileUnassignedEvents).toHaveBeenCalledTimes(1);
    expect(tx.drivingEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: 'trip-1', source: 'TELEMETRY_EVENTS' },
      }),
    );
    expect(scheduleContextEnrichmentForTrip).toHaveBeenCalledTimes(1);
  });

  it('updates legacy trip counters with harsh + extreme acceleration split', async () => {
    const { service, tx, segments } = makeEnrichTripHarness();
    segments.fetchDrivingEvents.mockResolvedValue([
      {
        timestamp: eventTs,
        name: 'behavior.harshAcceleration',
        source: '0xDEVICE',
        durationNs: 0,
        metadata: '{"counterValue":1}',
      },
      {
        timestamp: eventTs,
        name: 'behavior.extremeAcceleration',
        source: '0xDEVICE',
        durationNs: 0,
        metadata: '{"counterValue":2}',
      },
      {
        timestamp: eventTs,
        name: 'behavior.extremeAcceleration',
        source: '0xDEVICE',
        durationNs: 0,
        metadata: '{"counterValue":3}',
      },
    ]);
    tx.drivingEvent.findMany.mockResolvedValue([
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'HARD', dimoEventName: 'behavior.harshAcceleration' },
      },
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
      },
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
      },
    ] as any);

    const result = await service.enrichTrip('trip-1');

    expect(result?.harshAccelerationCount).toBe(3);
    expect(tx.vehicleTrip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          hardAccelerationCount: 3,
          harshAccelCount: 3,
          accelerationEventCount: 3,
        }),
      }),
    );
  });

  it('does not roll back native events when context job scheduling fails', async () => {
    const scheduleContextEnrichmentForTrip = jest.fn(async () => {
      throw new Error('queue boom');
    });
    const harness = makeEnrichTripHarness();
    const service = new LteR1BehaviorEnrichmentService(
      harness.prisma as any,
      harness.segments as any,
      { scheduleContextEnrichmentForTrip } as any,
      { resolveForVehicle: jest.fn(async () => ({ capabilities: [] })) } as any,
      harness.nativeEventPersistence as any,
    );

    await expect(service.enrichTrip('trip-1')).resolves.toMatchObject({
      drivingEventsIngested: 1,
    });
    expect(harness.nativeEventPersistence.upsertNativeEvents).toHaveBeenCalledTimes(1);
  });

  it('defers context jobs when no analysis run exists', async () => {
    const { service, scheduleContextEnrichmentForTrip } = makeEnrichTripHarness({
      analysisRun: null,
    });

    await service.enrichTrip('trip-1');
    expect(scheduleContextEnrichmentForTrip).not.toHaveBeenCalled();
  });
});
