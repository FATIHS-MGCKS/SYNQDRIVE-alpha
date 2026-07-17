import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  DrivingAnalysisMaturity,
  RentalDrivingAnalysis,
  RentalDrivingAnalysisStability,
  TripAssignmentStatus,
  TripAssignmentSubjectType,
  TripBookingLinkSource,
  TripStatus,
} from '@prisma/client';
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
import type { RentalDrivingNormalizedMetrics } from './rental-driving-analysis.metrics';
import { resolveDrivingAttributionRoles } from '../vehicle-intelligence/trips/driving-attribution-roles/driving-attribution-roles';
import { resolveLegacyDriverIdFilter } from '../vehicle-intelligence/trips/driving-attribution-roles/driving-attribution-roles.compat';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import {
  buildRentalDrivingAnalysisInputFingerprint,
  resolveRentalDrivingAnalysisCompleteness,
} from './rental-driving-analysis.fingerprint';
import { RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION } from './rental-driving-analysis.versioning';
import { resolveRentalDrivingAnalysisStability } from './rental-driving-analysis.stability';
import type {
  RentalDrivingAnalysisRecomputeReason,
  RentalDrivingAnalysisRecomputeResult,
} from './rental-driving-analysis.recompute.types';
import {
  assessRentalDrivingAnalysis,
  buildRentalAssessmentTripSnapshot,
} from './rental-driving-analysis.assessment';
import {
  deriveAnalysisAssessability,
  parseAnalysisStagesJson,
  type AnalysisStageState,
} from '../vehicle-intelligence/trips/trip-analysis-status';
import { readTripDrivingImpactProvenance } from '../vehicle-intelligence/driving-impact/driving-impact-provenance.reader';
import {
  buildRentalTripMetricInput,
  computeRentalDrivingMetrics,
  resolveOverallLevelFromMetrics,
} from './rental-driving-analysis.metrics';
import type {
  RentalDrivingAnalysisPayload,
  RentalDrivingAttributionSummary,
  RentalDrivingAssessmentSummary,
} from './rental-driving-analysis.types';

