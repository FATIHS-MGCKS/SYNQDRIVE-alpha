import { Injectable } from '@nestjs/common';
import { BookingStatus, TripAssignmentStatus, TripAssignmentSubjectType, TripBookingLinkSource, TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripsService } from '../vehicle-intelligence/trips/trips.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import {
  AggregationRow,
  DataConfidence,
  DriverScoreService,
} from '../vehicle-intelligence/trips/driver-score.service';
import { TripAttributionService } from '../vehicle-intelligence/trips/trip-attribution.service';
import type { StressLevel } from '../vehicle-intelligence/driving-impact/stress-level.util';
import type { RentalDrivingAnalysisPayload } from './rental-driving-analysis.types';
import {
  readCanonicalDrivingStressFromRentalPayload,
} from '../vehicle-intelligence/driving-impact/legacy-score-mirror';
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

type ImpactStressRow = {
  drivingStressScore: number | null;
  longitudinalStressScore: number | null;
  brakingStressScore: number | null;
  stopGoStressScore: number | null;
  highSpeedStressScore: number | null;
  thermalBrakeStressScore: number | null;
  distanceKm: number;
};

@Injectable()
export class RentalDrivingAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly dtcService: DtcService,
    private readonly driverScoreService: DriverScoreService,
    private readonly tripAttributionService: TripAttributionService,
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

    const [assignedTrips, dtcList] = await Promise.all([
      this.prisma.vehicleTrip.findMany({
        where: {
          assignedBookingId: bookingId,
          bookingLinkSource: TripBookingLinkSource.EXPLICIT,
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
    let hintTrips: Array<{ id: string; attributionReason: string }> = [];
    let analysisSource: AnalysisSource = 'booking_assignment';

    if (assignedTrips.length === 0) {
      const fallbackTrips = await this.tripsService.findByVehicle(vehicleId, {
        from: periodStart,
        to: periodEnd,
        limit: 200,
      });
      const eligible: TripForAnalysis[] = [];
      for (const rawTrip of fallbackTrips as Array<TripForAnalysis & {
        isPrivateTrip?: boolean;
        assignmentStatus?: string | null;
        assignedBookingId?: string | null;
        assignmentSubjectId?: string | null;
        bookingLinkSource?: 'EXPLICIT' | 'TIME_WINDOW' | null;
        vehicleId?: string;
        startTime?: Date;
        endTime?: Date | null;
      }>) {
        const attribution = await this.tripAttributionService.resolveAttributionForTrip({
          isPrivateTrip: rawTrip.isPrivateTrip === true,
          assignmentStatus: (rawTrip.assignmentStatus as TripAssignmentStatus | null) ?? null,
          assignedBookingId: rawTrip.assignedBookingId ?? null,
          assignmentSubjectId: rawTrip.assignmentSubjectId ?? null,
          bookingLinkSource: rawTrip.bookingLinkSource ?? null,
          vehicleId,
          startTime: rawTrip.startTime ?? periodStart,
          endTime: rawTrip.endTime ?? null,
        });
        if (attribution.scope === 'PRIVATE' || attribution.scope === 'UNASSIGNED') {
          continue;
        }
        if (attribution.scope === 'BOOKING_TIME_WINDOW_MATCH') {
          if (attribution.bookingId === bookingId) {
            hintTrips.push({
              id: rawTrip.id,
              attributionReason: attribution.reason,
            });
          }
          continue;
        }
        if (attribution.scope === 'BOOKING_ASSIGNED' && attribution.bookingId === bookingId) {
          eligible.push(rawTrip);
        }
      }
      tripsInRange = eligible;
      analysisSource =
        eligible.length > 0
          ? 'booking_assignment'
          : hintTrips.length > 0
            ? 'time_window_fallback'
            : 'none';
    }

    const tripsWithMetrics = tripsInRange as Array<TripForAnalysis>;
    const tripIds = tripsWithMetrics.map((trip) => trip.id);
    const impactRows = tripIds.length
      ? await this.prisma.tripDrivingImpact.findMany({
          where: { tripId: { in: tripIds } },
          select: {
            tripId: true,
            drivingStressScore: true,
            longitudinalStressScore: true,
            brakingStressScore: true,
            stopGoStressScore: true,
            highSpeedStressScore: true,
            thermalBrakeStressScore: true,
            distanceKm: true,
          },
        })
      : [];
    const impactMap = new Map(
      impactRows.map((row) => [
        row.tripId,
        {
          drivingStressScore: row.drivingStressScore,
          longitudinalStressScore: row.longitudinalStressScore,
          brakingStressScore: row.brakingStressScore,
          stopGoStressScore: row.stopGoStressScore,
          highSpeedStressScore: row.highSpeedStressScore,
          thermalBrakeStressScore: row.thermalBrakeStressScore,
          distanceKm: row.distanceKm ?? 0,
        } satisfies ImpactStressRow,
      ]),
    );

    const aggregationRows: AggregationRow[] = tripsWithMetrics.map((trip) => {
      const impact = impactMap.get(trip.id);
      return {
        drivingStressScore: impact?.drivingStressScore ?? null,
        distanceKm: impact?.distanceKm ?? trip.distanceKm ?? 0,
      };
    });
    const aggregate = this.driverScoreService.aggregateRows(
      TripAssignmentSubjectType.BOOKING_CUSTOMER,
      bookingId,
      aggregationRows,
    );

    const componentStress = this.aggregateComponentStress(
      tripsWithMetrics
        .map((t) => impactMap.get(t.id))
        .filter((r): r is ImpactStressRow => r != null),
    );

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
    const tripsWithShare = tripsInRange as Array<{
      citySharePercent?: number | null;
      highwaySharePercent?: number | null;
      countrySharePercent?: number | null;
    }>;
    if (tripsWithShare.length > 0) {
      const withCity = tripsWithShare.filter((t) => t.citySharePercent != null);
      const withHighway = tripsWithShare.filter((t) => t.highwaySharePercent != null);
      const withCountry = tripsWithShare.filter((t) => t.countrySharePercent != null);
      if (withCity.length) cityPct = Math.round(withCity.reduce((s, t) => s + (t.citySharePercent ?? 0), 0) / withCity.length);
      if (withHighway.length) highwayPct = Math.round(withHighway.reduce((s, t) => s + (t.highwaySharePercent ?? 0), 0) / withHighway.length);
      if (withCountry.length) countryPct = Math.round(withCountry.reduce((s, t) => s + (t.countrySharePercent ?? 0), 0) / withCountry.length);
    }

    const avgTripKm =
      tripsWithMetrics.length > 0
        ? tripsWithMetrics.reduce((s, t) => s + (t.distanceKm ?? 0), 0) / tripsWithMetrics.length
        : 0;
    const tripType =
      avgTripKm < 20 ? 'mostly_short_distance' : avgTripKm >= 50 ? 'mostly_long_distance' : 'mixed';

    const payload = this.generatePayload({
      bookingId,
      vehicleId,
      driverId,
      periodStart,
      periodEnd,
      drivingStressScore: aggregate.drivingStressScore,
      stressLevel: aggregate.stressLevel,
      componentStress,
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
      scoredTripCount: aggregate.scoredTripCount,
      totalDistanceKm: aggregate.totalDistanceKm,
      aggregateConfidence: aggregate.dataConfidence,
      attributionHints: hintTrips,
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
        driverStyleCategory: payload.vehicleStressSummary.stressLevel ?? 'unknown',
        riskLevel: payload.overallAssessment.level,
        drivingScore: payload.vehicleStressSummary.drivingStressScore,
        drivingEventsCount: payload.eventSummary.drivingEventsCount ?? undefined,
        abuseDetectionCount: payload.eventSummary.abuseDetectionCount ?? undefined,
        wearImpact: payload.wearImpactAssessment.overallWearImpact,
      },
    });
    return record;
  }

  private aggregateComponentStress(rows: ImpactStressRow[]): {
    longitudinalStressScore: number | null;
    brakingStressScore: number | null;
    stopGoStressScore: number | null;
    highSpeedStressScore: number | null;
    thermalBrakeStressScore: number | null;
  } {
    const wavg = (pick: (r: ImpactStressRow) => number | null) => {
      const valid = rows.filter((r) => pick(r) != null && r.distanceKm > 0);
      if (valid.length === 0) return null;
      const totalKm = valid.reduce((s, r) => s + r.distanceKm, 0);
      if (totalKm <= 0) return null;
      const sum = valid.reduce((s, r) => s + (pick(r) as number) * (r.distanceKm / totalKm), 0);
      return Math.round(sum * 100) / 100;
    };
    return {
      longitudinalStressScore: wavg((r) => r.longitudinalStressScore),
      brakingStressScore: wavg((r) => r.brakingStressScore),
      stopGoStressScore: wavg((r) => r.stopGoStressScore),
      highSpeedStressScore: wavg((r) => r.highSpeedStressScore),
      thermalBrakeStressScore: wavg((r) => r.thermalBrakeStressScore),
    };
  }

  private generatePayload(ctx: {
    bookingId: string;
    vehicleId: string;
    driverId: string;
    periodStart: Date;
    periodEnd: Date;
    drivingStressScore: number | null;
    stressLevel: StressLevel | null;
    componentStress: {
      longitudinalStressScore: number | null;
      brakingStressScore: number | null;
      stopGoStressScore: number | null;
      highSpeedStressScore: number | null;
      thermalBrakeStressScore: number | null;
    };
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
    totalDistanceKm: number;
    aggregateConfidence: DataConfidence;
    attributionHints?: Array<{ id: string; attributionReason: string }>;
  }): RentalDrivingAnalysisPayload {
    const stress = ctx.drivingStressScore;
    const level = this.stressToOverallLevel(ctx.stressLevel, ctx.harshBraking, ctx.harshAcceleration);
    const wearImpact =
      (stress != null && stress >= 75) || ctx.harshBraking + ctx.harshAcceleration > 40
        ? 'high'
        : (stress != null && stress >= 50) || ctx.harshBraking + ctx.harshAcceleration > 15
          ? 'medium'
          : 'low';

    const watchpoints: string[] = [];
    const recommendations: string[] = [];

    if (ctx.analysisSource === 'time_window_fallback') {
      watchpoints.push(
        'Einige Fahrten wurden nur über das Buchungszeitfenster gefunden — keine bestätigte Buchungszuordnung.',
      );
    }
    if ((ctx.attributionHints?.length ?? 0) > 0) {
      watchpoints.push(
        `${ctx.attributionHints!.length} Fahrt(en) nur als Zeitfenster-Hinweis erkannt — nicht in die Bewertung einbezogen.`,
      );
    }

    if (stress != null && stress >= 51) {
      watchpoints.push(`Elevated vehicle stress (${stress}) during rental period.`);
    }
    if (ctx.componentStress.brakingStressScore != null && ctx.componentStress.brakingStressScore >= 60) {
      watchpoints.push('High braking stress — inspect brake condition after rental.');
    }
    if (ctx.componentStress.longitudinalStressScore != null && ctx.componentStress.longitudinalStressScore >= 60) {
      watchpoints.push('High longitudinal/drivetrain stress detected.');
    }
    if (ctx.harshBraking > 10) watchpoints.push('Elevated harsh braking events recorded.');
    if (ctx.harshAcceleration > 10) watchpoints.push('Elevated harsh acceleration events recorded.');
    if (ctx.errorCodeOccurred) watchpoints.push('At least one error code was recorded during the rental period.');

    if (wearImpact === 'high' || ctx.harshBraking > 15) {
      recommendations.push('Inspect brake condition after this rental.');
    }
    if (stress != null && stress >= 76) {
      recommendations.push('Review tire wear — high overall vehicle stress.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Continue standard post-rental checks.');
    }

    const aggregateConfidence: 'low' | 'medium' | 'high' =
      ctx.aggregateConfidence === 'none' ? 'low' : ctx.aggregateConfidence;
    const dataConfidence: 'low' | 'medium' | 'high' =
      ctx.analysisSource === 'none'
        ? 'low'
        : ctx.analysisSource === 'time_window_fallback'
          ? 'low'
          : aggregateConfidence;

    const stressSummary = ctx.stressLevel
      ? `Vehicle stress classified as ${ctx.stressLevel} for the rental period.`
      : 'Insufficient scored trips to determine vehicle stress level.';

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
        totalDistanceKm: ctx.totalDistanceKm,
      },
      overallAssessment: {
        level,
        title: this.levelTitle(level),
        shortSummary: stressSummary,
      },
      vehicleStressSummary: {
        drivingStressScore: ctx.drivingStressScore,
        stressLevel: ctx.stressLevel,
        ...ctx.componentStress,
        summary: stressSummary,
      },
      usagePattern: {
        tripType: ctx.tripType,
        roadDistribution: {
          cityPercent: ctx.cityPct,
          highwayPercent: ctx.highwayPct,
          countryRoadPercent: ctx.countryPct,
        },
        temperatureContext: { avgTemperatureC: null, climateNote: '' },
      },
      eventSummary: {
        drivingEventsCount: ctx.drivingEventsCount,
        abuseDetectionCount: ctx.abuseDetectionCount,
        errorCodeOccurred: ctx.errorCodeOccurred,
        eventHighlights: watchpoints.slice(0, 5),
        attributionHints: ctx.attributionHints ?? [],
      },
      wearImpactAssessment: {
        overallWearImpact: wearImpact as 'low' | 'medium' | 'medium_to_high' | 'high',
        summary:
          wearImpact === 'high'
            ? 'Elevated wear impact from stress and harsh events.'
            : wearImpact === 'medium'
              ? 'Moderate wear impact.'
              : 'Low wear impact.',
        affectedAreas:
          ctx.harshBraking > 10 || (ctx.componentStress.brakingStressScore ?? 0) >= 55
            ? [
                {
                  area: 'brakes' as const,
                  impact: ctx.harshBraking > 20 ? ('high' as const) : ('medium' as const),
                  reason: 'Braking stress and harsh brake events',
                },
              ]
            : [],
      },
      watchpoints,
      recommendations,
    };
  }

  private stressToOverallLevel(
    stressLevel: StressLevel | null,
    harshBraking: number,
    harshAccel: number,
  ): RentalDrivingAnalysisPayload['overallAssessment']['level'] {
    if (stressLevel === 'critical' || harshBraking + harshAccel > 40) return 'high_stress';
    if (stressLevel === 'high' || harshBraking + harshAccel > 25) return 'elevated_stress';
    if (stressLevel === 'moderate') return 'moderate_stress';
    return 'low_stress';
  }

  private levelTitle(
    level: RentalDrivingAnalysisPayload['overallAssessment']['level'],
  ): string {
    switch (level) {
      case 'high_stress':
        return 'High vehicle stress';
      case 'elevated_stress':
        return 'Elevated vehicle stress';
      case 'moderate_stress':
        return 'Moderate vehicle stress';
      default:
        return 'Low vehicle stress';
    }
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
      drivingStressScore: readCanonicalDrivingStressFromRentalPayload(r.payload),
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
