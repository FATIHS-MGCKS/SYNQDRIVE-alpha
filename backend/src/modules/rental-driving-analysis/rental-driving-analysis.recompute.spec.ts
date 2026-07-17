import { BookingStatus, DrivingAnalysisMaturity } from '@prisma/client';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION } from './rental-driving-analysis.versioning';

function makeService(deps: {
  prisma: Record<string, any>;
  driverScoreService?: Record<string, any>;
}) {
  return new RentalDrivingAnalysisService(
    deps.prisma as any,
    { findByVehicle: jest.fn().mockResolvedValue([]) } as any,
    { findByVehicle: jest.fn().mockResolvedValue([]) } as any,
    (deps.driverScoreService ??
      {
        aggregateRows: jest.fn().mockReturnValue({
          drivingStressScore: 42,
          stressLevel: 'moderate',
          scoredTripCount: 2,
          totalDistanceKm: 32,
          dataConfidence: 'medium',
        }),
      }) as any,
    { resolveAttributionForTrip: jest.fn() } as any,
  );
}

const activeBooking = {
  id: 'booking-1',
  organizationId: 'org-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  assignedDriverId: null,
  status: BookingStatus.ACTIVE,
  startDate: new Date('2026-07-01T08:00:00.000Z'),
  endDate: new Date('2026-07-05T18:00:00.000Z'),
  customer: { customerType: 'PRIVATE' },
  vehicle: { id: 'vehicle-1' },
  assignedDriver: null,
};

const completedBooking = { ...activeBooking, status: BookingStatus.COMPLETED };

const assignedTrips = [
  {
    id: 'trip-1',
    tripStatus: 'COMPLETED',
    drivingImpactStatus: 'READY',
    tripAnalysisStatus: 'COMPLETED',
    analysisStagesJson: { misuse: 'done', drivingImpact: 'done' },
    behaviorSummaryJson: { analysisAssessability: 'FULL' },
    behaviorEnrichmentStatus: 'COMPLETED',
    qualityStatus: 'OK',
    distanceKm: 12,
    endTime: new Date('2026-07-01T10:00:00.000Z'),
    drivingScore: 30,
    totalAccelerationEvents: 1,
    totalBrakingEvents: 2,
    hardAccelerationEvents: 0,
    hardBrakingEvents: 1,
    abuseEvents: 0,
    citySharePercent: 40,
    highwaySharePercent: 30,
    countrySharePercent: 30,
  },
  {
    id: 'trip-2',
    tripStatus: 'COMPLETED',
    drivingImpactStatus: 'READY',
    tripAnalysisStatus: 'COMPLETED',
    analysisStagesJson: { misuse: 'done', drivingImpact: 'done' },
    behaviorSummaryJson: { analysisAssessability: 'FULL' },
    behaviorEnrichmentStatus: 'COMPLETED',
    qualityStatus: 'OK',
    distanceKm: 20,
    endTime: new Date('2026-07-02T11:00:00.000Z'),
    drivingScore: 45,
    totalAccelerationEvents: 2,
    totalBrakingEvents: 1,
    hardAccelerationEvents: 1,
    hardBrakingEvents: 0,
    abuseEvents: 0,
    citySharePercent: 50,
    highwaySharePercent: 20,
    countrySharePercent: 30,
  },
];

function assessmentTripRow(trip: (typeof assignedTrips)[number]) {
  return {
    id: trip.id,
    tripStatus: trip.tripStatus,
    drivingImpactStatus: trip.drivingImpactStatus,
    tripAnalysisStatus: trip.tripAnalysisStatus,
    analysisStagesJson: trip.analysisStagesJson,
    behaviorSummaryJson: trip.behaviorSummaryJson,
    behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
    qualityStatus: trip.qualityStatus,
  };
}

function withAssessmentPrisma(prisma: Record<string, any>) {
  return {
    ...prisma,
    drivingIntelligenceJob: {
      count: jest.fn().mockResolvedValue(0),
      ...(prisma.drivingIntelligenceJob ?? {}),
    },
    driverAttribution: {
      findMany: jest.fn().mockResolvedValue(
        assignedTrips.map((trip) => ({ tripId: trip.id })),
      ),
      ...(prisma.driverAttribution ?? {}),
    },
    drivingAnalysisRun: {
      findMany: jest.fn().mockResolvedValue(
        assignedTrips.map((trip) => ({
          tripId: trip.id,
          status: 'COMPLETED',
          startedAt: new Date('2026-07-01T09:00:00.000Z'),
        })),
      ),
      ...(prisma.drivingAnalysisRun ?? {}),
    },
  };
}

