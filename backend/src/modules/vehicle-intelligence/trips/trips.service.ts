import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  DetectedTrip,
  RoutePoint,
  PerformanceReading,
  TemperatureReading,
} from '../../dimo/dimo-segments.service';
import { MapboxService } from './mapbox.service';
import { TripEnrichmentOrchestratorService } from './trip-enrichment-orchestrator.service';
import { TripStatus } from '@prisma/client';

export interface TripEnrichmentResult {
  citySharePercent: number;
  highwaySharePercent: number;
  countrySharePercent: number;
  cityKm: number;
  highwayKm: number;
  countryKm: number;
  outsideTemperatureStartC: number | null;
  fuelUsedLiters: number | null;
  avgConsumptionLPer100Km: number | null;
  fuelConfidence: string | null;
  energyUsedKwh: number | null;
  avgConsumptionKwhPer100Km: number | null;
  energyConfidence: string | null;
  engineTempStartC: number | null;
  engineTempEndC: number | null;
  avgRpm: number | null;
  avgThrottlePosition: number | null;
  avgEngineLoad: number | null;
  /** @deprecated Legacy point-based percentage */
  speedingPercent: number | null;
  maxOverSpeedKmh: number | null;
  /** @deprecated Now equals speedingSectionCount */
  speedingSegments: number | null;
  speedingSectionCount: number | null;
  speedingDistanceMeters: number | null;
  speedingDurationSeconds: number | null;
  speedingExposurePercent: number | null;
  avgOverSpeedKmh: number | null;
  speedingSections: any[] | null;
  mapMatchConfidence: number;
  matchedGeometry: [number, number][];
  enrichedAt: string;
}

