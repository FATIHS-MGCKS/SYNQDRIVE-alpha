import { DrivingEventType } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { EventContextEnrichmentService } from '../event-context/event-context-enrichment.service';
import {
  LteR1BehaviorEnrichmentService,
  mapDimoEventName,
  resolveNativeSeverity,
} from './lte-r1-behavior-enrichment.service';
import { DimoBrakingEventIntakeService } from '../brakes/dimo-braking-event-intake.service';
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
  const brakingIntake = {
    fetchEventDataSummary: jest.fn(),
    fetchDrivingEventsPaginated: jest.fn(),
    ingestBrakingBatch: jest.fn(),
  };
  const service = new LteR1BehaviorEnrichmentService(
    {} as any,
    {} as any,
    {} as any,
    brakingIntake as any,
  );

  const sample = (name: string, metadata: string | null = '{"counterValue":1}'): DimoVehicleEventRecord => ({
    timestamp: '2026-01-01T12:00:00.000Z',
    name,
    source: '0xDEVICEWALLET',
    durationNs: 0,
    metadata,
  });

  function mapSamples(samples: DimoVehicleEventRecord[]): any[] {
    return (service as any).mapToNormalizedEvents(samples, 'veh-1', 'org-1', 'trip-1', new Map(), 42);
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

  it('drops unknown event names but keeps mappable ones', () => {
    const events = mapSamples([
      sample('behavior.harshBraking'),
      sample('behavior.unknownThing'),
      sample('behavior.extremeAcceleration'),
    ]);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventType)).toEqual([
      DrivingEventType.HARSH_BRAKING,
      DrivingEventType.HARSH_ACCELERATION,
    ]);
  });
});

