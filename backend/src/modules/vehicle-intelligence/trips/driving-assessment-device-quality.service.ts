import { Injectable, Logger } from '@nestjs/common';
import { DrivingEventType, HardwareType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TechnicalObservationsService } from '@modules/technical-observations/technical-observations.service';
import {
  DEVICE_QUALITY_OBSERVATION_MARKER,
  DEVICE_QUALITY_WORKER_ID,
  type DrivingAssessmentQualityStatus,
  evaluateTripDeviceQuality,
  shouldWarnOnTrip,
  transitionVehicleDeviceQualityState,
} from './driving-assessment-device-quality.detector';
import {
  type AnalysisAssessabilityContext,
  buildAssessabilityForLteR1Completed,
  mergeAssessabilityIntoSummary,
  parseBehaviorSummaryJson,
} from './trip-analysis-status';

const OBSERVATION_TITLE = 'Fahrbewertung eingeschränkt — Telematik-Gerät';

@Injectable()
export class DrivingAssessmentDeviceQualityService {
  private readonly logger = new Logger(DrivingAssessmentDeviceQualityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observations: TechnicalObservationsService,
  ) {}

  /**
   * Evaluate native-event quality after LTE_R1 enrichment and persist vehicle state.
   * Returns summary fields to merge into behaviorSummaryJson.
   */
  async evaluateAfterLteR1Trip(input: {
    tripId: string;
    vehicleId: string;
    organizationId: string;
    hardwareType: HardwareType;
    distanceKm: number | null;
    durationMin: number | null;
    assessability: AnalysisAssessabilityContext;
    existingSummary: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (input.hardwareType !== 'LTE_R1') {
      return input.existingSummary;
    }

    const events = await this.prisma.drivingEvent.findMany({
      where: {
        tripId: input.tripId,
        source: 'TELEMETRY_EVENTS',
      },
      select: { eventType: true, recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    });

    const tripVerdict = evaluateTripDeviceQuality({
      events: events.map((e) => ({
        eventType: e.eventType as string,
        recordedAt: e.recordedAt,
      })),
      distanceKm: input.distanceKm,
      durationMin: input.durationMin,
    });

    const recentTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: input.vehicleId,
        tripStatus: 'COMPLETED',
        endTime: { not: null },
        id: { not: input.tripId },
      },
      select: { id: true, behaviorSummaryJson: true },
      orderBy: { endTime: 'desc' },
      take: 2,
    });

    const recentFlagged = [
      tripVerdict.flagged,
      ...recentTrips.map((t) => {
        const summary = (t.behaviorSummaryJson ?? {}) as Record<string, unknown>;
        return summary.deviceQualityTripFlagged === true;
      }),
    ];

    const existing = await this.prisma.vehicleDrivingAssessmentQuality.findUnique({
      where: { vehicleId: input.vehicleId },
    });

    const transition = transitionVehicleDeviceQualityState({
      currentStatus: (existing?.status ?? 'NORMAL') as DrivingAssessmentQualityStatus,
      consecutiveNormalTrips: existing?.consecutiveNormalTrips ?? 0,
      degradedSince: existing?.degradedSince ?? null,
      recentTripFlagged: recentFlagged,
    });

    const evidenceJson = {
      lastTripId: input.tripId,
      lastTripVerdict: tripVerdict,
      recentFlagged,
      evaluatedAt: new Date().toISOString(),
    };

