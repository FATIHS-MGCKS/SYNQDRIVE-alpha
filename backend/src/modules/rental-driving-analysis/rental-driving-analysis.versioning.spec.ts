import { BookingStatus, DrivingAnalysisMaturity } from '@prisma/client';
import { RentalDrivingAnalysisService } from './rental-driving-analysis.service';
import { RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION } from './rental-driving-analysis.versioning';

function makeService(deps: {
  prisma: Record<string, any>;
  tripsService?: Record<string, any>;
  dtcService?: Record<string, any>;
  driverScoreService?: Record<string, any>;
  tripAttributionService?: Record<string, any>;
}) {
  return new RentalDrivingAnalysisService(
    deps.prisma as any,
    (deps.tripsService ?? { findByVehicle: jest.fn().mockResolvedValue([]) }) as any,
    (deps.dtcService ?? { findByVehicle: jest.fn().mockResolvedValue([]) }) as any,
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
    (deps.tripAttributionService ??
      { resolveAttributionForTrip: jest.fn() }) as any,
  );
}

const completedBooking = {
  id: 'booking-1',
  organizationId: 'org-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  assignedDriverId: null,
  status: BookingStatus.COMPLETED,
  startDate: new Date('2026-07-01T08:00:00.000Z'),
  endDate: new Date('2026-07-05T18:00:00.000Z'),
  customer: { customerType: 'PRIVATE' },
  vehicle: { id: 'vehicle-1' },
  assignedDriver: null,
};

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

function basePrismaMocks() {
  return {
    drivingIntelligenceJob: { count: jest.fn().mockResolvedValue(0) },
    driverAttribution: {
      findMany: jest.fn().mockResolvedValue(
        assignedTrips.map((trip) => ({ tripId: trip.id })),
      ),
    },
    drivingAnalysisRun: {
      findMany: jest.fn().mockResolvedValue(
        assignedTrips.map((trip) => ({
          tripId: trip.id,
          status: 'COMPLETED',
          startedAt: new Date('2026-07-01T09:00:00.000Z'),
        })),
      ),
    },
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
  };
}

describe('RentalDrivingAnalysisService versioning (P59)', () => {
  it('returns existing row when fingerprint matches (idempotent)', async () => {
    const prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(completedBooking) },
      ...basePrismaMocks(),
      rentalDrivingAnalysis: {
        findFirst: jest.fn().mockImplementation(async (args: any) => {
          if (args?.where?.inputFingerprint) {
            return {
              id: 'analysis-1',
              bookingId: 'booking-1',
              calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
              inputFingerprint: args.where.inputFingerprint,
              supersededAt: null,
            };
          }
          return null;
        }),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = makeService({ prisma });
    const result = await service.generateForBooking('org-1', 'booking-1');

    expect(result?.id).toBe('analysis-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('supersedes current row and creates a new analysis when inputs change', async () => {
    const current = {
      id: 'analysis-old',
      bookingId: 'booking-1',
      calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
      inputFingerprint: 'old-fingerprint',
      stabilityStatus: 'PROVISIONAL',
      supersededAt: null,
    };
    const created = {
      id: 'analysis-new',
      bookingId: 'booking-1',
      supersedesAnalysisId: 'analysis-old',
    };

    const prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(completedBooking) },
      ...basePrismaMocks(),
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
            update: jest.fn().mockResolvedValue({ ...current, supersededAt: new Date() }),
            create: jest.fn().mockResolvedValue(created),
          },
        }),
      ),
    };

    const service = makeService({ prisma });
    const result = await service.generateForBooking('org-1', 'booking-1', {
      recomputeReason: 'ATTRIBUTION_CHANGED',
    });

    expect(result).toEqual(created);
  });

  it('findCurrentByBookingId returns only non-superseded analysis', async () => {
    const current = { id: 'analysis-current', supersededAt: null };
    const prisma = {
      rentalDrivingAnalysis: {
        findFirst: jest.fn().mockResolvedValue(current),
      },
    };
    const service = makeService({ prisma });

    const result = await service.findCurrentByBookingId('org-1', 'booking-1');

    expect(result).toBe(current);
    expect(prisma.rentalDrivingAnalysis.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', bookingId: 'booking-1', supersededAt: null },
      orderBy: { generatedAt: 'desc' },
    });
  });
});