describe('LteR1BehaviorEnrichmentService.enrichNativeEventContexts (Phase 3 wiring)', () => {
  function makeService(eventContext?: { enrichDrivingEventContext: jest.Mock }) {
    const prisma = {
      drivingEvent: {
        findMany: jest.fn(async () => [{ id: 'de-1' }, { id: 'de-2' }]),
      },
    };
    const service = new LteR1BehaviorEnrichmentService(
      prisma as any,
      {} as any,
      eventContext as any,
      { fetchEventDataSummary: jest.fn(), fetchDrivingEventsPaginated: jest.fn(), ingestBrakingBatch: jest.fn() } as any,
    );
    return { service, prisma };
  }

  const ice = { hardwareType: 'LTE_R1' as const, fuelType: 'GASOLINE' };
  const ev = { hardwareType: 'LTE_R1' as const, fuelType: 'ELECTRIC' };

  it('runs context enrichment per native event for LTE_R1/ICE', async () => {
    const eventContext = { enrichDrivingEventContext: jest.fn(async () => ({})) };
    const { service, prisma } = makeService(eventContext);
    await (service as any).enrichNativeEventContexts('trip-1', ice, 2);
    expect(prisma.drivingEvent.findMany).toHaveBeenCalledTimes(1);
    expect(eventContext.enrichDrivingEventContext).toHaveBeenCalledTimes(2);
    expect(eventContext.enrichDrivingEventContext).toHaveBeenCalledWith('de-1');
    expect(eventContext.enrichDrivingEventContext).toHaveBeenCalledWith('de-2');
  });

  it('skips Tesla/EV (NOT_APPLICABLE_POWERTRAIN) without loading or enriching', async () => {
    const eventContext = { enrichDrivingEventContext: jest.fn(async () => ({})) };
    const { service, prisma } = makeService(eventContext);
    await (service as any).enrichNativeEventContexts('trip-1', ev, 2);
    expect(prisma.drivingEvent.findMany).not.toHaveBeenCalled();
    expect(eventContext.enrichDrivingEventContext).not.toHaveBeenCalled();
  });

  it('does nothing when no native events were persisted', async () => {
    const eventContext = { enrichDrivingEventContext: jest.fn(async () => ({})) };
    const { service, prisma } = makeService(eventContext);
    await (service as any).enrichNativeEventContexts('trip-1', ice, 0);
    expect(prisma.drivingEvent.findMany).not.toHaveBeenCalled();
    expect(eventContext.enrichDrivingEventContext).not.toHaveBeenCalled();
  });

  it('is best-effort: a context enrichment error never throws', async () => {
    const eventContext = {
      enrichDrivingEventContext: jest.fn(async () => {
        throw new Error('context boom');
      }),
    };
    const { service } = makeService(eventContext);
    await expect(
      (service as any).enrichNativeEventContexts('trip-1', ice, 2),
    ).resolves.toBeUndefined();
    expect(eventContext.enrichDrivingEventContext).toHaveBeenCalledTimes(2);
  });

  it('requires EventContextEnrichmentService in the DI graph', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          LteR1BehaviorEnrichmentService,
          { provide: PrismaService, useValue: {} },
          { provide: DimoSegmentsService, useValue: {} },
          {
            provide: DimoBrakingEventIntakeService,
            useValue: {
              fetchEventDataSummary: jest.fn(),
              fetchDrivingEventsPaginated: jest.fn(),
              ingestBrakingBatch: jest.fn(),
            },
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
    contextThrows?: boolean;
    contextStatus?: 'COMPLETED' | 'FAILED';
  }) {
    const persistedIds = ['de-native-1'];
    const tx = {
      drivingEvent: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(async () => ({ count: 1 })),
      },
      vehicleTrip: { update: jest.fn(async () => ({})) },
    };
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
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
      drivingEvent: {
        findMany: jest.fn(async () => persistedIds.map((id) => ({ id }))),
      },
      dimoBrakingEventIntake: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const segments = {
      fetchHighFrequency: jest.fn(async () => []),
    };
    const brakingIntake = {
      fetchEventDataSummary: jest.fn(async () => [
        { name: 'behavior.harshBraking', numberOfEvents: 3 },
      ]),
      fetchDrivingEventsPaginated: jest.fn(async () => [
        {
          timestamp: eventTs,
          name: 'behavior.harshAcceleration',
          source: '0xDEVICE',
          durationNs: 0,
          metadata: '{"counterValue":2}',
        },
      ]),
      ingestBrakingBatch: jest.fn(async () => ({
        created: 0,
        duplicate: 0,
        skipped: 0,
        failed: 0,
        parsed: [],
      })),
    };
    const enrichDrivingEventContext = jest.fn(async () => {
      if (opts?.contextThrows) throw new Error('context boom');
      return { status: opts?.contextStatus ?? 'COMPLETED' };
    });
    const service = new LteR1BehaviorEnrichmentService(
      prisma as any,
      segments as any,
      { enrichDrivingEventContext } as any,
      brakingIntake as any,
    );
    return { service, prisma, segments, tx, enrichDrivingEventContext, persistedIds, brakingIntake };
  }

  it('persists native events via createMany then reloads IDs for context enrichment', async () => {
    const { service, prisma, tx, enrichDrivingEventContext, persistedIds } = makeEnrichTripHarness();

    const result = await service.enrichTrip('trip-1');

    expect(result?.drivingEventsIngested).toBe(1);
    expect(tx.drivingEvent.deleteMany).toHaveBeenCalled();
    expect(tx.drivingEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.drivingEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId: 'trip-1', source: 'TELEMETRY_EVENTS' },
      }),
    );
    expect(enrichDrivingEventContext).toHaveBeenCalledTimes(1);
    expect(enrichDrivingEventContext).toHaveBeenCalledWith(persistedIds[0]);
  });

  it('does not roll back native events when context enrichment fails per event', async () => {
    const { service, tx, enrichDrivingEventContext } = makeEnrichTripHarness({ contextThrows: true });

    await expect(service.enrichTrip('trip-1')).resolves.toMatchObject({
      drivingEventsIngested: 1,
    });
    expect(tx.drivingEvent.createMany).toHaveBeenCalledTimes(1);
    expect(enrichDrivingEventContext).toHaveBeenCalledTimes(1);
  });

  it('skips trip-level context enrichment for LTE_R1/EV (NOT_APPLICABLE_POWERTRAIN)', async () => {
    const { service, enrichDrivingEventContext } = makeEnrichTripHarness({ fuelType: 'ELECTRIC' });

    await service.enrichTrip('trip-1');
    expect(enrichDrivingEventContext).not.toHaveBeenCalled();
  });
});