    const row = await this.prisma.vehicleDrivingAssessmentQuality.upsert({
      where: { vehicleId: input.vehicleId },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        status: transition.nextStatus,
        degradedSince: transition.degradedSince,
        recoveredAt: transition.recoveredAt,
        lastEvaluatedAt: new Date(),
        consecutiveNormalTrips: transition.consecutiveNormalTrips,
        evidenceJson,
        activeObservationId: existing?.activeObservationId ?? null,
      },
      update: {
        status: transition.nextStatus,
        degradedSince: transition.degradedSince,
        recoveredAt: transition.recoveredAt,
        lastEvaluatedAt: new Date(),
        consecutiveNormalTrips: transition.consecutiveNormalTrips,
        evidenceJson,
      },
    });

    const observationId = await this.syncObservation({
      orgId: input.organizationId,
      vehicleId: input.vehicleId,
      status: transition.nextStatus,
      previousObservationId: row.activeObservationId,
      licensePlate: await this.resolveLicensePlate(input.vehicleId),
      tripVerdict,
    });

    if (observationId !== row.activeObservationId) {
      await this.prisma.vehicleDrivingAssessmentQuality.update({
        where: { vehicleId: input.vehicleId },
        data: { activeObservationId: observationId },
      });
    }

    const warn = shouldWarnOnTrip({
      vehicleStatus: transition.nextStatus,
      tripFlagged: tripVerdict.flagged,
    });

    let assessability = input.assessability;
    if (warn) {
      assessability = {
        ...assessability,
        analysisAssessability: 'LIMITED',
        analysisLimitReason: 'DEVICE_NATIVE_EVENT_QUALITY',
      };
    }

    const merged = mergeAssessabilityIntoSummary(
      {
        ...input.existingSummary,
        deviceQualityTripFlagged: tripVerdict.flagged,
        deviceQualityTripReasons: tripVerdict.reasons,
        deviceQualityVehicleStatus: transition.nextStatus,
        deviceQualityWarning: warn,
        deviceQualityMetrics: tripVerdict.metrics,
      },
      assessability,
    );

    await this.prisma.vehicleTrip.update({
      where: { id: input.tripId },
      data: { behaviorSummaryJson: merged as object },
    });

    if (transition.nextStatus === 'DEGRADED' && existing?.status !== 'DEGRADED') {
      this.logger.warn(
        `Vehicle ${input.vehicleId} driving assessment quality DEGRADED (trip ${input.tripId})`,
      );
    }
    if (transition.nextStatus === 'NORMAL' && existing?.status && existing.status !== 'NORMAL') {
      this.logger.log(
        `Vehicle ${input.vehicleId} driving assessment quality recovered to NORMAL`,
      );
    }

    return merged;
  }

  /**
   * Re-evaluate vehicle state from recent completed trips (ops/backfill).
   */
  async reconcileVehicle(vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        organizationId: true,
        hardwareType: true,
        licensePlate: true,
      },
    });
    if (!vehicle || vehicle.hardwareType !== 'LTE_R1') return;

    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        tripStatus: 'COMPLETED',
        endTime: { not: null },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        behaviorSummaryJson: true,
      },
      orderBy: { startTime: 'asc' },
      take: 30,
    });

    for (const trip of trips) {
      const durationMin =
        trip.endTime && trip.startTime
          ? (trip.endTime.getTime() - trip.startTime.getTime()) / 60_000
          : null;
      const assessability = buildAssessabilityForLteR1Completed({
        nativeEventCount: await this.prisma.drivingEvent.count({
          where: { tripId: trip.id, source: 'TELEMETRY_EVENTS' },
        }),
        nativeQuerySucceeded: true,
        hfInsufficientForAbuse: true,
        hfPointsTotal: 0,
        hfPointsCleaned: 0,
        hardwareType: vehicle.hardwareType,
      });
      await this.evaluateAfterLteR1Trip({
        tripId: trip.id,
        vehicleId: vehicle.id,
        organizationId: vehicle.organizationId,
        hardwareType: vehicle.hardwareType,
        distanceKm: trip.distanceKm,
        durationMin,
        assessability,
        existingSummary: parseBehaviorSummaryJson(trip.behaviorSummaryJson),
      });
    }
  }

  async getVehicleStatus(
    vehicleId: string,
  ): Promise<{ status: DrivingAssessmentQualityStatus; degradedSince: string | null } | null> {
    const row = await this.prisma.vehicleDrivingAssessmentQuality.findUnique({
      where: { vehicleId },
      select: { status: true, degradedSince: true },
    });
    if (!row) return null;
    return {
      status: row.status as DrivingAssessmentQualityStatus,
      degradedSince: row.degradedSince?.toISOString() ?? null,
    };
  }

  private async resolveLicensePlate(vehicleId: string): Promise<string | null> {
    const v = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { licensePlate: true },
    });
    return v?.licensePlate ?? null;
  }

  private async syncObservation(input: {
    orgId: string;
    vehicleId: string;
    status: DrivingAssessmentQualityStatus;
    previousObservationId: string | null;
    licensePlate: string | null;
    tripVerdict: ReturnType<typeof evaluateTripDeviceQuality>;
  }): Promise<string | null> {
    const needsObservation = input.status === 'DEGRADED' || input.status === 'RECOVERING';

    if (!needsObservation) {
      if (input.previousObservationId) {
        try {
          await this.observations.resolve(
            input.orgId,
            input.vehicleId,
            input.previousObservationId,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to auto-resolve device quality observation: ${(err as Error).message}`,
          );
        }
      }
      return null;
    }

    if (input.previousObservationId) {
      const active = await this.prisma.vehicleComplaint.findFirst({
        where: {
          id: input.previousObservationId,
          organizationId: input.orgId,
          vehicleId: input.vehicleId,
          status: { in: ['ACTIVE', 'NEW', 'IN_REVIEW', 'OPEN', 'CONFIRMED'] },
        },
        select: { id: true },
      });
      if (active) return active.id;
    }

    const existing = await this.prisma.vehicleComplaint.findFirst({
      where: {
        organizationId: input.orgId,
        vehicleId: input.vehicleId,
        source: 'SYSTEM_IMPORT',
        createdByWorkerId: DEVICE_QUALITY_WORKER_ID,
        status: { in: ['ACTIVE', 'NEW', 'IN_REVIEW', 'OPEN', 'CONFIRMED'] },
        notes: { contains: DEVICE_QUALITY_OBSERVATION_MARKER },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const plate = input.licensePlate?.trim() || 'Fahrzeug';
    const description =
      `Das LTE-R1-Telematikgerät (${plate}) sendet derzeit ungewöhnlich viele native Fahrereignisse. ` +
      `Die Fahrbewertung kann deshalb unzuverlässig sein. Laut DIMO kann die Ursache eine lose OBD-Steckung ` +
      `oder eine fehlerhafte Gerätekalibrierung sein. Trips und übrige Telematik-Daten bleiben verfügbar — ` +
      `betroffen ist nur die automatische Fahrbewertung. ` +
      `Letzte Messung: ${input.tripVerdict.metrics.rawNativeCount} Events` +
      (input.tripVerdict.metrics.eventsPerKm != null
        ? `, ${input.tripVerdict.metrics.eventsPerKm.toFixed(1)}/km`
        : '') +
      '.';

    const created = await this.observations.create(
      input.orgId,
      input.vehicleId,
      {
        source: 'system_import',
        createdByWorkerId: DEVICE_QUALITY_WORKER_ID,
        category: 'driving_behavior',
        severity: 'medium',
        title: OBSERVATION_TITLE,
        description,
        blocksRental: false,
        notes: DEVICE_QUALITY_OBSERVATION_MARKER,
      },
    );

    return created.id;
  }
}
