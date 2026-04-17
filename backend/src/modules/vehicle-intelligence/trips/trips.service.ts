import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DimoSegmentsService,
  RoutePoint,
  PerformanceReading,
  TemperatureReading,
} from '../../dimo/dimo-segments.service';
import { MapboxService } from './mapbox.service';
import { ROUTE_MAP_MATCHER, RouteMapMatcher } from './route-map-matcher.port';

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

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    @Inject(ROUTE_MAP_MATCHER)
    private readonly routeMapMatcher: RouteMapMatcher,
    private readonly mapbox: MapboxService,
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

    // List view does NOT include per-trip `events` rows. The callers (trips list
    // controller, rental-driving-analysis) operate exclusively on the aggregated
    // counters on VehicleTrip + canonical summary. Inlining every event row made
    // the payload grow linearly with trip count × events-per-trip and hit the
    // DB with a large join for no UI benefit. Event details are fetched on
    // demand via GET /trips/:tripId (findById still includes events).
    return this.prisma.vehicleTrip.findMany({
      where,
      orderBy: { startTime: 'desc' },
      take: options?.limit ?? 50,
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
    const [totalTrips, tripAgg, impactAgg] = await Promise.all([
      this.prisma.vehicleTrip.count({ where: { vehicleId } }),
      this.prisma.vehicleTrip.aggregate({
        where: { vehicleId },
        _sum: {
          distanceKm: true,
          totalAccelerationEvents: true,
          hardAccelerationEvents: true,
          totalBrakingEvents: true,
          hardBrakingEvents: true,
          abuseEvents: true,
          speedingEvents: true,
        },
      }),
      this.prisma.tripDrivingImpact.aggregate({
        where: { vehicleId },
        _avg: { drivingStyleScore: true, safetyScore: true },
      }),
    ]);

    const avgDrivingStyleScore = impactAgg._avg.drivingStyleScore ?? 0;
    const avgSafetyScore = impactAgg._avg.safetyScore ?? 0;

    return {
      totalTrips,
      totalDistanceKm: tripAgg._sum.distanceKm ?? 0,
      // Compatibility alias for older consumers; canonical source is TripDrivingImpact.drivingStyleScore.
      avgDrivingScore: avgDrivingStyleScore,
      avgDrivingStyleScore,
      avgSafetyScore,
      totalAccelerationEvents: tripAgg._sum.totalAccelerationEvents ?? 0,
      totalHardAccelerationEvents: tripAgg._sum.hardAccelerationEvents ?? 0,
      totalBrakingEvents: tripAgg._sum.totalBrakingEvents ?? 0,
      totalHardBrakingEvents: tripAgg._sum.hardBrakingEvents ?? 0,
      totalAbuseEvents: tripAgg._sum.abuseEvents ?? 0,
      totalSpeedingEvents: tripAgg._sum.speedingEvents ?? 0,
    };
  }

  // V1 syncTripsFromSegments, finalizeStaleOngoingTrips, deduplicateTrips,
  // computeDrivingScore, and completeTrip have been removed.
  // Reconciliation and repair are now handled by TripReconciliationService
  // (see reconciliation/trip-reconciliation.service.ts).
  // Manual "Sync Trips" triggers TripReconciliationService.triggerManualReconciliation()
  // via the controller's POST /trips/reconcile endpoint.

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
        ? await this.routeMapMatcher.matchRoute(
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
        speedingEvents: speedingAnalysis?.speedingSectionCount ?? 0,
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
  // PRIVATE: signal-based calculations
  // ────────────────────────────────────────────────────────

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
