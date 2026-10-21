import { EnergyEventsService } from './energy-events.service';

const VEHICLE_ID = 'veh-list-enrichment-1';

describe('EnergyEventsService.listEnergyEvents station enrichment loading', () => {
  const enrichmentRow = {
    id: 'enr-list-1',
    energyEventId: 'evt-list-1',
    processingStatus: 'COMPLETED' as const,
    resolutionStatus: 'MATCHED' as const,
    matchConfidence: 'HIGH' as const,
    matchScore: 0.88,
    osmType: 'way',
    osmId: '999',
    stationName: 'Aral',
    brand: 'Aral',
    operator: null,
    address: 'Testweg 2',
    stationLatitude: 50.1,
    stationLongitude: 8.6,
    distanceMeters: 8,
    inputLatitude: 50.1001,
    inputLongitude: 8.6001,
    inputCoordinateSource: 'energy_event_start',
    inputFingerprint: 'fp',
    resolverVersion: 'fuel-station-resolver-v1',
    osmDatasetVersion: 'de-2026-08-30',
    attemptCount: 1,
    lastAttemptAt: new Date('2026-08-31T20:00:00.000Z'),
    resolvedAt: new Date('2026-08-31T20:00:01.000Z'),
    failedAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date('2026-08-31T20:00:00.000Z'),
    updatedAt: new Date('2026-08-31T20:00:01.000Z'),
  };

  const refuelEvent = {
    id: 'evt-list-1',
    vehicleId: VEHICLE_ID,
    dimoSegmentId: 'dimo-list-1',
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: new Date('2026-08-31T20:00:00.000Z'),
    endTime: new Date('2026-08-31T20:05:00.000Z'),
    durationSeconds: 300,
    startLatitude: 50.1001,
    startLongitude: 8.6001,
    endLatitude: 50.1001,
    endLongitude: 8.6001,
    fuelDeltaLiters: 20,
    fuelDeltaPercent: 30,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 5000,
    odometerEndKm: 5000,
    confidence: 'HIGH' as const,
    fuelLevelRiseStart: null,
    fuelLevelRiseEnd: null,
    fuelLevelRiseDurationSeconds: null,
    createdAt: new Date('2026-08-31T20:05:00.000Z'),
    updatedAt: new Date('2026-08-31T20:05:00.000Z'),
    fuelStationEnrichment: enrichmentRow,
  };

  const rechargeEvent = {
    ...refuelEvent,
    id: 'evt-list-2',
    dimoSegmentId: 'dimo-list-2',
    kind: 'RECHARGE' as const,
    detectionMechanism: 'recharge',
    fuelStationEnrichment: null,
  };

  const findMany = jest.fn().mockResolvedValue([refuelEvent, rechargeEvent]);
  const prisma = {
    vehicleEnergyEvent: { findMany },
  };

  const service = new EnergyEventsService(prisma as never, {} as never);

  beforeEach(() => {
    findMany.mockClear();
  });

  it('L. scopes list query to the requested vehicleId (org boundary via existing vehicle access path)', async () => {
    await service.listEnergyEvents(VEHICLE_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vehicleId: VEHICLE_ID }),
      }),
    );
  });

  it('M. loads enrichment via single findMany include (no N+1)', async () => {
    const events = await service.listEnergyEvents(VEHICLE_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { fuelStationEnrichment: true },
      }),
    );
    expect(events).toHaveLength(2);
    expect(events[0].stationEnrichment?.trusted).toBe(true);
    expect(events[0].stationEnrichment?.station?.name).toBe('Aral');
    expect(events[1].stationEnrichment).toBeUndefined();
  });
});
