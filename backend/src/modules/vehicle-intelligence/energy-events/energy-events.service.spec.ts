import {
  EnergyEventConfidence,
  EnergyEventKind,
} from '@prisma/client';
import { EnergyEventsService } from './energy-events.service';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import {
  KS_MX_2024_DEFAULT_CONFIG_SEGMENTS,
  KS_MX_2024_FUEL_LEVEL_EVIDENCE,
  KS_MX_2024_TOKEN_ID,
  KS_MX_2024_TUNED_CONFIG_SEGMENT,
} from '@modules/dimo/fixtures/ks-mx-2024-refuel.fixture';
import { DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG } from '@modules/dimo/energy-events/dimo-energy-detector.config';
import { parseDimoEnergyEventSegment } from '@modules/dimo/energy-events/parse-energy-event-segment';
import {
  buildKsMx2024Aug28FuelSamples,
  KS_MX_2024_AUG28_DETECTION,
  KS_MX_2024_AUG28_DIMO_SEGMENT,
  KS_MX_2024_AUG28_STALE_SIBLING,
} from '@modules/dimo/fixtures/ks-mx-2024-aug28-refuel.fixture';

const VEHICLE_ID = 'clveh1234567890123456789012';
const FROM = new Date('2026-08-22T00:00:00.000Z');
const TO = new Date('2026-08-24T00:00:00.000Z');

function buildRefuelSegment(
  overrides: Partial<DimoEnergyEventSegment> = {},
): DimoEnergyEventSegment {
  return {
    segmentId: `dimo-refuel-${KS_MX_2024_TOKEN_ID}-1724427315000`,
    mechanism: 'refuel',
    startTime: KS_MX_2024_FUEL_LEVEL_EVIDENCE.refuelStartUtc,
    endTime: KS_MX_2024_FUEL_LEVEL_EVIDENCE.refuelEndUtc,
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 481,
    startLatitude: 51.31,
    startLongitude: 9.49,
    endLatitude: 51.31,
    endLongitude: 9.49,
    odometerStartKm: 12000,
    odometerEndKm: 12000,
    fuelStartLiters: 8,
    fuelEndLiters: 26,
    fuelDeltaLiters: 18,
    fuelStartPercent: 13,
    fuelEndPercent: 42,
    fuelDeltaPercent: 29,
    socStartPercent: null,
    socEndPercent: null,
    socDeltaPercent: null,
    energyStartKwh: null,
    energyEndKwh: null,
    energyDeltaKwh: null,
    ...overrides,
  };
}

function buildRechargeSegment(
  startMs: number,
  socDelta = 10,
): DimoEnergyEventSegment {
  return {
    segmentId: `dimo-recharge-${KS_MX_2024_TOKEN_ID}-${startMs}`,
    mechanism: 'recharge',
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(startMs + 3600_000).toISOString(),
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 3600,
    startLatitude: 51.3,
    startLongitude: 9.5,
    endLatitude: 51.3,
    endLongitude: 9.5,
    odometerStartKm: 10000,
    odometerEndKm: 10000,
    fuelStartLiters: null,
    fuelEndLiters: null,
    fuelDeltaLiters: null,
    fuelStartPercent: null,
    fuelEndPercent: null,
    fuelDeltaPercent: null,
    socStartPercent: 40,
    socEndPercent: 40 + socDelta,
    socDeltaPercent: socDelta,
    energyStartKwh: 20,
    energyEndKwh: 24,
    energyDeltaKwh: 4,
  };
}

function outcome(
  mechanism: 'refuel' | 'recharge',
  status: EnergyMechanismFetchOutcome['status'],
  segments: DimoEnergyEventSegment[],
  error?: EnergyMechanismFetchOutcome['error'],
): EnergyMechanismFetchOutcome {
  return {
    mechanism,
    status,
    segments,
    windowFrom: FROM.toISOString(),
    windowTo: TO.toISOString(),
    tokenId: KS_MX_2024_TOKEN_ID,
    error,
  };
}

