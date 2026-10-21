import {
  EnergyEventConfidence,
  EnergyEventKind,
} from '@prisma/client';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import { KS_MX_2024_TOKEN_ID } from '@modules/dimo/fixtures/ks-mx-2024-refuel.fixture';
import { parseDimoEnergyEventSegment } from '@modules/dimo/energy-events/parse-energy-event-segment';
import { EnergyEventsService } from './energy-events.service';
import { PhysicalRefuelReconciliationRuntimeService } from './physical-refuel-reconciliation-runtime.service';
import { buildRefuelSegment } from './energy-events.service.spec';
import {
  KS_MX_2024_AUG28_DIMO_SEGMENT,
  KS_MX_2024_AUG28_STALE_SIBLING,
} from '@modules/dimo/fixtures/ks-mx-2024-aug28-refuel.fixture';

const VEHICLE_ID = 'clveh1234567890123456789012';
const ORG_ID = 'org-g21-feature-flag';
const FROM = new Date('2026-08-22T00:00:00.000Z');
const TO = new Date('2026-08-24T00:00:00.000Z');

function buildRechargeSegment(startMs: number, socDelta = 10): DimoEnergyEventSegment {
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
      findUnique: jest.fn(
        async ({ where }: { where: { dimoSegmentId?: string; id?: string } }) => {
          if (where.dimoSegmentId) {
            return (
              store.energyEvents.find((row) => row.dimoSegmentId === where.dimoSegmentId) ?? null
            );
          }
          if (where.id) {
            return store.energyEvents.find((row) => row.id === where.id) ?? null;
          }
          return null;
        },
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

describe('EnergyEventsService G2.1 feature flag', () => {
  const dimoSegments = {
    fetchEnergyEventSegments: jest.fn(),
    fetchFuelLevelSamples: jest.fn().mockResolvedValue([]),
  };

  const fuelStationEnrichmentProducer = {
    enqueueAfterPersistFromEvent: jest.fn().mockResolvedValue('legacy-job'),
  };

  const physicalRefuelReconciliationRuntime = {
    isEnabled: jest.fn(),
    reconcileAndEnqueueAfterPersist: jest.fn().mockResolvedValue({
      decisions: [],
      enqueuedEventIds: [],
      dedupedEventIds: [],
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    dimoSegments.fetchFuelLevelSamples.mockResolvedValue([]);
    fuelStationEnrichmentProducer.enqueueAfterPersistFromEvent.mockResolvedValue('legacy-job');
    physicalRefuelReconciliationRuntime.isEnabled.mockReturnValue(false);
    physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist.mockResolvedValue({
      decisions: [],
      enqueuedEventIds: [],
      dedupedEventIds: [],
    });
  });

  function createService(store: {
    vehicles: Array<{
      id: string;
      organizationId?: string;
      dimoVehicle: { tokenId: number } | null;
    }>;
    energyEvents: Array<Record<string, unknown>>;
  }) {
    return new EnergyEventsService(
      createPrismaMock(store) as never,
      dimoSegments as never,
      undefined,
      fuelStationEnrichmentProducer as never,
      physicalRefuelReconciliationRuntime as unknown as PhysicalRefuelReconciliationRuntimeService,
    );
  }

  it('flag OFF routes refuel persist to legacy enrichment enqueue', async () => {
    physicalRefuelReconciliationRuntime.isEnabled.mockReturnValue(false);
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
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: ORG_ID,
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
        },
      ],
      energyEvents: [],
    };
    const service = createService(store);
    await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(fuelStationEnrichmentProducer.enqueueAfterPersistFromEvent).toHaveBeenCalledTimes(1);
    expect(physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist).not.toHaveBeenCalled();
  });

  it('flag ON routes refuel persist to physical reconciliation runtime', async () => {
    physicalRefuelReconciliationRuntime.isEnabled.mockReturnValue(true);
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
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: ORG_ID,
          dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
        },
      ],
      energyEvents: [],
    };
    const service = createService(store);
    await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: VEHICLE_ID,
        organizationId: ORG_ID,
        tokenId: KS_MX_2024_TOKEN_ID,
      }),
    );
    expect(fuelStationEnrichmentProducer.enqueueAfterPersistFromEvent).not.toHaveBeenCalled();
  });

  it('flag ON skips legacy sibling deletion during detectEnergyEvents', async () => {
    physicalRefuelReconciliationRuntime.isEnabled.mockReturnValue(true);
    const refuel =
      parseDimoEnergyEventSegment(
        KS_MX_2024_TOKEN_ID,
        'refuel',
        KS_MX_2024_AUG28_DIMO_SEGMENT,
      )!;
    dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
      tokenId: KS_MX_2024_TOKEN_ID,
      segments: [refuel],
      outcomes: [
        outcome('refuel', 'SUCCESS_WITH_EVENTS', [refuel]),
        outcome('recharge', 'SUCCESS_EMPTY', []),
      ],
    });

    const store = {
      vehicles: [
        {
          id: VEHICLE_ID,
          organizationId: ORG_ID,
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
    const prisma = createPrismaMock(store);
    const service = new EnergyEventsService(
      prisma as never,
      dimoSegments as never,
      undefined,
      fuelStationEnrichmentProducer as never,
      physicalRefuelReconciliationRuntime as unknown as PhysicalRefuelReconciliationRuntimeService,
    );

    const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

    expect(result.reconciledRefuelSiblings).toBe(0);
    expect(store.energyEvents).toHaveLength(2);
    expect(prisma.vehicleEnergyEvent.deleteMany).not.toHaveBeenCalled();
  });

  it('R15 — RECHARGE detection is unaffected by the G2.1 flag', async () => {
    for (const enabled of [false, true]) {
      jest.clearAllMocks();
      physicalRefuelReconciliationRuntime.isEnabled.mockReturnValue(enabled);
      const recharge = buildRechargeSegment(Date.parse('2026-08-23T10:00:00.000Z'), 25);
      dimoSegments.fetchEnergyEventSegments.mockResolvedValue({
        tokenId: KS_MX_2024_TOKEN_ID,
        segments: [recharge],
        outcomes: [
          outcome('refuel', 'SUCCESS_EMPTY', []),
          outcome('recharge', 'SUCCESS_WITH_EVENTS', [recharge]),
        ],
      });

      const store = {
        vehicles: [
          {
            id: VEHICLE_ID,
            organizationId: ORG_ID,
            dimoVehicle: { tokenId: KS_MX_2024_TOKEN_ID },
          },
        ],
        energyEvents: [],
      };
      const service = createService(store);
      const result = await service.detectEnergyEvents(VEHICLE_ID, { from: FROM, to: TO });

      expect(result.created).toBe(1);
      expect(result.events[0].kind).toBe(EnergyEventKind.RECHARGE);
      expect(result.events[0].durationSeconds).toBe(3600);
      expect([EnergyEventConfidence.MEDIUM, EnergyEventConfidence.HIGH]).toContain(
        result.events[0].confidence,
      );
      expect(physicalRefuelReconciliationRuntime.reconcileAndEnqueueAfterPersist).not.toHaveBeenCalled();
      expect(fuelStationEnrichmentProducer.enqueueAfterPersistFromEvent).not.toHaveBeenCalled();
      expect(dimoSegments.fetchFuelLevelSamples).not.toHaveBeenCalled();
    }
  });
});
