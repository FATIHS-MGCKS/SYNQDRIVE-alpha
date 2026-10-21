import { EnergyEventConfidence } from '@prisma/client';
import { EnergyEventsService } from './energy-events.service';
import { buildUpsertPayload } from './energy-events.pipeline';
import type { CoalescedEnergySegment } from './energy-events.pipeline';

describe('EnergyEventsService fuel station enrichment firewall', () => {
  const producer = {
    enqueueAfterPersistFromEvent: jest.fn().mockRejectedValue(new Error('redis down')),
  };

  const dimoSegments = {
    fetchFuelLevelSamples: jest.fn().mockResolvedValue([]),
  };

  const metrics = {
    recordRefuelDetected: jest.fn(),
    recordRefuelFuelRiseObservation: jest.fn(),
  };

  const persistedRow = {
    id: 'evt-firewall-1',
    kind: 'REFUEL',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    startLatitude: 52.52,
    startLongitude: 13.405,
  };

  const segment: CoalescedEnergySegment = {
    segmentId: 'dimo-refuel-1',
    mechanism: 'refuel',
    startTime: '2026-08-01T10:00:00.000Z',
    endTime: '2026-08-01T10:05:00.000Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 300,
    startLatitude: 52.52,
    startLongitude: 13.405,
    endLatitude: 52.52,
    endLongitude: 13.405,
    odometerStartKm: 1000,
    odometerEndKm: 1000,
    fuelStartLiters: 10,
    fuelEndLiters: 40,
    fuelDeltaLiters: 30,
    fuelStartPercent: 20,
    fuelEndPercent: 80,
    fuelDeltaPercent: 60,
    socStartPercent: null,
    socEndPercent: null,
    socDeltaPercent: null,
    energyStartKwh: null,
    energyEndKwh: null,
    energyDeltaKwh: null,
    coalescedSegmentId: 'coalesced-1',
    coalescedFromSegmentIds: ['dimo-refuel-1'],
  };

  const prisma = {
    vehicleEnergyEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(persistedRow),
      update: jest.fn(),
    },
  };

  const service = new EnergyEventsService(
    prisma as never,
    dimoSegments as never,
    metrics as never,
    producer as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    producer.enqueueAfterPersistFromEvent.mockRejectedValue(new Error('redis down'));
  });

  it('does not fail persistence when enqueue fails', async () => {
    const result = await (service as unknown as {
      upsertSegment: (
        vehicleId: string,
        tokenId: number,
        seg: CoalescedEnergySegment,
        ctx: { organizationId: string; vehicleId: string; tokenId: number },
      ) => Promise<{ row: typeof persistedRow; wasCreated: boolean }>;
    }).upsertSegment('veh-1', 123, segment, {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tokenId: 123,
    });

    expect(result.wasCreated).toBe(true);
    expect(result.row.id).toBe('evt-firewall-1');
    expect(producer.enqueueAfterPersistFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-firewall-1', kind: 'REFUEL' }),
    );
  });

  it('does not mutate energy event fields via enrichment hook', () => {
    const payload = buildUpsertPayload('veh-1', segment);
    expect(payload.confidence).toBe(EnergyEventConfidence.HIGH);
    expect(payload.startLatitude).toBe(52.52);
    expect(payload.fuelDeltaPercent).toBe(60);
    expect(payload.startTime).toEqual(new Date(segment.startTime));
  });
});