function createPrismaMock(store: {
  vehicles: Array<{
    id: string;
    organizationId?: string;
    dimoVehicle: { tokenId: number } | null;
  }>;
  energyEvents: Array<Record<string, unknown>>;
}) {
  return {
    vehicle: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        store.vehicles.find((vehicle) => vehicle.id === where.id) ?? null,
      ),
    },
    vehicleEnergyEvent: {
      findUnique: jest.fn(async ({ where }: { where: { dimoSegmentId: string } }) =>
        store.energyEvents.find(
          (row) => row.dimoSegmentId === where.dimoSegmentId,
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `evt-${store.energyEvents.length + 1}`, ...data };
        store.energyEvents.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const index = store.energyEvents.findIndex((row) => row.id === where.id);
          store.energyEvents[index] = { ...store.energyEvents[index], ...data };
          return store.energyEvents[index];
        },
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            vehicleId: string;
            kind?: string;
            startTime?: { gte?: Date; lte?: Date };
            dimoSegmentId?: { in: string[] };
            id?: { notIn?: string[] };
          };
        }) =>
          store.energyEvents.filter((row) => {
            if (row.vehicleId !== where.vehicleId) return false;
            if (where.kind && row.kind !== where.kind) return false;
            if (where.id?.notIn?.includes(row.id as string)) return false;
            const startTime = new Date(row.startTime as string);
            if (where.startTime?.gte && startTime < where.startTime.gte) return false;
            if (where.startTime?.lte && startTime > where.startTime.lte) return false;
            if (
              where.dimoSegmentId?.in &&
              !where.dimoSegmentId.in.includes(row.dimoSegmentId as string)
            ) {
              return false;
            }
            return true;
          }),
      ),
      deleteMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = store.energyEvents.length;
        store.energyEvents = store.energyEvents.filter(
          (row) => !where.id.in.includes(row.id as string),
        );
        return { count: before - store.energyEvents.length };
      }),
    },
  };
}

