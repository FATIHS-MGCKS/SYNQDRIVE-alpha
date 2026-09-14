import { EnergyEventKind } from '@prisma/client';
import { EnergyEventsService } from './energy-events.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-runtime.service';
import { buildRefuelSegment } from './energy-events.service.spec';
import { KS_MX_2024_TOKEN_ID } from '@modules/dimo/fixtures/ks-mx-2024-refuel.fixture';

const VEHICLE_ID = 'clveh1234567890123456789012';
const FROM = new Date('2026-08-22T00:00:00.000Z');
const TO = new Date('2026-08-24T00:00:00.000Z');

function createPrismaMock(store: {
  vehicles: Array<Record<string, unknown>>;
  energyEvents: Array<Record<string, unknown>>;
  rawCandidates?: Array<Record<string, unknown>>;
}) {
  return {
    vehicle: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        store.vehicles.find((v) => v.id === where.id) ?? null,
      ),
    },
    vehicleEnergyEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `vee-${store.energyEvents.length + 1}`, ...data };
        store.energyEvents.push(row);
        return row;
      }),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    rawRefuelCandidate: {
      count: jest.fn(async () => store.rawCandidates?.length ?? 0),
    },
  };
}

describe('EnergyEventsService RFRF F4-PR2 dark branch', () => {
  const riseSamples = [
    { timestamp: new Date('2026-09-06T08:00:00.000Z'), absoluteLiters: 10, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:05:00.000Z'), absoluteLiters: 10, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:10:00.000Z'), absoluteLiters: 10, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:16:00.000Z'), absoluteLiters: 15, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:18:00.000Z'), absoluteLiters: 22, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:20:00.000Z'), absoluteLiters: 28, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:22:00.000Z'), absoluteLiters: 30, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:24:00.000Z'), absoluteLiters: 30, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:26:00.000Z'), absoluteLiters: 30, relativePercent: null },
    { timestamp: new Date('2026-09-06T08:28:00.000Z'), absoluteLiters: 30, relativePercent: null },
  ];

  beforeEach(() => {
    delete process.env.RAW_FUEL_REFUEL_FALLBACK_ENABLED;
    delete process.env.RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED;
  });

  it('native success preserved when raw branch throws', async () => {
    const refuel = buildRefuelSegment();
    let fuelFetchCalls = 0;
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [refuel],
        outcomes: [
          {
            mechanism: 'refuel',
            status: 'SUCCESS_WITH_EVENTS',
            segments: [refuel],
            windowFrom: FROM.toISOString(),
            windowTo: TO.toISOString(),
          },
          {
            mechanism: 'recharge',
            status: 'SUCCESS_EMPTY',
            segments: [],
            windowFrom: FROM.toISOString(),
            windowTo: TO.toISOString(),
          },
        ],
      }),
      fetchFuelLevelSamples: jest.fn().mockImplementation(async () => {
        fuelFetchCalls += 1;
        if (fuelFetchCalls === 1) return [];
        throw new Error('legacy should not be used for raw branch');
      }),
      fetchFuelLevelSamplesWithOutcome: jest.fn().mockResolvedValue({
        status: 'ERROR',
        samples: [],
        errorClass: 'PROVIDER_QUERY_FAILED',
        message: 'raw fetch failed',
      }),
    };
    const store = {
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: 'org-1',
          fuelType: 'GASOLINE',
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID, powertrainType: null, fuelType: null },
        },
      ],
      energyEvents: [],
    };
    const prisma = createPrismaMock(store);
    prisma.vehicleEnergyEvent.findUnique = jest.fn().mockResolvedValue(null);

    const rawRuntime = new RawFuelRefuelFallbackRuntimeService(
      dimoSegments as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      () => ({ masterEnabled: true, persistEnabled: true, cutoverAt: null }),
    );

    const service = new EnergyEventsService(
      prisma as never,
      dimoSegments as never,
      undefined,
      undefined,
      undefined,
      rawRuntime,
    );

    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.created).toBe(1);
    expect(result.events[0]?.kind).toBe(EnergyEventKind.REFUEL);
    expect(result.rawFuelFallback?.skipReason).toBe('sample_fetch_failed');
  });

  it('raw branch not invoked when master flag off', async () => {
    const dimoSegments = {
      fetchEnergyEventSegments: jest.fn().mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [],
        outcomes: [],
      }),
      fetchFuelLevelSamples: jest.fn(),
      fetchFuelLevelSamplesWithOutcome: jest.fn(),
    };
    const store = {
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: 'org-1',
          fuelType: 'GASOLINE',
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
        },
      ],
      energyEvents: [],
    };
    const service = new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
      undefined,
      undefined,
      undefined,
      new RawFuelRefuelFallbackRuntimeService(
        dimoSegments as never,
        {} as never,
      ),
    );
    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });
    expect(result.rawFuelFallback?.skipReason).toBe('master_disabled');
    expect(dimoSegments.fetchFuelLevelSamples).not.toHaveBeenCalled();
    expect(dimoSegments.fetchFuelLevelSamplesWithOutcome).not.toHaveBeenCalled();
  });
});