type TripForAnalysis = {
  id: string;
  distanceKm?: number | null;
  startTime?: Date | null;
  endTime?: Date | null;
  durationMinutes?: number | null;
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

export type GenerateRentalDrivingAnalysisOptions = {
  recomputeReason?: RentalDrivingAnalysisRecomputeReason | string;
  jobId?: string;
};

export type RecomputeRentalDrivingAnalysisOptions = GenerateRentalDrivingAnalysisOptions;

@Injectable()
export class RentalDrivingAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly dtcService: DtcService,
    private readonly driverScoreService: DriverScoreService,
    private readonly tripAttributionService: TripAttributionService,
  ) {}

  /**
   * @deprecated Use {@link recomputeForBooking} — kept for backward-compatible call sites.
   */
  async generateForBooking(
    orgId: string,
    bookingId: string,
    options?: GenerateRentalDrivingAnalysisOptions,
  ) {
    const result = await this.recomputeForBooking(orgId, bookingId, options);
    if (result.status === 'skipped' || result.status === 'in_progress') {
      return null;
    }
    return result.analysis as RentalDrivingAnalysis;
  }

  /**
   * Deterministic rental analysis recompute (P60).
   * Same inputs + calculation version → idempotent.
   * Active bookings → PROVISIONAL; completed + input gate → STABLE.
   */
  async recomputeForBooking(
    orgId: string,
    bookingId: string,
    options?: RecomputeRentalDrivingAnalysisOptions,
  ): Promise<RentalDrivingAnalysisRecomputeResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: {
        vehicle: true,
        customer: true,
        assignedDriver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (
      !booking ||
      (booking.status !== BookingStatus.COMPLETED && booking.status !== BookingStatus.ACTIVE)
    ) {
      return { status: 'skipped', reason: 'BOOKING_NOT_ELIGIBLE' };
    }

    const parallel = await this.hasParallelRecompute(orgId, bookingId, options?.jobId);
    if (parallel) {
      return { status: 'in_progress', reason: 'PARALLEL_RECOMPUTE_ACTIVE' };
    }

    const computed = await this.computeAnalysisContext(orgId, booking);
    const inputFingerprint = buildRentalDrivingAnalysisInputFingerprint({
      organizationId: orgId,
      bookingId,
      vehicleId: booking.vehicleId,
      periodStartIso: booking.startDate.toISOString(),
      periodEndIso: booking.endDate.toISOString(),
      bookingCustomerId: computed.roles.bookingCustomerId!,
      assignedDriverId: computed.roles.assignedDriverId,
      actualDriverId: computed.roles.actualDriverId,
      attributionType: computed.roles.attributionType ?? null,
      analysisSource: computed.analysisSource,
      scoredTripCount: computed.aggregate.scoredTripCount,
      dtcCountInPeriod: computed.dtcCountInPeriod,
      hintTripIds: computed.hintTrips.map((trip) => trip.id),
      trips: computed.tripFingerprints,
      calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
    });

    const stabilityStatus = resolveRentalDrivingAnalysisStability({
      bookingStatus: booking.status,
      analysisCompleteness: computed.analysisCompleteness,
      assignedTripCount: computed.gateSnapshot.assignedTripCount,
      completedAssignedTripCount: computed.gateSnapshot.completedAssignedTripCount,
      tripsWithReadyImpact: computed.gateSnapshot.tripsWithReadyImpact,
      pendingTripAnalysisJobCount: computed.gateSnapshot.pendingTripAnalysisJobCount,
    });

    const assessmentSummary = computed.assessmentSummary;
    const assessmentStatus = assessmentSummary.status;

    const existingExact = await this.prisma.rentalDrivingAnalysis.findFirst({
      where: {
        organizationId: orgId,
        bookingId,
        calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
        inputFingerprint,
        supersededAt: null,
        stabilityStatus,
        assessmentStatus,
      },
    });
    if (existingExact) {
      return { status: 'idempotent', analysis: existingExact };
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;

      const existingInTx = await tx.rentalDrivingAnalysis.findFirst({
        where: {
          organizationId: orgId,
          bookingId,
          calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
          inputFingerprint,
          supersededAt: null,
          stabilityStatus,
          assessmentStatus,
        },
      });
      if (existingInTx) {
        return { status: 'idempotent' as const, analysis: existingInTx };
      }

      const current = await tx.rentalDrivingAnalysis.findFirst({
        where: { organizationId: orgId, bookingId, supersededAt: null },
        orderBy: { generatedAt: 'desc' },
      });

      const needsSupersede =
        current != null &&
        (current.calculationVersion !== RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION ||
          current.inputFingerprint !== inputFingerprint ||
          current.stabilityStatus !== stabilityStatus ||
          current.assessmentStatus !== assessmentStatus);

      let supersedesAnalysisId: string | null = null;
      if (needsSupersede && current) {
        supersedesAnalysisId = current.id;
        await tx.rentalDrivingAnalysis.update({
          where: { id: current.id },
          data: {
            supersededAt: new Date(),
            maturity: DrivingAnalysisMaturity.SUPERSEDED,
          },
        });
      }

      const generatedAt = new Date();
      const recomputeReason = needsSupersede
        ? options?.recomputeReason ?? 'INPUT_OR_MODEL_CHANGED'
        : options?.recomputeReason ?? null;

      const payload = this.generatePayload({
        ...computed.payloadCtx,
        calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
        inputFingerprint,
        generatedAt,
        sourceTripsFinalizedAt: computed.sourceTripsFinalizedAt,
        analysisCompleteness: computed.analysisCompleteness,
        stabilityStatus,
        assessmentStatus,
        assessmentSummary,
        maturity: DrivingAnalysisMaturity.PUBLISHED,
        recomputeReason,
        attributionSummary: computed.attributionSummary,
        normalizedMetrics: computed.normalizedMetrics,
      });

      const record = await tx.rentalDrivingAnalysis.create({
        data: {
          organizationId: orgId,
          bookingId,
          vehicleId: booking.vehicleId,
          bookingCustomerId: computed.roles.bookingCustomerId!,
          assignedDriverId: computed.roles.assignedDriverId,
          actualDriverId: computed.roles.actualDriverId,
          driverId: null,
          periodStart: booking.startDate,
          periodEnd: booking.endDate,
          payload: payload as object,
          overallLevel: payload.overallAssessment.level,
          driverStyleCategory: payload.vehicleStressSummary.stressLevel ?? 'unknown',
          riskLevel: payload.overallAssessment.level,
          drivingScore: payload.vehicleStressSummary.drivingStressScore,
          drivingEventsCount: payload.eventSummary.drivingEventsCount ?? undefined,
          abuseDetectionCount: payload.eventSummary.abuseDetectionCount ?? undefined,
          wearImpact: payload.wearImpactAssessment.overallWearImpact,
          calculationVersion: RENTAL_DRIVING_ANALYSIS_CALCULATION_VERSION,
          inputFingerprint,
          generatedAt,
          sourceTripsFinalizedAt: computed.sourceTripsFinalizedAt,
          analysisCompleteness: computed.analysisCompleteness,
          stabilityStatus,
          assessmentStatus,
          assessmentSummary: assessmentSummary as object,
          maturity: DrivingAnalysisMaturity.PUBLISHED,
          recomputeReason,
          supersedesAnalysisId,
          attributionSummary: computed.attributionSummary as object,
        },
      });

      return {
        status: 'created' as const,
        analysis: record,
        supersededAnalysisId: supersedesAnalysisId,
      };
    });
  }

  private async hasParallelRecompute(
    orgId: string,
    bookingId: string,
    excludeJobId?: string,
  ): Promise<boolean> {
    const count = await this.prisma.drivingIntelligenceJob.count({
      where: {
        organizationId: orgId,
        bookingId,
        jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
        status: { in: ['PENDING', 'ENQUEUED', 'IN_PROGRESS'] },
        ...(excludeJobId ? { NOT: { id: excludeJobId } } : {}),
      },
    });
    return count > 0;
  }

  findCurrentByBookingId(orgId: string, bookingId: string) {
    return this.prisma.rentalDrivingAnalysis.findFirst({
      where: {
        organizationId: orgId,
        bookingId,
        supersededAt: null,
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  private async computeAnalysisContext(
    orgId: string,
    booking: {
      id: string;
      vehicleId: string;
      customerId: string;
      assignedDriverId: string | null;
      startDate: Date;
      endDate: Date;
      status: BookingStatus;
      customer: { customerType: import('@prisma/client').CustomerType };
    },
  ) {
    const periodStart = booking.startDate;
    const periodEnd = booking.endDate;
    const vehicleId = booking.vehicleId;
    const bookingId = booking.id;

    const roles = resolveDrivingAttributionRoles({
      isPrivateTrip: false,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: TripAssignmentSubjectType.BOOKING_CUSTOMER,
      assignmentSubjectId: booking.customerId,
      assignedBookingId: booking.id,
      bookingLinkSource: TripBookingLinkSource.EXPLICIT,
      bookingCustomerId: booking.customerId,
      bookingAssignedDriverId: booking.assignedDriverId,
      bookingCustomerType: booking.customer.customerType,
    });

    const [allAssignedTrips, assignedTrips, dtcList] = await Promise.all([
      this.prisma.vehicleTrip.findMany({
        where: {
          assignedBookingId: bookingId,
          bookingLinkSource: TripBookingLinkSource.EXPLICIT,
          isPrivateTrip: false,
        },
        select: {
          id: true,
          tripStatus: true,
          drivingImpactStatus: true,
          tripAnalysisStatus: true,
          analysisStagesJson: true,
          behaviorSummaryJson: true,
          behaviorEnrichmentStatus: true,
          qualityStatus: true,
        },
      }),
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

    const completedAssignedTripCount = allAssignedTrips.filter(
      (trip) => trip.tripStatus === TripStatus.COMPLETED,
    ).length;
    const tripsWithReadyImpact = allAssignedTrips.filter(
      (trip) =>
        trip.tripStatus === TripStatus.COMPLETED && trip.drivingImpactStatus === 'READY',
    ).length;
    const pendingTripAnalysisJobCount = await this.prisma.drivingIntelligenceJob.count({
      where: {
        organizationId: orgId,
        bookingId,
        tripId: { in: allAssignedTrips.map((trip) => trip.id) },
        status: { in: ['PENDING', 'ENQUEUED', 'IN_PROGRESS'] },
        jobType: {
          in: [
            'DRIVING_NATIVE_EVENTS_INGEST',
            'DRIVING_EVENT_CONTEXT_ENRICH',
            'DRIVING_ROUTE_ENRICH',
            'DRIVING_IMPACT_COMPUTE',
            'DRIVING_MISUSE_RECONCILE',
            'DRIVING_ASSESSABILITY_COMPUTE',
            'DRIVING_ATTRIBUTION_RESOLVE',
          ],
        },
      },
    });
    const pendingRentalRecomputeJobCount = await this.prisma.drivingIntelligenceJob.count({
      where: {
        organizationId: orgId,
        bookingId,
        status: { in: ['PENDING', 'ENQUEUED', 'IN_PROGRESS'] },
        jobType: 'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
      },
    });

    const assignedTripIds = allAssignedTrips.map((trip) => trip.id);
    const [attributionRows, analysisRuns] = await Promise.all([
      assignedTripIds.length
        ? this.prisma.driverAttribution.findMany({
            where: { organizationId: orgId, tripId: { in: assignedTripIds } },
            select: { tripId: true },
            distinct: ['tripId'],
          })
        : Promise.resolve([]),
      assignedTripIds.length
        ? this.prisma.drivingAnalysisRun.findMany({
            where: {
              organizationId: orgId,
              tripId: { in: assignedTripIds },
              analysisType: 'TRIP_ENRICHMENT',
            },
            select: { tripId: true, status: true, startedAt: true },
            orderBy: { startedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);
    const tripsWithAttribution = new Set(attributionRows.map((row) => row.tripId));
    const latestRunByTrip = new Map<string, (typeof analysisRuns)[number]['status']>();
    for (const run of analysisRuns) {
      if (!latestRunByTrip.has(run.tripId)) {
        latestRunByTrip.set(run.tripId, run.status);
      }
    }

    const assessmentTrips = allAssignedTrips.map((trip) => {
      const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
      const assessability = deriveAnalysisAssessability({
        qualityStatus: trip.qualityStatus,
        behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
        behaviorSummaryJson: trip.behaviorSummaryJson,
        tripAnalysisStatus: trip.tripAnalysisStatus,
      });
      return buildRentalAssessmentTripSnapshot({
        tripId: trip.id,
        tripStatus: trip.tripStatus,
        tripAnalysisStatus: trip.tripAnalysisStatus,
        drivingImpactStatus: trip.drivingImpactStatus,
        analysisAssessability: assessability.analysisAssessability,
        analysisRunStatus: latestRunByTrip.get(trip.id) ?? 'MISSING',
        hasAttribution: tripsWithAttribution.has(trip.id),
        misuseStage: stages.misuse as AnalysisStageState | undefined,
      });
    });

    const gateSnapshot = {
      assignedTripCount: allAssignedTrips.length,
      completedAssignedTripCount,
      tripsWithReadyImpact,
      pendingTripAnalysisJobCount,
    };

    let tripsInRange: TripForAnalysis[] = assignedTrips as TripForAnalysis[];
    let hintTrips: Array<{ id: string; attributionReason: string }> = [];
    let analysisSource: AnalysisSource = 'booking_assignment';
    const explicitAssignedTripCount = assignedTrips.length;

    if (assignedTrips.length === 0) {
      const fallbackTrips = await this.tripsService.findByVehicle(orgId, vehicleId, {
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
        assignmentSubjectType?: string | null;
        bookingLinkSource?: 'EXPLICIT' | 'TIME_WINDOW' | null;
        vehicleId?: string;
        startTime?: Date;
        endTime?: Date | null;
      }>) {
        const attribution = await this.tripAttributionService.resolveAttributionForTrip(
          orgId,
          {
            isPrivateTrip: rawTrip.isPrivateTrip === true,
            assignmentStatus: (rawTrip.assignmentStatus as TripAssignmentStatus | null) ?? null,
            assignedBookingId: rawTrip.assignedBookingId ?? null,
            assignmentSubjectId: rawTrip.assignmentSubjectId ?? null,
            assignmentSubjectType: rawTrip.assignmentSubjectType ?? null,
            bookingLinkSource: rawTrip.bookingLinkSource ?? null,
            vehicleId,
            startTime: rawTrip.startTime ?? periodStart,
            endTime: rawTrip.endTime ?? null,
          },
        );
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

    const tripsWithMetrics = tripsInRange;
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
            modelVersion: true,
            sourceSummaryJson: true,
            primarySource: true,
            measuredShare: true,
            providerClassifiedShare: true,
            reconstructedShare: true,
            estimatedProxyShare: true,
            contextOnlyShare: true,
            nativeEventCount: true,
            hfEventCount: true,
            measurementCoverage: true,
            hardwareProfile: true,
            capabilityVersion: true,
            healthEligibility: true,
            provenanceMaturity: true,
            provenanceVersion: true,
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
    const provenanceMap = new Map(
      impactRows.map((row) => [row.tripId, readTripDrivingImpactProvenance(row)]),
    );

    const aggregationRows: AggregationRow[] = tripsWithMetrics.map((trip) => {
      const impact = impactMap.get(trip.id);
      return {
        drivingStressScore:
          impact?.drivingStressScore ?? trip.drivingScore ?? null,
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

    const rentalMetricTrips = tripsWithMetrics.map((trip) => {
      const impact = impactMap.get(trip.id);
      const provenance = provenanceMap.get(trip.id);
      const assessability = deriveAnalysisAssessability({
        behaviorSummaryJson: (trip as { behaviorSummaryJson?: unknown }).behaviorSummaryJson,
        behaviorEnrichmentStatus: (trip as { behaviorEnrichmentStatus?: string | null })
          .behaviorEnrichmentStatus,
        qualityStatus: (trip as { qualityStatus?: string | null }).qualityStatus,
        tripAnalysisStatus: (trip as { tripAnalysisStatus?: string | null }).tripAnalysisStatus,
      });
      return buildRentalTripMetricInput({
        tripId: trip.id,
        distanceKm: impact?.distanceKm ?? trip.distanceKm ?? 0,
        startTime: trip.startTime ?? periodStart,
        endTime: trip.endTime ?? null,
        durationMinutes: trip.durationMinutes ?? null,
        totalAccelerationEvents: trip.totalAccelerationEvents,
        totalBrakingEvents: trip.totalBrakingEvents,
        hardBrakingEvents: trip.hardBrakingEvents,
        hardAccelerationEvents: trip.hardAccelerationEvents,
        abuseEvents: trip.abuseEvents,
        assessability: assessability.analysisAssessability,
        nativeEventCount: provenance?.nativeEventCount,
        hfEventCount: provenance?.hfEventCount,
        estimatedProxyShare: provenance?.estimatedProxyShare,
        vehicleStressScore: impact?.drivingStressScore ?? trip.drivingScore ?? null,
      });
    });
    const normalizedMetrics = computeRentalDrivingMetrics(rentalMetricTrips);

    let cityPct = 0;
    let highwayPct = 0;
    let countryPct = 0;
    if (tripsWithMetrics.length > 0) {
      const withCity = tripsWithMetrics.filter((t) => t.citySharePercent != null);
      const withHighway = tripsWithMetrics.filter((t) => t.highwaySharePercent != null);
      const withCountry = tripsWithMetrics.filter((t) => t.countrySharePercent != null);
      if (withCity.length) cityPct = Math.round(withCity.reduce((s, t) => s + (t.citySharePercent ?? 0), 0) / withCity.length);
      if (withHighway.length) highwayPct = Math.round(withHighway.reduce((s, t) => s + (t.highwaySharePercent ?? 0), 0) / withHighway.length);
      if (withCountry.length) countryPct = Math.round(withCountry.reduce((s, t) => s + (t.countrySharePercent ?? 0), 0) / withCountry.length);
    }

    const avgTripKm =
      tripsWithMetrics.length > 0
        ? tripsWithMetrics.reduce((s, t) => s + (t.distanceKm ?? 0), 0) / tripsWithMetrics.length
        : 0;
    const tripType: 'mostly_short_distance' | 'mostly_long_distance' | 'mixed' =
      avgTripKm < 20 ? 'mostly_short_distance' : avgTripKm >= 50 ? 'mostly_long_distance' : 'mixed';

    const tripFingerprints = tripsWithMetrics.map((trip) => {
      const impact = impactMap.get(trip.id);
      return {
        tripId: trip.id,
        distanceKm: impact?.distanceKm ?? trip.distanceKm ?? 0,
        drivingStressScore: impact?.drivingStressScore ?? trip.drivingScore ?? null,
        endTimeIso: trip.endTime?.toISOString() ?? null,
      };
    });

    const sourceTripsFinalizedAt = tripsWithMetrics.reduce<Date | null>((latest, trip) => {
      if (!trip.endTime) return latest;
      if (!latest || trip.endTime > latest) return trip.endTime;
      return latest;
    }, null);

    const analysisCompleteness = resolveRentalDrivingAnalysisCompleteness({
      analysisSource,
      scoredTripCount: aggregate.scoredTripCount,
      aggregateConfidence: aggregate.dataConfidence,
    });

    const attributionSummary: RentalDrivingAttributionSummary = {
      analysisSource,
      scoredTripCount: aggregate.scoredTripCount,
      hintTripCount: hintTrips.length,
      explicitAssignedTripCount,
      bookingCustomerId: roles.bookingCustomerId,
      assignedDriverId: roles.assignedDriverId,
      actualDriverId: roles.actualDriverId,
      attributionType: roles.attributionType ?? null,
      customerDecisionEligible: roles.customerDecisionEligible,
    };

    const assessmentSummary: RentalDrivingAssessmentSummary = assessRentalDrivingAnalysis({
      bookingStatus: booking.status,
      analysisCompleteness,
      assignedTripCount: gateSnapshot.assignedTripCount,
      pendingCoreJobCount: pendingTripAnalysisJobCount,
      pendingRentalRecomputeJobCount,
      trips: assessmentTrips,
    });

    return {
      roles,
      analysisSource,
      aggregate,
      componentStress,
      eventsCount,
      harshBraking,
      harshAccel,
      abuseCount,
      cityPct,
      highwayPct,
      countryPct,
      tripType,
      hintTrips,
      tripFingerprints,
      sourceTripsFinalizedAt,
      analysisCompleteness,
      attributionSummary,
      assessmentSummary,
      dtcCountInPeriod: dtcList.length,
      gateSnapshot,
      normalizedMetrics,
      payloadCtx: {
        bookingId,
        vehicleId,
        roles,
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
        normalizedMetrics,
      },
    };
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
    roles: ReturnType<typeof resolveDrivingAttributionRoles>;
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
    calculationVersion: string;
    inputFingerprint: string;
    generatedAt: Date;
    sourceTripsFinalizedAt: Date | null;
    analysisCompleteness: import('@prisma/client').RentalDrivingAnalysisCompleteness;
    stabilityStatus: RentalDrivingAnalysisStability;
    assessmentStatus: import('@prisma/client').RentalDrivingAnalysisAssessmentStatus;
    assessmentSummary: RentalDrivingAssessmentSummary;
    maturity: DrivingAnalysisMaturity;
    recomputeReason: string | null;
    attributionSummary: RentalDrivingAttributionSummary;
    normalizedMetrics: RentalDrivingNormalizedMetrics;
  }): RentalDrivingAnalysisPayload {
    const stress = ctx.drivingStressScore;
    const { level, wearImpact } = resolveOverallLevelFromMetrics(ctx.normalizedMetrics);
    const metrics = ctx.normalizedMetrics;

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
    if ((metrics.harshEvents.per100Km.value ?? 0) >= 8) {
      watchpoints.push(
        `Elevated harsh event rate (${metrics.harshEvents.per100Km.value} per 100 km).`,
      );
    }
    if ((metrics.abuseEvents.per100Km.value ?? 0) > 0) {
      watchpoints.push(
        `Abuse indicators detected (${metrics.abuseEvents.per100Km.value} per 100 km).`,
      );
    }
    if (metrics.strongEventClusters.clusterCount > 0) {
      watchpoints.push(
        `${metrics.strongEventClusters.clusterCount} strong event cluster(s) across rental trips.`,
      );
    }
    if ((metrics.repeatedPatterns.patternTripCount ?? 0) >= 2) {
      watchpoints.push('Repeated harsh-event patterns across multiple trips.');
    }
    if ((metrics.evidenceShares.proxyShare.value ?? 0) >= 50) {
      watchpoints.push('Majority of rental distance relies on proxy/reconstructed evidence.');
    }
    if (ctx.errorCodeOccurred) watchpoints.push('At least one error code was recorded during the rental period.');

    if (wearImpact === 'high' || wearImpact === 'medium_to_high') {
      if (ctx.assessmentSummary.allowsStrongCustomerRecommendation) {
        recommendations.push('Inspect brake condition after this rental.');
      } else {
        watchpoints.push('Elevated braking stress — post-rental brake inspection may be warranted once analysis is complete.');
      }
    }
    if (stress != null && stress >= 76) {
      if (ctx.assessmentSummary.allowsStrongCustomerRecommendation) {
        recommendations.push('Review tire wear — high overall vehicle stress.');
      } else {
        watchpoints.push('High overall vehicle stress — tire review recommended once analysis is complete.');
      }
    }
    if (recommendations.length === 0) {
      if (ctx.assessmentSummary.allowsStrongCustomerRecommendation) {
        recommendations.push('Continue standard post-rental checks.');
      } else if (ctx.assessmentStatus === 'NOT_ASSESSABLE') {
        recommendations.push('Insufficient telematics data for a driving assessment — use standard post-rental checks.');
      } else {
        recommendations.push('Preliminary analysis only — await complete trip analysis before operational decisions.');
      }
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
        bookingCustomerId: ctx.roles.bookingCustomerId,
        assignedDriverId: ctx.roles.assignedDriverId,
        actualDriverId: ctx.roles.actualDriverId,
        attributionType: ctx.roles.attributionType,
        customerDecisionEligible: ctx.roles.customerDecisionEligible,
        rentalPeriodId: ctx.bookingId,
        periodStart: ctx.periodStart.toISOString(),
        periodEnd: ctx.periodEnd.toISOString(),
        dataConfidence,
        analysisSource: ctx.analysisSource,
        scoredTripCount: ctx.scoredTripCount,
        totalDistanceKm: ctx.totalDistanceKm,
        calculationVersion: ctx.calculationVersion,
        inputFingerprint: ctx.inputFingerprint,
        generatedAt: ctx.generatedAt.toISOString(),
        sourceTripsFinalizedAt: ctx.sourceTripsFinalizedAt?.toISOString() ?? null,
        analysisCompleteness: ctx.analysisCompleteness,
        stabilityStatus: ctx.stabilityStatus,
        assessmentStatus: ctx.assessmentStatus,
        assessmentSummary: ctx.assessmentSummary,
        maturity: ctx.maturity,
        recomputeReason: ctx.recomputeReason,
        attributionSummary: ctx.attributionSummary,
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
      rentalMetrics: metrics,
      wearImpactAssessment: {
        overallWearImpact: wearImpact,
        summary:
          wearImpact === 'high'
            ? 'Elevated wear impact from normalized vehicle load and driver conduct.'
            : wearImpact === 'medium_to_high' || wearImpact === 'medium'
              ? 'Moderate wear impact.'
              : 'Low wear impact.',
        affectedAreas:
          metrics.vehicleLoad.level !== 'low' ||
          (metrics.harshEvents.per100Km.value ?? 0) >= 8
            ? [
                {
                  area:
                    metrics.vehicleLoad.level !== 'low'
                      ? ('general_vehicle_stress' as const)
                      : ('brakes' as const),
                  impact:
                    metrics.vehicleLoad.level === 'high' ||
                    (metrics.harshEvents.per100Km.value ?? 0) >= 15
                      ? ('high' as const)
                      : ('medium' as const),
                  reason:
                    metrics.vehicleLoad.level !== 'low'
                      ? 'Distance-weighted vehicle stress load'
                      : 'Normalized harsh braking rate',
                },
              ]
            : [],
      },
      watchpoints,
      recommendations,
    };
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

  private mapRecord(
    r: RentalDrivingAnalysis & {
      vehicle?: {
        id: string;
        make: string | null;
        model: string | null;
        licensePlate: string | null;
      } | null;
      bookingCustomer?: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        customerType?: import('@prisma/client').CustomerType;
      } | null;
      assignedDriver?: {
        id: string;
        firstName: string | null;
        lastName: string | null;
      } | null;
      actualDriver?: {
        id: string;
        firstName: string | null;
        lastName: string | null;
      } | null;
      driver?: {
        id: string;
        firstName: string | null;
        lastName: string | null;
      } | null;
    },
  ) {
    return {
      id: r.id,
      bookingId: r.bookingId,
      vehicleId: r.vehicleId,
      bookingCustomerId: r.bookingCustomerId,
      assignedDriverId: r.assignedDriverId,
      actualDriverId: r.actualDriverId,
      driverId: r.driverId,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      overallLevel: r.overallLevel,
      driverStyleCategory: r.driverStyleCategory,
      riskLevel: r.riskLevel,
      drivingStressScore: r.drivingScore,
      drivingEventsCount: r.drivingEventsCount,
      abuseDetectionCount: r.abuseDetectionCount,
      wearImpact: r.wearImpact,
      calculationVersion: r.calculationVersion,
      inputFingerprint: r.inputFingerprint,
      generatedAt: r.generatedAt.toISOString(),
      sourceTripsFinalizedAt: r.sourceTripsFinalizedAt?.toISOString() ?? null,
      analysisCompleteness: r.analysisCompleteness,
      stabilityStatus: r.stabilityStatus,
      assessmentStatus: r.assessmentStatus,
      assessmentSummary: r.assessmentSummary,
      maturity: r.maturity,
      supersededAt: r.supersededAt?.toISOString() ?? null,
      supersedesAnalysisId: r.supersedesAnalysisId,
      recomputeReason: r.recomputeReason,
      attributionSummary: r.attributionSummary,
      payload: r.payload,
      vehicle: r.vehicle,
      bookingCustomer: r.bookingCustomer,
      assignedDriver: r.assignedDriver,
      actualDriver: r.actualDriver,
      driver: r.driver,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async findAll(
    orgId: string,
    params?: PaginationParams & {
      vehicleId?: string;
      driverId?: string;
      bookingCustomerId?: string;
      bookingId?: string;
      from?: string;
      to?: string;
      includeSuperseded?: boolean;
    },
  ): Promise<PaginatedResult<any>> {
    const { skip, take } = parsePagination(params || {});
    const where: any = { organizationId: orgId };
    if (!params?.includeSuperseded) {
      where.supersededAt = null;
    }
    if (params?.vehicleId) where.vehicleId = params.vehicleId;
    const legacyCustomerFilter = resolveLegacyDriverIdFilter({
      driverId: params?.driverId,
      bookingCustomerId: params?.bookingCustomerId,
    });
    if (legacyCustomerFilter.bookingCustomerId) {
      where.bookingCustomerId = legacyCustomerFilter.bookingCustomerId;
    }
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
          bookingCustomer: { select: { id: true, firstName: true, lastName: true, customerType: true } },
          assignedDriver: { select: { id: true, firstName: true, lastName: true } },
          actualDriver: { select: { id: true, firstName: true, lastName: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.rentalDrivingAnalysis.count({ where }),
    ]);

    return buildPaginatedResult(data.map((r) => this.mapRecord(r)), total, params || {});
  }

  async findById(orgId: string, id: string) {
    const r = await this.prisma.rentalDrivingAnalysis.findFirst({
      where: { id, organizationId: orgId },
      include: {
        vehicle: { select: { id: true, make: true, model: true, licensePlate: true } },
        bookingCustomer: { select: { id: true, firstName: true, lastName: true, customerType: true } },
        assignedDriver: { select: { id: true, firstName: true, lastName: true } },
        actualDriver: { select: { id: true, firstName: true, lastName: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!r) return null;
    return this.mapRecord(r);
  }
}