describe('EnergyEventsService.detectEnergyEvents', () => {
  const dimoSegments = {
    fetchEnergyEventSegments: jest.fn(),
    fetchFuelLevelSamples: jest.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    dimoSegments.fetchFuelLevelSamples.mockResolvedValue([]);
  });

  function createService(store: {
    vehicles: Array<{ id: string; dimoVehicle: { tokenId: number } | null }>;
    energyEvents: Array<Record<string, unknown>>;
  }) {
    return new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
    );
  }

  it('persists refuel events when recharge fetch fails', async () => {
    const refuel = buildRefuelSegment();
    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [refuel],
      outcomes: [
        outcome('refuel', 'SUCCESS_WITH_EVENTS', [refuel]),
        outcome('recharge', 'FAILED', [], {
          message: 'Request failed with status code 422',
          httpStatus: 422,
          retryable: false,
        }),
      ],
    });

    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.created).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].kind).toBe(EnergyEventKind.REFUEL);
    expect(result.prunedStale).toBe(0);
  });

  it('persists recharge events when refuel fetch fails', async () => {
    const recharge = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [recharge],
      outcomes: [
        outcome('refuel', 'FAILED', [], {
          message: 'Request failed with status code 422',
          httpStatus: 422,
          retryable: false,
        }),
        outcome('recharge', 'SUCCESS_WITH_EVENTS', [recharge]),
      ],
    });

    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.created).toBe(1);
    expect(result.events[0].kind).toBe(EnergyEventKind.RECHARGE);
    expect(result.prunedStale).toBe(0);
  });

  it('does not prune when any mechanism fetch failed', async () => {
    const existingId = 'existing-refuel';
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [
        {
          id: existingId,
          vehicleId: VEHICLE_ID,
          dimoSegmentId: 'dimo-refuel-old-subsegment',
          kind: EnergyEventKind.REFUEL,
          startTime: '2026-08-23T12:00:00.000Z',
        },
      ],
    };

    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [],
      outcomes: [
        outcome('refuel', 'SUCCESS_EMPTY', []),
        outcome('recharge', 'FAILED', [], {
          message: '422',
          httpStatus: 422,
          retryable: false,
        }),
      ],
    });

    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.prunedStale).toBe(0);
    expect(store.energyEvents).toHaveLength(1);
    expect(store.energyEvents[0].id).toBe(existingId);
  });

  it('does not prune existing events on successful empty detection', async () => {
    const existingId = 'existing-refuel';
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [
        {
          id: existingId,
          vehicleId: VEHICLE_ID,
          dimoSegmentId: 'dimo-refuel-old-subsegment',
          kind: EnergyEventKind.REFUEL,
          startTime: '2026-08-23T12:00:00.000Z',
        },
      ],
    };

    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [],
      outcomes: [
        outcome('refuel', 'SUCCESS_EMPTY', []),
        outcome('recharge', 'SUCCESS_EMPTY', []),
      ],
    });

    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.prunedStale).toBe(0);
    expect(store.energyEvents).toHaveLength(1);
  });

  it('does not prune unrelated refuel A when detector returns only refuel B', async () => {
    const refuelAId = 'dimo-refuel-187336-1111111111000';
    const refuelB = buildRefuelSegment({
      segmentId: 'dimo-refuel-187336-2222222222000',
      startTime: '2026-08-23T14:00:00.000Z',
      endTime: '2026-08-23T14:08:00.000Z',
    });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [
        {
          id: 'existing-refuel-a',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: refuelAId,
          kind: EnergyEventKind.REFUEL,
          startTime: '2026-08-23T10:00:00.000Z',
        },
      ],
    };

    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [refuelB],
      outcomes: [
        outcome('refuel', 'SUCCESS_WITH_EVENTS', [refuelB]),
        outcome('recharge', 'SUCCESS_EMPTY', []),
      ],
    });

    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.prunedStale).toBe(0);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === refuelAId)).toBe(true);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === refuelB.segmentId)).toBe(
      true,
    );
  });

  it('prunes raw recharge subsegments replaced by a coalesced event in this run', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [
        {
          id: 'raw-a',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subA.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subA.startTime,
        },
        {
          id: 'raw-b',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subB.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subB.startTime,
        },
        {
          id: 'raw-c',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subC.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subC.startTime,
        },
      ],
    };

    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [subA, subB, subC],
      outcomes: [
        outcome('refuel', 'SUCCESS_EMPTY', []),
        outcome('recharge', 'SUCCESS_WITH_EVENTS', [subA, subB, subC]),
      ],
    });

    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    const coalescedId = `dimo-recharge-coalesced-${KS_MX_2024_TOKEN_ID}-${Date.parse(subA.startTime)}`;
    expect(result.prunedStale).toBe(3);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === coalescedId)).toBe(true);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === subA.segmentId)).toBe(
      false,
    );
    expect(store.energyEvents.some((row) => row.dimoSegmentId === subB.segmentId)).toBe(
      false,
    );
    expect(store.energyEvents.some((row) => row.dimoSegmentId === subC.segmentId)).toBe(
      false,
    );
  });

  it('does not prune unrelated recharge D when coalesced event replaces A/B/C', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const subC = buildRechargeSegment(Date.parse('2026-08-23T10:40:00.000Z'));
    const unrelatedDId = 'dimo-recharge-187336-9999999999000';
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [
        {
          id: 'raw-a',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subA.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subA.startTime,
        },
        {
          id: 'raw-b',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subB.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subB.startTime,
        },
        {
          id: 'raw-c',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subC.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subC.startTime,
        },
        {
          id: 'unrelated-d',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: unrelatedDId,
          kind: EnergyEventKind.RECHARGE,
          startTime: '2026-08-23T18:00:00.000Z',
        },
      ],
    };

    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [subA, subB, subC],
      outcomes: [
        outcome('refuel', 'SUCCESS_EMPTY', []),
        outcome('recharge', 'SUCCESS_WITH_EVENTS', [subA, subB, subC]),
      ],
    });

    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.prunedStale).toBe(3);
    expect(store.energyEvents.some((row) => row.dimoSegmentId === unrelatedDId)).toBe(true);
  });

  it('does not prune when mechanism fetch failed even if coalescing would replace subsegments', async () => {
    const subA = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'));
    const subB = buildRechargeSegment(Date.parse('2026-08-23T10:20:00.000Z'));
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [
        {
          id: 'raw-a',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subA.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subA.startTime,
        },
        {
          id: 'raw-b',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: subB.segmentId,
          kind: EnergyEventKind.RECHARGE,
          startTime: subB.startTime,
        },
      ],
    };

    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [],
      outcomes: [
        outcome('refuel', 'SUCCESS_EMPTY', []),
        outcome('recharge', 'FAILED', [], {
          message: '422',
          httpStatus: 422,
          retryable: false,
        }),
      ],
    });

    const service = createService(store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.prunedStale).toBe(0);
    expect(store.energyEvents).toHaveLength(2);
  });

  it('is idempotent across repeated execution', async () => {
    const refuel = buildRefuelSegment();
    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [refuel],
      outcomes: [
        outcome('refuel', 'SUCCESS_WITH_EVENTS', [refuel]),
        outcome('recharge', 'SUCCESS_EMPTY', []),
      ],
    });

    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const service = createService(store);

    const first = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    const second = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(store.energyEvents).toHaveLength(1);
  });
});

