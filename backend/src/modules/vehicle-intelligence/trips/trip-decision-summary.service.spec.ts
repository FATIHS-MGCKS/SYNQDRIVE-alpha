import { TripDecisionSummaryService } from './trip-decision-summary.service';

describe('TripDecisionSummaryService', () => {
  const assessabilityService = {
    findByTrip: jest.fn().mockResolvedValue([
      { dimension: 'TRIP_BOUNDARY', status: 'ASSESSABLE' },
      { dimension: 'ROUTE', status: 'ASSESSABLE' },
      { dimension: 'NATIVE_BEHAVIOR', status: 'ASSESSABLE' },
      { dimension: 'DRIVER_CONDUCT', status: 'ASSESSABLE' },
      { dimension: 'VEHICLE_LOAD', status: 'ASSESSABLE' },
    ]),
  };
    const attributionService = {
    resolveCanonicalForTrip: jest.fn().mockResolvedValue({
      attributionType: 'BOOKING_CUSTOMER_ONLY',
      confidence: 'HIGH',
    }),
  };
  const analysisRunService = {
    resolveOrBeginRun: jest.fn().mockResolvedValue({ run: { id: 'run-1' }, created: true }),
    completeRun: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    vehicleTrip: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'trip-1',
        distanceKm: 20,
        durationMinutes: 30,
        behaviorEnrichmentStatus: 'COMPLETED',
        behaviorSummaryJson: {},
        analysisStagesJson: { misuse: 'done' },
        tripAnalysisStatus: 'COMPLETED',
        drivingImpactStatus: 'READY',
        hardBrakingEvents: 1,
        hardAccelerationEvents: 0,
        isPrivateTrip: false,
      }),
    },
    tripDrivingImpact: {
      findUnique: jest.fn().mockResolvedValue({
        drivingStressScore: 42,
        hardBrakePer100Km: 2,
        hardAccelPer100Km: 0,
        healthEligibility: 'MEDIUM',
        sourceSummaryJson: { primarySource: 'PROVIDER_CLASSIFIED' },
      }),
    },
    misuseCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    drivingAnalysisRun: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const service = new TripDecisionSummaryService(
    prisma as any,
    assessabilityService as any,
    attributionService as any,
    analysisRunService as any,
  );

  it('builds dimensional summary with recommendation', async () => {
    const summary = await service.buildSummary('org-1', 'vehicle-1', 'trip-1');
    expect(summary.dataBasis).toBe('BELASTBAR');
    expect(summary.vehicleLoad?.level).toBe('NORMAL');
    expect(summary.recommendation.level).toBe('KEINE_MASSNAHME');
    expect(summary.attribution.customerChargeable).toBe(true);
  });

  it('marks device quality degraded trips as technical data review', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValueOnce({
      id: 'trip-2',
      distanceKm: 10,
      durationMinutes: 15,
      behaviorEnrichmentStatus: 'COMPLETED',
      behaviorSummaryJson: { deviceQualityWarning: true },
      analysisStagesJson: {},
      tripAnalysisStatus: 'PARTIAL',
      drivingImpactStatus: 'PENDING',
      hardBrakingEvents: 0,
      hardAccelerationEvents: 0,
      isPrivateTrip: false,
    });

    const summary = await service.buildSummary('org-1', 'vehicle-1', 'trip-2');
    expect(summary.dataBasis).toBe('EINGESCHRAENKT');
    expect(summary.recommendation.level).toBe('TECHNISCHE_DATENPRUEFUNG');
    expect(summary.driverConduct?.level).toBe('NICHT_BEWERTBAR');
  });
});
