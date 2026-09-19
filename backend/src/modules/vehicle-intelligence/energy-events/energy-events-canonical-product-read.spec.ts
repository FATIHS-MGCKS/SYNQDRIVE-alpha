import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
} from '@prisma/client';
import { EnergyEventsService } from './energy-events.service';
import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';

const VEHICLE_ID = 'veh-canonical-product-read';

function buildWobThreeRevisionRows() {
  const groupId = `${VEHICLE_ID}:physical-wob-shape`;
  const base = {
    vehicleId: VEHICLE_ID,
    kind: EnergyEventKind.REFUEL,
    detectionMechanism: 'refuel',
    confidence: 'HIGH' as const,
    durationSeconds: 300,
    startLatitude: 51.0,
    startLongitude: 9.0,
    endLatitude: 51.0,
    endLongitude: 9.0,
    fuelDeltaPercent: null,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 1,
    odometerEndKm: 1,
    fuelLevelRiseStart: null,
    fuelLevelRiseEnd: null,
    fuelLevelRiseDurationSeconds: null,
    fuelStationEnrichment: null,
    createdAt: new Date('2026-09-19T16:09:00.000Z'),
    updatedAt: new Date('2026-09-19T16:09:00.000Z'),
  };

  const rev1 = {
    ...base,
    id: 'native-rev-1',
    dimoSegmentId: 'dimo-seg-rev-1',
    startTime: new Date('2026-09-19T16:08:00.000Z'),
    endTime: new Date('2026-09-19T16:12:00.000Z'),
    fuelDeltaLiters: 11,
    rawDetectionMeta: { fuelStartLiters: 5, fuelEndLiters: 16 },
    refuelReconciliation: {
      energyEventId: 'native-rev-1',
      vehicleId: VEHICLE_ID,
      reconciliationGroupId: groupId,
      finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
      canonicalEventId: 'native-rev-3',
      enrichmentEligible: false,
    },
  };
  const rev2 = {
    ...base,
    id: 'native-rev-2',
    dimoSegmentId: 'dimo-seg-rev-2',
    startTime: new Date('2026-09-19T16:09:00.000Z'),
    endTime: new Date('2026-09-19T16:14:00.000Z'),
    fuelDeltaLiters: 12,
    rawDetectionMeta: { fuelStartLiters: 5, fuelEndLiters: 17 },
    refuelReconciliation: {
      energyEventId: 'native-rev-2',
      vehicleId: VEHICLE_ID,
      reconciliationGroupId: groupId,
      finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
      canonicalEventId: 'native-rev-3',
      enrichmentEligible: false,
    },
  };
  const rev3 = {
    ...base,
    id: 'native-rev-3',
    dimoSegmentId: 'dimo-seg-rev-3',
    startTime: new Date('2026-09-19T16:09:00.000Z'),
    endTime: new Date('2026-09-19T16:15:27.000Z'),
    fuelDeltaLiters: 13,
    rawDetectionMeta: { fuelStartLiters: 5, fuelEndLiters: 18 },
    refuelReconciliation: {
      energyEventId: 'native-rev-3',
      vehicleId: VEHICLE_ID,
      reconciliationGroupId: groupId,
      finalityState: PhysicalRefuelFinalityState.FINAL_CANONICAL,
      canonicalEventId: 'native-rev-3',
      enrichmentEligible: true,
    },
  };
  return [rev1, rev2, rev3];
}

describe('EnergyEventsService canonical product read (F10.6.6-B.2)', () => {
  const wobRows = buildWobThreeRevisionRows();
  const findMany = jest.fn().mockResolvedValue(wobRows);
  const prisma = { vehicleEnergyEvent: { findMany } };
  const service = new EnergyEventsService(prisma as never, {} as never);

  const testEnv = {
    ...process.env,
    [PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV]: '2026-09-04T12:00:00.000Z',
  };

  beforeEach(() => {
    findMany.mockClear();
    findMany.mockResolvedValue(wobRows);
  });

  it('listCanonicalEnergyEvents loads refuelReconciliation from Prisma', async () => {
    await service.listCanonicalEnergyEvents(VEHICLE_ID, {}, testEnv);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          refuelReconciliation: true,
          fuelStationEnrichment: true,
        }),
      }),
    );
  });

  it('WOB service path — 3 DB rows → 1 canonical product refuel', async () => {
    expect(wobRows).toHaveLength(3);
    const canonical = await service.listCanonicalEnergyEvents(VEHICLE_ID, {}, testEnv);
    const refuels = canonical.filter((event) => event.kind === 'REFUEL');
    expect(refuels).toHaveLength(1);
    expect(refuels[0].id).toBe('native-rev-3');
  });

  it('buildTripsTimeline exposes one physical refuel via canonical read', async () => {
    const timeline = await service.buildTripsTimeline(VEHICLE_ID, [], {}, testEnv);
    const refuelItems = timeline.filter(
      (item) => item.itemType === 'energy-event' && item.kind === 'REFUEL',
    );
    expect(refuelItems).toHaveLength(1);
    expect(refuelItems[0].id).toBe('native-rev-3');
  });

  it('fails WOB canonical projection when refuelReconciliation is omitted from query result', async () => {
    const rowsWithoutRecon = wobRows.map(({ refuelReconciliation: _r, ...row }) => row);
    findMany.mockResolvedValueOnce(rowsWithoutRecon);

    const canonical = await service.listCanonicalEnergyEvents(VEHICLE_ID, {}, testEnv);
    const refuels = canonical.filter((event) => event.kind === 'REFUEL');
    expect(refuels.length).not.toBe(1);
  });
});