describe('KS MX 2024 E2 reference fixture', () => {
  it('documents that default DIMO config misses the refuel', () => {
    expect(KS_MX_2024_DEFAULT_CONFIG_SEGMENTS).toEqual([]);
    expect(KS_MX_2024_TUNED_CONFIG_SEGMENT.start.timestamp).toBe(
      KS_MX_2024_FUEL_LEVEL_EVIDENCE.refuelStartUtc,
    );
    expect(KS_MX_2024_FUEL_LEVEL_EVIDENCE.startRelativePercent).toBe(13);
    expect(KS_MX_2024_FUEL_LEVEL_EVIDENCE.endRelativePercent).toBe(42);
  });

  it('E2 production refuel config matches live calibration reference', () => {
    expect(DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG.minIncreasePercent).toBe(5);
    expect(KS_MX_2024_TUNED_CONFIG_SEGMENT.duration).toBe(481);
  });
});

describe('EnergyEventsService persist gate (E2 false-positive guard)', () => {
  function buildService(
    segments: DimoEnergyEventSegment[],
    store: {
      vehicles: Array<{ id: string; dimoVehicle: { tokenId: number } | null }>;
      energyEvents: Array<Record<string, unknown>>;
    },
  ) {
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments,
        outcomes: [outcome('refuel', 'SUCCESS_WITH_EVENTS', segments)],
      }),
      fetchFuelLevelSamples: jest.fn().mockResolvedValue([]),
    };
    return {
      service: new EnergyEventsService(
        createPrismaMock(store) as never,
        dimoSegments as never,
      ),
      store,
    };
  }

  it('C: persists refuel when fuelDeltaLiters > 1 (liters-based gate)', async () => {
    const refuel = buildRefuelSegment({ fuelDeltaLiters: 18, fuelDeltaPercent: 29 });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const { service } = buildService([refuel], store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(1);
    expect(store.energyEvents).toHaveLength(1);
  });

  it('D: persists refuel when both liters and percent are present', async () => {
    const refuel = buildRefuelSegment({
      fuelDeltaLiters: 24,
      fuelDeltaPercent: 35,
      fuelStartLiters: 10,
      fuelEndLiters: 34,
      fuelStartPercent: 20,
      fuelEndPercent: 55,
    });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const { service } = buildService([refuel], store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(1);
  });

  it('does not persist refuel segments with fuelDeltaLiters <= 1 (sensor noise)', async () => {
    const noiseRefuel = buildRefuelSegment({
      fuelDeltaLiters: 0.4,
      fuelDeltaPercent: 1.2,
      fuelStartPercent: 40,
      fuelEndPercent: 41.2,
    });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const { service } = buildService([noiseRefuel], store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(store.energyEvents).toHaveLength(0);
  });

  it('A: skips percent-only refuel with large delta (liters gate; fleet has absolute fuel)', async () => {
    const percentOnly = buildRefuelSegment({
      fuelDeltaLiters: null,
      fuelStartLiters: null,
      fuelEndLiters: null,
      fuelDeltaPercent: 29,
      fuelStartPercent: 13,
      fuelEndPercent: 42,
    });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const { service } = buildService([percentOnly], store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('B: skips percent-only small noise', async () => {
    const percentNoise = buildRefuelSegment({
      fuelDeltaLiters: null,
      fuelDeltaPercent: 2.5,
      fuelStartPercent: 40,
      fuelEndPercent: 42.5,
    });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const { service } = buildService([percentNoise], store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('E: skips refuel when neither liters nor percent delta is usable', async () => {
    const empty = buildRefuelSegment({
      fuelDeltaLiters: null,
      fuelDeltaPercent: null,
      fuelStartLiters: null,
      fuelEndLiters: null,
      fuelStartPercent: null,
      fuelEndPercent: null,
    });
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const { service } = buildService([empty], store);
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe('EnergyEventsService confidence scoring', () => {
  it('scores a meaningful refuel as HIGH when liters and GPS are present', async () => {
    const refuel = buildRefuelSegment({ fuelDeltaLiters: 18 });
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [refuel],
        outcomes: [outcome('refuel', 'SUCCESS_WITH_EVENTS', [refuel])],
      }),
      fetchFuelLevelSamples: jest.fn().mockResolvedValue([]),
    };
    const store = {
      vehicles: [{ id: VEHICLE_ID, dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID } }],
      energyEvents: [],
    };
    const service = new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
    );
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.events[0].confidence).toBe(EnergyEventConfidence.HIGH);
  });
});

describe('EnergyEventsService refuel semantics (P1.3-S5)', () => {
  const AUG_FROM = new Date('2026-08-28T20:30:00.000Z');
  const AUG_TO = new Date('2026-08-28T23:00:00.000Z');

  function augOutcome(
    segments: DimoEnergyEventSegment[],
  ): EnergyMechanismFetchOutcome {
    return {
      mechanism: 'refuel',
      status: 'SUCCESS_WITH_EVENTS',
      segments,
      windowFrom: AUG_FROM.toISOString(),
      windowTo: AUG_TO.toISOString(),
      tokenId: KS_MX_2024_TOKEN_ID,
    };
  }

  function buildAug28RefuelSegment() {
    return parseDimoEnergyEventSegment(
      KS_MX_2024_TOKEN_ID,
      'refuel',
      KS_MX_2024_AUG28_DIMO_SEGMENT,
    )!;
  }

  it('persists fuel-rise observation separately from detection envelope', async () => {
    const refuel = buildAug28RefuelSegment();
    const samples = buildKsMx2024Aug28FuelSamples().map((s) => ({
      timestamp: new Date(s.timestamp),
      relativePercent: s.relativePercent,
      absoluteLiters: null,
    }));
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [refuel],
        outcomes: [augOutcome([refuel])],
      }),
      fetchFuelLevelSamples: jest.fn().mockResolvedValue(samples),
    };
    const store = {
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: 'org-1',
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
        },
      ],
      energyEvents: [],
    };
    const service = new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
    );
    const result = await service.detectEnergyEvents(VEHICLE_ID, {
      from: AUG_FROM,
      to: AUG_TO,
    });

    expect(result.created).toBe(1);
    expect(result.events[0].durationSeconds).toBe(
      KS_MX_2024_AUG28_DETECTION.durationSeconds,
    );
    expect(result.events[0].fuelLevelRiseDurationSeconds).not.toBeNull();
    expect(result.events[0].fuelLevelRiseDurationSeconds!).toBeGreaterThanOrEqual(240);
    expect(result.events[0].fuelLevelRiseDurationSeconds!).toBeLessThanOrEqual(320);
  });

  it('reconciles stale partial refuel sibling when canonical envelope is persisted', async () => {
    const refuel = buildAug28RefuelSegment();
    const store = {
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: 'org-1',
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
        },
      ],
      energyEvents: [
        {
          id: 'stale-row',
          vehicleId: VEHICLE_ID,
          dimoSegmentId: KS_MX_2024_AUG28_STALE_SIBLING.dimoSegmentId,
          kind: EnergyEventKind.REFUEL,
          startTime: new Date(KS_MX_2024_AUG28_STALE_SIBLING.startTime),
          endTime: new Date(KS_MX_2024_AUG28_STALE_SIBLING.endTime),
          durationSeconds: KS_MX_2024_AUG28_STALE_SIBLING.durationSeconds,
          fuelDeltaLiters: KS_MX_2024_AUG28_STALE_SIBLING.fuelDeltaLiters,
          fuelDeltaPercent: KS_MX_2024_AUG28_STALE_SIBLING.fuelDeltaPercent,
        },
      ],
    };
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [refuel],
        outcomes: [augOutcome([refuel])],
      }),
      fetchFuelLevelSamples: jest.fn().mockResolvedValue([]),
    };
    const service = new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
    );
    const result = await service.detectEnergyEvents(VEHICLE_ID, {
      from: AUG_FROM,
      to: AUG_TO,
    });

    expect(result.reconciledRefuelSiblings).toBe(1);
    expect(store.energyEvents).toHaveLength(1);
    expect(store.energyEvents[0].durationSeconds).toBe(4818);
  });

  it('does not alter recharge duration semantics when refuel fields are added', async () => {
    const recharge = buildRechargeSegment(Date.parse('2026-08-28T12:00:00.000Z'), 25);
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [recharge],
        outcomes: [outcome('recharge', 'SUCCESS_WITH_EVENTS', [recharge])],
      }),
      fetchFuelLevelSamples: jest.fn(),
    };
    const store = {
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: 'org-1',
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
        },
      ],
      energyEvents: [],
    };
    const service = new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
    );
    const result = await service.detectEnergyEvents(VEHICLE_ID, {
      from: AUG_FROM,
      to: AUG_TO,
    });

    expect(dimoSegments.fetchFuelLevelSamples).not.toHaveBeenCalled();
    expect(result.events[0].durationSeconds).toBe(3600);
    expect(result.events[0].fuelLevelRiseDurationSeconds).toBeNull();
  });
});
