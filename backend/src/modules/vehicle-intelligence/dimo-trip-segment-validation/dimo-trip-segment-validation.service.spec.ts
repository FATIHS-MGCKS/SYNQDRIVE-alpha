import { DimoTripSegmentValidationService } from './dimo-trip-segment-validation.service';
import { DrivingIntelligenceV2Config } from '../driving-intelligence-v2/driving-intelligence-v2.config';
import type {
  MechanismSegmentValidationResult,
  TripBoundarySnapshot,
} from './dimo-trip-segment-validation.types';

describe('DimoTripSegmentValidationService', () => {
  const tripRow = {
    id: 'trip-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-seg-42-1700000000000',
    tripSource: 'V2_LIVE',
    startTime: new Date('2026-07-16T10:00:00.000Z'),
    endTime: new Date('2026-07-16T10:30:00.000Z'),
    durationMinutes: 30,
    distanceKm: 18.5,
    tripStatus: 'COMPLETED' as const,
  };

  function createService(options: {
    enabled?: boolean;
    vehicleTripUpdate?: jest.Mock;
  }) {
    const vehicleTripUpdate = options.vehicleTripUpdate ?? jest.fn();
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(tripRow),
        update: vehicleTripUpdate,
      },
    };
    const dimoSegments = {
      fetchTripSegmentsForMechanism: jest.fn().mockResolvedValue({
        segments: [
          {
            segmentId: 'dimo-seg-42-1700000000000',
            mechanism: 'changePointDetection',
            startTime: '2026-07-16T10:00:30.000Z',
            endTime: '2026-07-16T10:29:45.000Z',
            isOngoing: false,
            startedBeforeRange: false,
            durationSeconds: 1755,
            startLatitude: 48.1,
            startLongitude: 11.5,
            endLatitude: 48.2,
            endLongitude: 11.6,
            odometerStartKm: 1000,
            odometerEndKm: 1018.5,
            distanceKm: 18.4,
            maxSpeedKmh: 95,
          },
        ],
        providerError: null,
      }),
    };
    const evidence = { record: jest.fn().mockResolvedValue({ row: {}, created: true }) };
    const v2Config = {
      isDimoSegmentValidationEnabled: () => options.enabled ?? true,
    } as DrivingIntelligenceV2Config;

    const service = new DimoTripSegmentValidationService(
      prisma as any,
      dimoSegments as any,
      evidence as any,
      v2Config,
    );

    return { service, prisma, dimoSegments, evidence, vehicleTripUpdate };
  }

  it('skips validation when feature flag is off', async () => {
    const { service, evidence } = createService({ enabled: false });
    const result = await service.validateCompletedTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      dimoTokenId: 42,
    });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('DIMO_SEGMENT_VALIDATION_DISABLED');
    expect(evidence.record).not.toHaveBeenCalled();
  });

  it('persists diagnostic evidence without mutating trip boundaries', async () => {
    const vehicleTripUpdate = jest.fn();
    const { service, evidence, vehicleTripUpdate: updateMock } = createService({
      enabled: true,
      vehicleTripUpdate,
    });

    const before: TripBoundarySnapshot = {
      tripId: tripRow.id,
      vehicleId: tripRow.vehicleId,
      dimoSegmentId: tripRow.dimoSegmentId,
      tripSource: tripRow.tripSource,
      startTime: new Date(tripRow.startTime),
      endTime: new Date(tripRow.endTime!),
      durationMinutes: tripRow.durationMinutes,
      distanceKm: tripRow.distanceKm,
    };

    const result = await service.validateCompletedTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      dimoTokenId: 42,
    });

    expect(result.skipped).toBe(false);
    expect(result.overallStatus).toBe('MATCHED');
    expect(evidence.record).toHaveBeenCalledTimes(1);
    expect(evidence.record.mock.calls[0][0].sourceType).toBe('CONTEXT_SIGNAL');
    expect(evidence.record.mock.calls[0][0].dimension).toBe('ASSESSABILITY');
    expect(updateMock).not.toHaveBeenCalled();

    expect(result.trip.startTime.getTime()).toBe(before.startTime.getTime());
    expect(result.trip.endTime?.getTime()).toBe(before.endTime?.getTime());
    expect(result.trip.dimoSegmentId).toBe(before.dimoSegmentId);
    expect(result.trip.distanceKm).toBe(before.distanceKm);
  });

  it('records PROVIDER_ERROR diagnostically when token is missing', async () => {
    const { service, evidence } = createService({ enabled: true });
    const result = await service.validateCompletedTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      dimoTokenId: null,
    });
    expect(result.overallStatus).toBe('PROVIDER_ERROR');
    expect(evidence.record).toHaveBeenCalled();
    expect(result.mechanisms.every((m: MechanismSegmentValidationResult) => m.status === 'PROVIDER_ERROR')).toBe(true);
  });
});