describe('RentalDrivingAnalysisService recompute (P60)', () => {
  it('creates PROVISIONAL analysis for active booking', async () => {
    const created = { id: 'analysis-prov', stabilityStatus: 'PROVISIONAL' };
    const prisma = withAssessmentPrisma({
      booking: { findFirst: jest.fn().mockResolvedValue(activeBooking) },
      vehicleTrip: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(assignedTrips.map(assessmentTripRow))
          .mockResolvedValueOnce(assignedTrips),
      },
      tripDrivingImpact: {
        findMany: jest.fn().mockResolvedValue(
          assignedTrips.map((trip) => ({
            tripId: trip.id,
            drivingStressScore: trip.drivingScore,
            distanceKm: trip.distanceKm,
            longitudinalStressScore: null,
            brakingStressScore: null,
            stopGoStressScore: null,
            highSpeedStressScore: null,
            thermalBrakeStressScore: null,
          })),
        ),
      },
      rentalDrivingAnalysis: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn(),
          rentalDrivingAnalysis: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
            create: jest.fn().mockResolvedValue(created),
          },
        }),
      ),
    });

    const service = makeService({ prisma });
    const result = await service.recomputeForBooking('org-1', 'booking-1', {
      recomputeReason: 'TRIP_COMPLETED',
    });

    expect(result.status).toBe('created');
    expect((result as any).analysis.stabilityStatus).toBe('PROVISIONAL');
  });

  it('promotes to STABLE when later trip completes on completed booking', async () => {
    const prisma = withAssessmentPrisma({
      booking: { findFirst: jest.fn().mockResolvedValue(completedBooking) },
      vehicleTrip: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(assignedTrips.map(assessmentTripRow))
          .mockResolvedValueOnce(assignedTrips),
      },
      tripDrivingImpact: {
        findMany: jest.fn().mockResolvedValue(
          assignedTrips.map((trip) => ({
            tripId: trip.id,
            drivingStressScore: trip.drivingScore,
            distanceKm: trip.distanceKm,
            longitudinalStressScore: null,
            brakingStressScore: null,
            stopGoStressScore: null,
            highSpeedStressScore: null,
            thermalBrakeStressScore: null,
          })),
        ),
      },
      rentalDrivingAnalysis: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn(),
          rentalDrivingAnalysis: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
            create: jest.fn().mockResolvedValue({
              id: 'analysis-stable',
              stabilityStatus: 'STABLE',
              calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
            }),
          },
        }),
      ),
    });

    const service = makeService({
      prisma,
      driverScoreService: {
        aggregateRows: jest.fn().mockReturnValue({
          drivingStressScore: 42,
          stressLevel: 'moderate',
          scoredTripCount: 3,
          totalDistanceKm: 52,
          dataConfidence: 'high',
        }),
      },
    });
    const result = await service.recomputeForBooking('org-1', 'booking-1', {
      recomputeReason: 'TRIP_ANALYSIS_COMPLETED',
    });

    expect(result.status).toBe('created');
    expect((result as any).analysis.stabilityStatus).toBe('STABLE');
  });

  it('skips parallel recompute when another job is active', async () => {
    const prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(completedBooking) },
      drivingIntelligenceJob: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = makeService({ prisma });

    const result = await service.recomputeForBooking('org-1', 'booking-1');

    expect(result).toEqual({
      status: 'in_progress',
      reason: 'PARALLEL_RECOMPUTE_ACTIVE',
    });
  });

  it('supersedes prior row on model version change', async () => {
    const current = {
      id: 'analysis-old',
      calculationVersion: 'rental-driving-analysis-v0',
      inputFingerprint: 'old-fp',
      stabilityStatus: 'STABLE',
      supersededAt: null,
    };
    const prisma = withAssessmentPrisma({
      booking: { findFirst: jest.fn().mockResolvedValue(completedBooking) },
      vehicleTrip: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(assignedTrips.map(assessmentTripRow))
          .mockResolvedValueOnce(assignedTrips),
      },
      tripDrivingImpact: {
        findMany: jest.fn().mockResolvedValue(
          assignedTrips.map((trip) => ({
            tripId: trip.id,
            drivingStressScore: trip.drivingScore,
            distanceKm: trip.distanceKm,
            longitudinalStressScore: null,
            brakingStressScore: null,
            stopGoStressScore: null,
            highSpeedStressScore: null,
            thermalBrakeStressScore: null,
          })),
        ),
      },
      rentalDrivingAnalysis: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn(),
          rentalDrivingAnalysis: {
            findFirst: jest
              .fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValueOnce(current),
            update: jest.fn().mockResolvedValue({
              ...current,
              supersededAt: new Date(),
              maturity: DrivingAnalysisMaturity.SUPERSEDED,
            }),
            create: jest.fn().mockResolvedValue({
              id: 'analysis-new',
              supersedesAnalysisId: 'analysis-old',
              calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
            }),
          },
        }),
      ),
    });

    const service = makeService({ prisma });
    const result = await service.recomputeForBooking('org-1', 'booking-1', {
      recomputeReason: 'MODEL_VERSION_CHANGED',
      jobId: 'job-1',
    });

    expect(result.status).toBe('created');
    expect((result as any).supersededAnalysisId).toBe('analysis-old');
  });
});