const GAP_TIMEOUT_MS = 20 * 60 * 1000;
const OVERLAP_TOLERANCE_MS = 5 * 60 * 1000;

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly mapbox: MapboxService,
    private readonly enrichmentOrchestrator: TripEnrichmentOrchestratorService,
  ) {}

  // ────────────────────────────────────────────────────────
  // QUERIES
  // ────────────────────────────────────────────────────────

  async findByVehicle(
    vehicleId: string,
    options?: {
      from?: Date;
      to?: Date;
      driverName?: string;
      limit?: number;
    },
  ) {
    const where: any = { vehicleId };
    if (options?.from || options?.to) {
      where.startTime = {};
      if (options.from) where.startTime.gte = options.from;
      if (options.to) where.startTime.lte = options.to;
    }
    if (options?.driverName) where.driverName = options.driverName;

    return this.prisma.vehicleTrip.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: options?.limit ?? 50,
      include: { events: true },
    });
  }

  async findById(tripId: string) {
    return this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      include: {
        waypoints: { orderBy: { recordedAt: 'asc' } },
        events: { orderBy: { recordedAt: 'asc' } },
      },
    });
  }

  async getRouteForTrip(
    vehicleId: string,
    tripId: string,
  ): Promise<RoutePoint[]> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) return [];

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { dimoVehicle: true },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) return this.getStoredWaypoints(tripId);

    const endTime = trip.endTime ?? new Date();
    const points = await this.segments.fetchRouteEnrichment(
      tokenId,
      trip.startTime,
      endTime,
    );
    if (points.length > 0) {
      await this.storeWaypoints(tripId, points);
    }
    return points.length > 0 ? points : this.getStoredWaypoints(tripId);
  }

  async getStats(vehicleId: string) {
    const [totalTrips, totalDistance, avgScore] = await Promise.all([
      this.prisma.vehicleTrip.count({ where: { vehicleId } }),
      this.prisma.vehicleTrip.aggregate({
        where: { vehicleId },
        _sum: { distanceKm: true },
      }),
      this.prisma.vehicleTrip.aggregate({
        where: { vehicleId },
        _avg: { drivingScore: true },
      }),
    ]);
    return {
      totalTrips,
      totalDistanceKm: totalDistance._sum.distanceKm ?? 0,
      avgDrivingScore: avgScore._avg.drivingScore ?? 0,
    };
  }

  // ────────────────────────────────────────────────────────
  // ⚠️  LEGACY V1 TRIP SYNC — DEPRECATED
  //
  // syncTripsFromSegments calls the V1 DimoSegmentsService.fetchAndDetectTrips()
  // method which uses a simple ignition-based heuristic.  This is NOT the live
  // V2 trip engine.  It is retained only for manual admin back-fill via
  // POST /vehicles/:id/trips/sync.
  //
  // Do NOT use this for live trip detection.
  // ────────────────────────────────────────────────────────

  /**
   * @deprecated V1 legacy path — uses ignition-based segment detection.
   *   Use the V2 live orchestration engine for all real-time trip tracking.
   *   This method is only callable via the manual admin endpoint
   *   POST /vehicles/:id/trips/sync and should not be used in production flows.
   */
  async syncTripsFromSegments(
    vehicleId: string,
    tokenId: number,
    from: Date,
    to: Date,
  ): Promise<number> {
    const detected = await this.segments.fetchAndDetectTrips(
      tokenId,
      from,
      to,
    );
    if (!detected.length) return 0;

    const vehicleRow = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true, tankCapacityLiters: true },
    });
    const tankCap = vehicleRow?.tankCapacityLiters ?? null;
    const organizationId = vehicleRow?.organizationId ?? null;

    let created = 0;

    for (const trip of detected) {
      const segmentId = this.segments.buildSegmentId(
        tokenId,
        trip.startTime,
      );

      const existingById = await this.prisma.vehicleTrip.findUnique({
        where: { dimoSegmentId: segmentId },
      });

      if (existingById) {
        if (
          existingById.tripStatus === TripStatus.ONGOING &&
          !trip.isOngoing
        ) {
          await this.completeTrip(existingById.id, trip, vehicleId, organizationId);
        }
        continue;
      }

      const newStart = new Date(trip.startTime);
      const newEnd = trip.endTime ? new Date(trip.endTime) : null;

      const overlapping = await this.prisma.vehicleTrip.findFirst({
        where: {
          vehicleId,
          startTime: {
            lt: new Date(
              (newEnd?.getTime() ?? newStart.getTime() + 3600000) +
                OVERLAP_TOLERANCE_MS,
            ),
          },
          endTime: {
            gt: new Date(newStart.getTime() - OVERLAP_TOLERANCE_MS),
          },
        },
      });
      if (overlapping) continue;

      const distanceKm = this.computeOdometerDistance(trip);
      const fuelResult = this.computeFuelConsumption(trip, distanceKm, tankCap);
      const energyResult = this.computeEnergyConsumption(trip, distanceKm);

      const tripStatus = trip.isOngoing ? TripStatus.ONGOING : TripStatus.COMPLETED;

      const newTrip = await this.prisma.vehicleTrip.create({
        data: {
          vehicle: { connect: { id: vehicleId } },
          dimoSegmentId: segmentId,
          tripStatus,
          startTime: newStart,
          endTime: newEnd,
          startLatitude: trip.startLatitude,
          startLongitude: trip.startLongitude,
          endLatitude: trip.endLatitude,
          endLongitude: trip.endLongitude,
          distanceKm,
          durationMinutes: trip.durationSeconds / 60,
          avgSpeedKmh: trip.avgSpeed,
          maxSpeedKmh: trip.maxSpeed,
          fuelUsedLiters: fuelResult.fuelUsedLiters,
          avgConsumptionLPer100Km: fuelResult.avgConsumptionLPer100Km,
          fuelConfidence: fuelResult.confidence,
          energyUsedKwh: energyResult.energyUsedKwh,
          avgConsumptionKwhPer100Km: energyResult.avgConsumptionKwhPer100Km,
          energyConfidence: energyResult.confidence,
          drivingScore: this.computeDrivingScore(trip),
        },
        select: { id: true },
      });

      created++;

      // V1 sync: enqueue behavior enrichment for completed trips via canonical pipeline
      if (tripStatus === TripStatus.COMPLETED) {
        this.logger.log(`V1 sync: trip ${newTrip.id} created as COMPLETED — enqueuing behavior enrichment`);
        this.enrichmentOrchestrator
          .enqueueBehaviorEnrichment(newTrip.id, vehicleId, organizationId)
          .catch((e) => this.logger.warn(`V1 sync: failed to enqueue enrichment for ${newTrip.id}: ${e}`));
      }
    }

    this.logger.log(
      `Synced ${created} new trips from ${detected.length} detected segments for vehicle ${vehicleId}`,
    );
    return created;
  }

  /**
   * Finalize ongoing trips that have had no new data for 20 minutes.
   */
  async finalizeStaleOngoingTrips(): Promise<number> {
    const cutoff = new Date(Date.now() - GAP_TIMEOUT_MS);
    const staleTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        tripStatus: TripStatus.ONGOING,
        startTime: { lt: cutoff },
      },
    });

    let finalized = 0;
    for (const trip of staleTrips) {
      const lastWaypoint = await this.prisma.vehicleTripWaypoint.findFirst({
        where: { tripId: trip.id },
        orderBy: { recordedAt: 'desc' },
      });

      const endTime =
        lastWaypoint?.recordedAt ?? new Date(cutoff.getTime());

      await this.prisma.vehicleTrip.update({
        where: { id: trip.id },
        data: {
          tripStatus: TripStatus.COMPLETED,
          endTime,
          gapEnded: true,
        },
      });
      finalized++;
    }

    if (finalized > 0) {
      this.logger.log(
        `Finalized ${finalized} stale ongoing trips (gap timeout)`,
      );
    }
    return finalized;
  }

  // ────────────────────────────────────────────────────────
  // ⚠️  LEGACY ROUTE-BASED ENRICHMENT — DEPRECATED
  //
  // enrichTrip() fetches route, temperature, and Performance (15s) signals
  // to compute road-type distribution (city/highway/country), speeding, and
  // basic avg RPM/throttle/load metrics.  It writes to:
  //   citySharePercent, highwaySharePercent, countrySharePercent,
  //   outsideTemperatureStartC, engineTempStartC, engineTempEndC,
  //   avgRpm, avgThrottlePosition, avgEngineLoad,
  //   speedingPercent, maxOverSpeedKmh, speedingSegments
  //
  // These fields are COMPLEMENTARY to HF enrichment, NOT conflicting.
  // The legacy fields it writes do NOT overlap with the HF behavior counters
  // (hardAccelerationCount, hardBrakingCount, abuseEventCount, etc.).
  //
  // CANONICAL TRUTH for post-trip behavior metrics (acceleration, braking,
  // abuse events, stress scores) is the HF enrichment pipeline:
  //   TripBehaviorEnrichmentService → DrivingImpactService
  //
  // This method is kept for its road-type and speeding enrichment which is
  // genuinely separate.  It is reachable via POST /vehicles/:id/trips/:tripId/enrich
  // and is callable from the rental app for manual or batch enrichment.
  //
  // DO NOT rely on harshBrakeCount / harshAccelCount / harshCornerCount written
  // anywhere in this method — those legacy fields are written by DrivingEvent
  // aggregation if applicable, not here.  For behavior truth, use behaviorEnrichedAt
  // and hardBrakingCount / hardAccelerationCount from the HF pipeline.
  // ────────────────────────────────────────────────────────

  /**
   * Route-based trip enrichment: road type, speeding, temperature, basic perf.
   *
   * This is NOT the canonical behavior analysis path.
   * For behavior metrics (acceleration / braking / abuse events), use the
   * HF enrichment pipeline (TripBehaviorEnrichmentService).
   */
  async enrichTrip(
    vehicleId: string,
    tripId: string,
  ): Promise<TripEnrichmentResult | null> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
    });
    if (!trip) return null;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { dimoVehicle: true },
    });
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (!tokenId) return null;

    const endTime = trip.endTime ?? new Date();

    const [routePoints, tempReadings, perfReadings] = await Promise.all([
      this.segments.fetchRouteEnrichment(tokenId, trip.startTime, endTime),
      this.segments.fetchEnvironmentTemperature(
        tokenId,
        trip.startTime,
        endTime,
      ),
      this.segments.fetchPerformance(tokenId, trip.startTime, endTime),
    ]);

    if (routePoints.length > 0) {
      await this.storeWaypoints(tripId, routePoints);
    }

    const matchResult =
      routePoints.length >= 2
        ? await this.mapbox.mapMatchRoute(
            routePoints.map((p) => ({
              longitude: p.longitude,
              latitude: p.latitude,
              timestamp: p.timestamp,
            })),
          )
        : null;

    const roadDist = matchResult
      ? this.mapbox.deriveRoadTypeDistribution(
          matchResult.legs,
          matchResult.totalDistance,
        )
      : { cityPercent: 0, highwayPercent: 0, countryPercent: 0, cityKm: 0, highwayKm: 0, countryKm: 0 };

    const speedingAnalysis =
      matchResult && routePoints.length >= 2
        ? this.mapbox.analyzeSpeedingSections(matchResult.legs, routePoints)
        : null;

    const outsideTempStart = this.findClosestTemperature(
      tempReadings,
      trip.startTime,
    );

    const perfMetrics = this.computePerformanceMetrics(
      perfReadings,
      trip.startTime,
      endTime,
    );

    let distanceKm = trip.distanceKm;
    if (matchResult && matchResult.totalDistance > 0) {
      distanceKm = Math.round(matchResult.totalDistance / 100) / 10;
    }

    if (routePoints.length >= 2) {
      const firstPt = routePoints[0];
      const lastPt = routePoints[routePoints.length - 1];
      await this.prisma.vehicleTrip.update({
        where: { id: tripId },
        data: {
          startLatitude: firstPt.latitude,
          startLongitude: firstPt.longitude,
          endLatitude: lastPt.latitude,
          endLongitude: lastPt.longitude,
        },
      });
    }

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        citySharePercent: roadDist.cityPercent,
        highwaySharePercent: roadDist.highwayPercent,
        countrySharePercent: roadDist.countryPercent,
        outsideTemperatureStartC: outsideTempStart,
        engineTempStartC: perfMetrics.engineTempStartC,
        engineTempEndC: perfMetrics.engineTempEndC,
        avgRpm: perfMetrics.avgRpm,
        avgThrottlePosition: perfMetrics.avgThrottlePosition,
        avgEngineLoad: perfMetrics.avgEngineLoad,
        speedingPercent: speedingAnalysis?.speedingPercent ?? null,
        maxOverSpeedKmh: speedingAnalysis?.maxOverSpeedKmh ?? null,
        speedingSegments: speedingAnalysis?.speedingSectionCount ?? null,
        speedingSectionsJson: speedingAnalysis?.sections ? JSON.parse(JSON.stringify(speedingAnalysis.sections)) : undefined,
        speedingSectionCount: speedingAnalysis?.speedingSectionCount ?? null,
        speedingDistanceM: speedingAnalysis?.speedingDistanceMeters ?? null,
        speedingDurationS: speedingAnalysis?.speedingDurationSeconds ?? null,
        speedingExposurePct: speedingAnalysis?.speedingExposurePercent ?? null,
        avgOverSpeedKmh: speedingAnalysis?.avgOverSpeedKmh ?? null,
        ...(distanceKm != null ? { distanceKm } : {}),
        enrichedAt: new Date(),
      },
    });

    return {
      citySharePercent: roadDist.cityPercent,
      highwaySharePercent: roadDist.highwayPercent,
      countrySharePercent: roadDist.countryPercent,
      cityKm: roadDist.cityKm,
      highwayKm: roadDist.highwayKm,
      countryKm: roadDist.countryKm,
      outsideTemperatureStartC: outsideTempStart,
      fuelUsedLiters: trip.fuelUsedLiters,
      avgConsumptionLPer100Km: trip.avgConsumptionLPer100Km,
      fuelConfidence: trip.fuelConfidence,
      energyUsedKwh: trip.energyUsedKwh,
      avgConsumptionKwhPer100Km: trip.avgConsumptionKwhPer100Km,
      energyConfidence: trip.energyConfidence,
      engineTempStartC: perfMetrics.engineTempStartC,
      engineTempEndC: perfMetrics.engineTempEndC,
      avgRpm: perfMetrics.avgRpm,
      avgThrottlePosition: perfMetrics.avgThrottlePosition,
      avgEngineLoad: perfMetrics.avgEngineLoad,
      speedingPercent: speedingAnalysis?.speedingPercent ?? null,
      maxOverSpeedKmh: speedingAnalysis?.maxOverSpeedKmh ?? null,
      speedingSegments: speedingAnalysis?.speedingSectionCount ?? null,
      speedingSectionCount: speedingAnalysis?.speedingSectionCount ?? null,
      speedingDistanceMeters: speedingAnalysis?.speedingDistanceMeters ?? null,
      speedingDurationSeconds: speedingAnalysis?.speedingDurationSeconds ?? null,
      speedingExposurePercent: speedingAnalysis?.speedingExposurePercent ?? null,
      avgOverSpeedKmh: speedingAnalysis?.avgOverSpeedKmh ?? null,
      speedingSections: speedingAnalysis?.sections ?? null,
      mapMatchConfidence: matchResult?.confidence ?? 0,
      matchedGeometry: matchResult?.matchedGeometry ?? [],
      enrichedAt: new Date().toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────
  // DEDUPLICATION
  // ────────────────────────────────────────────────────────

  async deduplicateTrips(vehicleId?: string): Promise<number> {
    const where = vehicleId ? { id: vehicleId } : {};
    const vehicles = await this.prisma.vehicle.findMany({
      where,
      select: { id: true },
    });

    let totalRemoved = 0;

    for (const { id: vId } of vehicles) {
      const trips = await this.prisma.vehicleTrip.findMany({
        where: { vehicleId: vId },
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          createdAt: true,
        },
      });

      const toDelete = new Set<string>();

      for (let i = 0; i < trips.length; i++) {
        if (toDelete.has(trips[i].id)) continue;
        const a = trips[i];
        const aEnd = a.endTime?.getTime() ?? a.startTime.getTime();

        for (let j = i + 1; j < trips.length; j++) {
          if (toDelete.has(trips[j].id)) continue;
          const b = trips[j];
          const bStart = b.startTime.getTime();
          if (bStart > aEnd + OVERLAP_TOLERANCE_MS) break;
          toDelete.add(b.id);
        }
      }

      if (toDelete.size > 0) {
        const ids = [...toDelete];
        await this.prisma.drivingEvent.updateMany({
          where: { tripId: { in: ids } },
          data: { tripId: null },
        });
        await this.prisma.vehicleTrip.deleteMany({
          where: { id: { in: ids } },
        });
        totalRemoved += ids.length;
      }
    }

    if (totalRemoved > 0) {
      this.logger.log(
        `Deduplication: removed ${totalRemoved} trips across ${vehicles.length} vehicles`,
      );
    }
    return totalRemoved;
  }

  // ────────────────────────────────────────────────────────
  // PRIVATE: signal-based calculations
  // ────────────────────────────────────────────────────────

  private async completeTrip(
    tripId: string,
    detected: DetectedTrip,
    vehicleId: string,
    organizationId: string | null,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { tankCapacityLiters: true },
    });
    const distanceKm = this.computeOdometerDistance(detected);
    const fuelResult = this.computeFuelConsumption(detected, distanceKm, vehicle?.tankCapacityLiters);
    const energyResult = this.computeEnergyConsumption(detected, distanceKm);

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        tripStatus: TripStatus.COMPLETED,
        endTime: detected.endTime ? new Date(detected.endTime) : new Date(),
        distanceKm,
        durationMinutes: detected.durationSeconds / 60,
        avgSpeedKmh: detected.avgSpeed,
        maxSpeedKmh: detected.maxSpeed,
        fuelUsedLiters: fuelResult.fuelUsedLiters,
        avgConsumptionLPer100Km: fuelResult.avgConsumptionLPer100Km,
        fuelConfidence: fuelResult.confidence,
        energyUsedKwh: energyResult.energyUsedKwh,
        avgConsumptionKwhPer100Km: energyResult.avgConsumptionKwhPer100Km,
        energyConfidence: energyResult.confidence,
      },
    });

    // Enqueue behavior enrichment via canonical pipeline
    this.logger.log(`V1 sync: trip ${tripId} completed — enqueuing behavior enrichment`);
    this.enrichmentOrchestrator
      .enqueueBehaviorEnrichment(tripId, vehicleId, organizationId)
      .catch((e) => this.logger.warn(`V1 sync: failed to enqueue enrichment for ${tripId}: ${e}`));
  }

  private computeOdometerDistance(trip: DetectedTrip): number | null {
    if (trip.startOdometer == null || trip.endOdometer == null) return null;
    const delta = trip.endOdometer - trip.startOdometer;
    if (delta < 0 || delta > 2000) return null;
    return Math.round(delta * 10) / 10;
  }

  private computeFuelConsumption(
    trip: DetectedTrip,
    distanceKm: number | null,
    tankCapacityLiters?: number | null,
  ): {
    fuelUsedLiters: number | null;
    avgConsumptionLPer100Km: number | null;
    confidence: string | null;
  } {
    if (trip.startFuelLevel == null || trip.endFuelLevel == null) {
      return {
        fuelUsedLiters: null,
        avgConsumptionLPer100Km: null,
        confidence: null,
      };
    }

    const maxTank = tankCapacityLiters ?? 120;

    if (
      trip.startFuelLevel > maxTank * 1.1 ||
      trip.endFuelLevel > maxTank * 1.1
    ) {
      return {
        fuelUsedLiters: null,
        avgConsumptionLPer100Km: null,
        confidence: 'invalid',
      };
    }

    const delta = trip.startFuelLevel - trip.endFuelLevel;
    if (delta < 0 || delta > maxTank) {
      return {
        fuelUsedLiters: null,
        avgConsumptionLPer100Km: null,
        confidence: 'invalid',
      };
    }

    const fuelUsedLiters = Math.round(delta * 100) / 100;
    let avgConsumptionLPer100Km: number | null = null;
    let confidence = 'high';

    if (distanceKm != null && distanceKm > 0) {
      avgConsumptionLPer100Km =
        Math.round((fuelUsedLiters / distanceKm) * 100 * 10) / 10;
      if (avgConsumptionLPer100Km > 30 || avgConsumptionLPer100Km < 1) {
        confidence = 'low';
      }
    } else {
      confidence = 'low';
    }

    const durationHours = trip.durationSeconds / 3600;
    if (durationHours > 0 && fuelUsedLiters / durationHours > 25) {
      confidence = 'low';
    }

    return { fuelUsedLiters, avgConsumptionLPer100Km, confidence };
  }

  private computeEnergyConsumption(
    trip: DetectedTrip,
    distanceKm: number | null,
  ): {
    energyUsedKwh: number | null;
    avgConsumptionKwhPer100Km: number | null;
    confidence: string | null;
  } {
    if (trip.startBatteryEnergy == null || trip.endBatteryEnergy == null) {
      return {
        energyUsedKwh: null,
        avgConsumptionKwhPer100Km: null,
        confidence: null,
      };
    }

    const delta = trip.startBatteryEnergy - trip.endBatteryEnergy;
    if (delta < 0 || delta > 200) {
      return {
        energyUsedKwh: null,
        avgConsumptionKwhPer100Km: null,
        confidence: 'invalid',
      };
    }

    const energyUsedKwh = Math.round(delta * 100) / 100;
    let avgConsumptionKwhPer100Km: number | null = null;
    let confidence = 'high';

    if (distanceKm != null && distanceKm > 0) {
      avgConsumptionKwhPer100Km =
        Math.round((energyUsedKwh / distanceKm) * 100 * 10) / 10;
      if (
        avgConsumptionKwhPer100Km > 80 ||
        avgConsumptionKwhPer100Km < 3
      ) {
        confidence = 'low';
      }
    } else {
      confidence = 'low';
    }

    return { energyUsedKwh, avgConsumptionKwhPer100Km, confidence };
  }

  private findClosestTemperature(
    readings: TemperatureReading[],
    targetTime: Date,
  ): number | null {
    const closest = DimoSegmentsService.closestReading(
      readings,
      targetTime,
    );
    return closest
      ? Math.round(closest.temperatureC * 10) / 10
      : null;
  }

  private computePerformanceMetrics(
    readings: PerformanceReading[],
    tripStart: Date,
    tripEnd: Date,
  ): {
    engineTempStartC: number | null;
    engineTempEndC: number | null;
    avgRpm: number | null;
    avgThrottlePosition: number | null;
    avgEngineLoad: number | null;
  } {
    if (readings.length === 0) {
      return {
        engineTempStartC: null,
        engineTempEndC: null,
        avgRpm: null,
        avgThrottlePosition: null,
        avgEngineLoad: null,
      };
    }

    const closestStart = DimoSegmentsService.closestReading(
      readings,
      tripStart,
    );
    const closestEnd = DimoSegmentsService.closestReading(
      readings,
      tripEnd,
    );

    const rpms = readings
      .filter((r) => r.rpm != null)
      .map((r) => r.rpm!);
    const throttles = readings
      .filter((r) => r.throttlePosition != null)
      .map((r) => r.throttlePosition!);
    const loads = readings
      .filter((r) => r.engineLoad != null)
      .map((r) => r.engineLoad!);

    return {
      engineTempStartC: closestStart?.engineCoolantTempC
        ? Math.round(closestStart.engineCoolantTempC * 10) / 10
        : null,
      engineTempEndC: closestEnd?.engineCoolantTempC
        ? Math.round(closestEnd.engineCoolantTempC * 10) / 10
        : null,
      avgRpm:
        rpms.length > 0
          ? Math.round(rpms.reduce((a, b) => a + b, 0) / rpms.length)
          : null,
      avgThrottlePosition:
        throttles.length > 0
          ? Math.round(
              (throttles.reduce((a, b) => a + b, 0) / throttles.length) *
                10,
            ) / 10
          : null,
      avgEngineLoad:
        loads.length > 0
          ? Math.round(
              (loads.reduce((a, b) => a + b, 0) / loads.length) * 10,
            ) / 10
          : null,
    };
  }

  private computeDrivingScore(trip: DetectedTrip): number {
    let score = 100;
    if (trip.maxSpeed != null) {
      if (trip.maxSpeed > 200) score -= 15;
      else if (trip.maxSpeed > 160) score -= 10;
    }
    return Math.max(Math.round(score), 0);
  }

  // ────────────────────────────────────────────────────────
  // WAYPOINT STORAGE
  // ────────────────────────────────────────────────────────

  private async storeWaypoints(
    tripId: string,
    points: RoutePoint[],
  ): Promise<void> {
    const sampled =
      points.length > 500
        ? points.filter(
            (_, i) => i % Math.ceil(points.length / 500) === 0,
          )
        : points;

    await this.prisma.vehicleTripWaypoint.deleteMany({
      where: { tripId },
    });
    await this.prisma.vehicleTripWaypoint.createMany({
      data: sampled.map((p) => ({
        tripId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKmh: p.speedKmh,
        recordedAt: new Date(p.timestamp),
      })),
    });
  }

  private async getStoredWaypoints(tripId: string): Promise<RoutePoint[]> {
    const waypoints = await this.prisma.vehicleTripWaypoint.findMany({
      where: { tripId },
      orderBy: { recordedAt: 'asc' },
    });
    return waypoints.map((w) => ({
      latitude: w.latitude,
      longitude: w.longitude,
      speedKmh: w.speedKmh,
      timestamp: w.recordedAt.toISOString(),
    }));
  }
}
