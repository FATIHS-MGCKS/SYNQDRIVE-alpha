import { Injectable } from '@nestjs/common';
import { BookingStatus, TripAssignmentSubjectType, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripsService } from '../vehicle-intelligence/trips/trips.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import {
  AggregationRow,
  DataConfidence,
  DriverScoreService,
} from '../vehicle-intelligence/trips/driver-score.service';
import type { RentalDrivingAnalysisPayload } from './rental-driving-analysis.types';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';

type TripForAnalysis = {
  id: string;
  distanceKm?: number | null;
  citySharePercent?: number | null;
  highwaySharePercent?: number | null;
  countrySharePercent?: number | null;
  drivingScore?: number | null;
  totalAccelerationEvents?: number | null;
  totalBrakingEvents?: number | null;
  hardAccelerationEvents?: number | null;
  hardBrakingEvents?: number | null;
  abuseEvents?: number | null;
};

type AnalysisSource = NonNullable<
  RentalDrivingAnalysisPayload['analysisMeta']['analysisSource']
>;

@Injectable()
export class RentalDrivingAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly dtcService: DtcService,
    private readonly driverScoreService: DriverScoreService,
  ) {}

  async generateForBooking(orgId: string, bookingId: string) {
    const existing = await this.prisma.rentalDrivingAnalysis.findUnique({
      where: { bookingId },
    });
    if (existing) return existing;

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: { vehicle: true, customer: true },
    });
    if (!booking || booking.status !== BookingStatus.COMPLETED) return null;

    const periodStart = booking.startDate;
    const periodEnd = booking.endDate;
    const vehicleId = booking.vehicleId;
    const driverId = booking.customerId;

    // V4.6.83 — Primary selector: trips that TripAssignmentService resolved
    // onto THIS booking (VehicleTrip.assignedBookingId = bookingId). This is
    // the authoritative match and avoids pulling trips that happened inside
    // the same calendar window but were actually assigned to another booking
    // or a private period.
    //
    // Only if no assigned trips exist yet (legacy bookings, replay of an old
    // rental, reconciliation not caught up), we fall back to a vehicle + time
    // window query and flag the result as low-confidence.
    const [assignedTrips, dtcList] = await Promise.all([
      this.prisma.vehicleTrip.findMany({
        where: {
          assignedBookingId: bookingId,
          isPrivateTrip: false,
          tripStatus: TripStatus.COMPLETED,
        },
        orderBy: { startTime: 'desc' },
        take: 200,
      }),
      this.dtcService.findByVehicle(vehicleId).then((list) =>
        (Array.isArray(list) ? list : []).filter((e: { firstSeenAt: Date; lastSeenAt: Date }) => {
          const first = new Date(e.firstSeenAt).getTime();
          const last = new Date(e.lastSeenAt).getTime();
          const start = periodStart.getTime();
          const end = periodEnd.getTime();
          return first <= end && last >= start;
        }),
      ),
    ]);

    let tripsInRange: unknown[] = assignedTrips;
    let analysisSource: AnalysisSource = 'booking_assignment';

    if (assignedTrips.length === 0) {
      const fallbackTrips = await this.tripsService.findByVehicle(vehicleId, {
        from: periodStart,
        to: periodEnd,
        limit: 200,
      });
      tripsInRange = fallbackTrips;
      analysisSource = fallbackTrips.length === 0 ? 'none' : 'time_window_fallback';
    }

    const tripsWithMetrics = tripsInRange as Array<TripForAnalysis>;

    const tripIds = tripsWithMetrics.map((trip) => trip.id);
    const impactRows = tripIds.length
      ? await this.prisma.tripDrivingImpact.findMany({
          where: { tripId: { in: tripIds } },
          select: {
            tripId: true,
            drivingStyleScore: true,
            safetyScore: true,
            distanceKm: true,
          },
        })
      : [];
    const impactMap = new Map(
      impactRows.map((row) => [
        row.tripId,
        {
          drivingStyleScore: row.drivingStyleScore,
          safetyScore: row.safetyScore,
          distanceKm: row.distanceKm ?? 0,
        },
      ]),
    );

    const periodDistance = tripsWithMetrics.reduce((s, t) => s + (t.distanceKm ?? 0), 0);
    const periodTrips = tripsWithMetrics.length;

    // V4.6.95 — booking aggregation now goes through `DriverScoreService`'s
    // unified helper. Distance-weighted average + null-aware per-metric
    // aggregation matches the per-driver / per-customer path so the same
    // trip set produces the same numeric scores no matter which surface
    // reads them. Legacy trips without an impact row fall back to
    // `trip.drivingScore` for drivingStyleScore (compat-mirror only); they
    // never contribute a fake safetyScore because no impact ⇒ no safety
    // signal.
    const aggregationRows: AggregationRow[] = tripsWithMetrics.map((trip) => {
      const impact = impactMap.get(trip.id);
      return {
        drivingStyleScore:
          impact?.drivingStyleScore ?? trip.drivingScore ?? null,
        safetyScore: impact?.safetyScore ?? null,
        distanceKm: impact?.distanceKm ?? trip.distanceKm ?? 0,
      };
    });
    const aggregate = this.driverScoreService.aggregateRows(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
      bookingId,
      aggregationRows,
    );
    const drivingStyleScore = aggregate.drivingStyleScore;
    const safetyScore = aggregate.safetyScore;

    const eventsCount = tripsWithMetrics.reduce(
      (sum, trip) => sum + (trip.totalAccelerationEvents ?? 0) + (trip.totalBrakingEvents ?? 0),
      0,
    );
    const harshBraking = tripsWithMetrics.reduce((sum, trip) => sum + (trip.hardBrakingEvents ?? 0), 0);
    const harshAccel = tripsWithMetrics.reduce((sum, trip) => sum + (trip.hardAccelerationEvents ?? 0), 0);
    const abuseCount = tripsWithMetrics.reduce((sum, trip) => sum + (trip.abuseEvents ?? 0), 0);

    let cityPct = 0;
    let highwayPct = 0;
    let countryPct = 0;
    const tripsWithShare = tripsInRange as Array<{ citySharePercent?: number | null; highwaySharePercent?: number | null; countrySharePercent?: number | null }>;
    if (tripsWithShare.length > 0) {
      const withCity = tripsWithShare.filter((t) => t.citySharePercent != null);
      const withHighway = tripsWithShare.filter((t) => t.highwaySharePercent != null);
      const withCountry = tripsWithShare.filter((t) => t.countrySharePercent != null);
      if (withCity.length) cityPct = Math.round(withCity.reduce((s, t) => s + (t.citySharePercent ?? 0), 0) / withCity.length);
      if (withHighway.length) highwayPct = Math.round(withHighway.reduce((s, t) => s + (t.highwaySharePercent ?? 0), 0) / withHighway.length);
      if (withCountry.length) countryPct = Math.round(withCountry.reduce((s, t) => s + (t.countrySharePercent ?? 0), 0) / withCountry.length);
    }

    const avgTripKm = periodTrips > 0 ? periodDistance / periodTrips : 0;
    const tripType = avgTripKm < 20 ? 'mostly_short_distance' : avgTripKm >= 50 ? 'mostly_long_distance' : 'mixed';

    const scoredTripCount = aggregate.scoredTripCount;
    const safetyScoredTripCount = aggregate.safetyScoredTripCount;
    const totalDistanceKm = aggregate.totalDistanceKm;
    const aggregateConfidence = aggregate.dataConfidence;
    const payload = this.generatePayload({
      bookingId,
      vehicleId,
      driverId,
      orgId,
      periodStart,
      periodEnd,
      vehicle: booking.vehicle,
      customer: booking.customer,
      drivingStyleScore,
      safetyScore,
      drivingEventsCount: eventsCount,
      abuseDetectionCount: abuseCount,
      harshBraking,
      harshAcceleration: harshAccel,
      errorCodeOccurred: dtcList.length > 0,
      cityPct,
      highwayPct,
      countryPct,
      tripType,
      analysisSource,
      scoredTripCount,
      safetyScoredTripCount,
      totalDistanceKm,
      aggregateConfidence,
    });

    const record = await this.prisma.rentalDrivingAnalysis.create({
      data: {
        organizationId: orgId,
        bookingId,
        vehicleId,
        driverId,
        periodStart,
        periodEnd,
        payload: payload as object,
        overallLevel: payload.overallAssessment.level,
        driverStyleCategory: payload.driverStyle.category,
        riskLevel: payload.riskAnalysis.level,
        drivingScore:
          payload.drivingBehavior.drivingStyleScore ??
          payload.drivingBehavior.drivingScore,
        drivingEventsCount: payload.eventSummary.drivingEventsCount ?? undefined,
        abuseDetectionCount: payload.eventSummary.abuseDetectionCount ?? undefined,
        wearImpact: payload.wearImpactAssessment.overallWearImpact,
      },
    });
    return record;
  }

  private generatePayload(ctx: {
    bookingId: string;
    vehicleId: string;
    driverId: string;
    orgId: string;
    periodStart: Date;
    periodEnd: Date;
    vehicle: { make: string; model: string; year?: number | null; fuelType?: string | null };
    customer: { firstName: string; lastName: string };
    drivingStyleScore: number | null;
    safetyScore: number | null;
    drivingEventsCount: number;
    abuseDetectionCount: number;
    harshBraking: number;
    harshAcceleration: number;
    errorCodeOccurred: boolean;
    cityPct: number;
    highwayPct: number;
    countryPct: number;
    tripType: 'mostly_short_distance' | 'mostly_long_distance' | 'mixed';
    analysisSource: AnalysisSource;
    scoredTripCount: number;
    safetyScoredTripCount: number;
    totalDistanceKm: number;
    aggregateConfidence: DataConfidence;
  }): RentalDrivingAnalysisPayload {
    const combinedScore = this.computeCombinedScore(ctx.drivingStyleScore, ctx.safetyScore);
    const level = combinedScore != null && combinedScore >= 70 && ctx.harshBraking + ctx.harshAcceleration < 20
      ? 'good'
      : combinedScore != null && combinedScore >= 50 && ctx.harshBraking + ctx.harshAcceleration < 40
        ? 'watch'
        : 'attention';
    const driverCategory = combinedScore != null && combinedScore >= 85 && ctx.harshBraking + ctx.harshAcceleration < 5
      ? 'safe'
      : ctx.harshBraking + ctx.harshAcceleration > 30
        ? 'aggressive'
        : combinedScore != null && combinedScore < 50
          ? 'high_risk'
          : 'balanced';
    const riskLevel =
      combinedScore != null && combinedScore >= 80
        ? 'low'
        : ctx.harshBraking + ctx.harshAcceleration > 25
          ? 'high'
          : 'medium';
    const wearImpact = ctx.harshBraking > 15 || ctx.harshAcceleration > 15 ? (ctx.harshBraking + ctx.harshAcceleration > 40 ? 'high' : 'medium') : 'low';
    const accelLevel = ctx.harshAcceleration > 15 ? 'aggressive' : ctx.harshAcceleration > 5 ? 'moderate' : 'calm';
    const brakeLevel = ctx.harshBraking > 15 ? 'harsh' : ctx.harshBraking > 5 ? 'moderate' : 'calm';

    const positiveSignals: string[] = [];
    const watchpoints: string[] = [];
    const recommendations: string[] = [];
    if (ctx.drivingStyleScore != null && ctx.drivingStyleScore >= 75) {
      positiveSignals.push('Good driving style score for the rental period.');
    }
    if (ctx.safetyScore != null && ctx.safetyScore >= 75) {
      positiveSignals.push('Strong safety score with low speeding risk signals.');
    }
    if (ctx.harshBraking + ctx.harshAcceleration < 10) positiveSignals.push('Few harsh events; smooth driving pattern.');
    if (ctx.harshBraking > 10) watchpoints.push('Elevated harsh braking events — may accelerate brake wear.');
    if (ctx.harshAcceleration > 10) watchpoints.push('Elevated harsh acceleration — consider driver feedback.');
    if (ctx.errorCodeOccurred) watchpoints.push('At least one error code was recorded during the rental period.');
    if (combinedScore != null && combinedScore < 60) {
      recommendations.push('Consider follow-up with driver on style and safety behavior.');
    }
    if (ctx.harshBraking > 15) recommendations.push('Inspect brake condition after this rental.');

    // V4.6.95 — dataConfidence combines two signals:
    //   1. How trips were matched (`analysisSource`). Time-window fallback can
    //      never be "high" — the trip-set isn't authoritative.
    //   2. How many trips actually scored, weighted by total distance. This
    //      comes from the unified DriverScoreService aggregation so booking
    //      analyses use the SAME confidence rules as customer/driver scores.
    // The 'none' bucket from the aggregator collapses to 'low' here because
    // the rental-analysis schema persists only low/medium/high.
    const aggregateConfidence: 'low' | 'medium' | 'high' =
      ctx.aggregateConfidence === 'none' ? 'low' : ctx.aggregateConfidence;
    const dataConfidence: 'low' | 'medium' | 'high' =
      ctx.analysisSource === 'none'
        ? 'low'
        : ctx.analysisSource === 'time_window_fallback'
          ? 'low'
          : aggregateConfidence;

    return {
      analysisMeta: {
        vehicleId: ctx.vehicleId,
        driverId: ctx.driverId,
        rentalPeriodId: ctx.bookingId,
        periodStart: ctx.periodStart.toISOString(),
        periodEnd: ctx.periodEnd.toISOString(),
        dataConfidence,
        analysisSource: ctx.analysisSource,
        scoredTripCount: ctx.scoredTripCount,
        safetyScoredTripCount: ctx.safetyScoredTripCount,
        totalDistanceKm: ctx.totalDistanceKm,
      },
      overallAssessment: {
        level,
        title: level === 'good' ? 'Good overall' : level === 'watch' ? 'Some concerns' : 'Attention recommended',
        shortSummary: level === 'good'
          ? 'Rental period driving behavior is within acceptable range.'
          : level === 'watch'
            ? 'A few events warrant monitoring.'
            : 'Driving behavior and/or events suggest follow-up.',
      },
      driverStyle: {
        category: driverCategory,
        label: driverCategory.replace(/_/g, ' '),
        summary: `Driver style classified as ${driverCategory} based on score and event counts.`,
      },
      riskAnalysis: {
        level: riskLevel as 'low' | 'medium' | 'high',
        summary: riskLevel === 'low' ? 'Low operational risk.' : riskLevel === 'high' ? 'Elevated risk; review recommended.' : 'Moderate risk.',
        keyRisks: watchpoints.slice(0, 3),
      },
      usagePattern: {
        tripType: ctx.tripType,
        roadDistribution: { cityPercent: ctx.cityPct, highwayPercent: ctx.highwayPct, countryRoadPercent: ctx.countryPct },
        temperatureContext: { avgTemperatureC: null, climateNote: '' },
      },
      drivingBehavior: {
        drivingStyleScore: ctx.drivingStyleScore,
        safetyScore: ctx.safetyScore,
        // Compatibility mirror for legacy UI consumers.
        drivingScore: ctx.drivingStyleScore,
        safetyStyle:
          ctx.safetyScore != null && ctx.safetyScore >= 80
            ? 'Safety-oriented'
            : ctx.safetyScore != null && ctx.safetyScore >= 50
              ? 'Mixed'
              : 'Risky tendencies',
        accelerationBehavior: { level: accelLevel as 'calm' | 'moderate' | 'aggressive', summary: `${accelLevel} acceleration pattern.` },
        brakingBehavior: { level: brakeLevel as 'calm' | 'moderate' | 'harsh', summary: `${brakeLevel} braking pattern.` },
      },
      eventSummary: {
        drivingEventsCount: ctx.drivingEventsCount,
        abuseDetectionCount: ctx.abuseDetectionCount,
        errorCodeOccurred: ctx.errorCodeOccurred,
        eventHighlights: watchpoints,
      },
      wearImpactAssessment: {
        overallWearImpact: wearImpact as 'low' | 'medium' | 'medium_to_high' | 'high',
        summary: wearImpact === 'low' ? 'Low wear impact.' : wearImpact === 'high' ? 'Elevated wear impact from harsh events.' : 'Moderate wear impact.',
        affectedAreas: ctx.harshBraking > 10 ? [{ area: 'brakes', impact: ctx.harshBraking > 20 ? 'high' : 'medium', reason: 'Harsh braking events' }] : [],
      },
      positiveSignals: positiveSignals.length ? positiveSignals : ['No major issues detected from event data.'],
      watchpoints,
      recommendations: recommendations.length ? recommendations : ['Continue standard post-rental checks.'],
    };
  }

  private computeCombinedScore(
    drivingStyleScore: number | null,
    safetyScore: number | null,
  ): number | null {
    if (drivingStyleScore == null && safetyScore == null) return null;
    if (drivingStyleScore == null) return safetyScore;
    if (safetyScore == null) return drivingStyleScore;
    return Math.round(((drivingStyleScore + safetyScore) / 2) * 100) / 100;
  }

  async findAll(
    orgId: string,
    params?: PaginationParams & {
      vehicleId?: string;
      driverId?: string;
      bookingId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const where: any = { organizationId: orgId };
    if (params?.vehicleId) where.vehicleId = params.vehicleId;
    if (params?.driverId) where.driverId = params.driverId;
    if (params?.bookingId) where.bookingId = params.bookingId;
    if (params?.from || params?.to) {
      if (params.from) {
        where.periodStart = where.periodStart || {};
        (where.periodStart as any).gte = new Date(params.from);
      }
      if (params.to) {
        where.periodEnd = where.periodEnd || {};
        (where.periodEnd as any).lte = new Date(params.to);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.rentalDrivingAnalysis.findMany({
        where,
        skip,
        take: take ?? 50,
        orderBy: { periodEnd: 'desc' },
        include: {
          vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.rentalDrivingAnalysis.count({ where }),
    ]);

    const items = data.map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      vehicleId: r.vehicleId,
      driverId: r.driverId,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      overallLevel: r.overallLevel,
      driverStyleCategory: r.driverStyleCategory,
      riskLevel: r.riskLevel,
      drivingScore: r.drivingScore,
      drivingEventsCount: r.drivingEventsCount,
      abuseDetectionCount: r.abuseDetectionCount,
      wearImpact: r.wearImpact,
      payload: r.payload,
      vehicle: r.vehicle,
      driver: r.driver,
      createdAt: r.createdAt.toISOString(),
    }));

    return buildPaginatedResult(items, total, params || {});
  }

  async findById(orgId: string, id: string) {
    const r = await this.prisma.rentalDrivingAnalysis.findFirst({
      where: { id, organizationId: orgId },
      include: {
        vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!r) return null;
    return {
      ...r,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  }
}
