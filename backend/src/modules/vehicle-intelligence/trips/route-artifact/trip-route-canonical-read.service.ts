import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RouteQuality, VehicleTripRouteArtifact } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { MatchedSegmentBoundary } from './chunked-matching/trip-route-chunked-matching.types';
import { recordTripRouteV2CanonicalRead } from './trip-route-canonical-read-prometheus.metrics';
import type {
  CanonicalTripRouteResponse,
  CanonicalTripRouteSpeedPoint,
  RouteContinuityStatus,
} from './trip-route-canonical-read.types';
import { deriveRouteProcessingState } from './trip-route-processing-state';
import { safeParseTripRouteGeometryJson } from './trip-route-geometry';
import type { TripRouteTelemetryGap } from './trip-route-preprocessing.types';
import type { TripRouteLngLat } from './trip-route-geometry';
import {
  resolvePersistedGapCount,
  splitMeasuredPointsByGapAuthority,
} from './trip-route-gap-authority';
import {
  sanitizeMatchedSegmentBoundaries,
  splitFilteredGeometryByGaps,
  splitMatchedGeometryByBoundaries,
  toMultiLineStringGeometry,
} from './trip-route-segment-geometry';
import { VehicleTripRouteArtifactRepository } from './vehicle-trip-route-artifact.repository';

interface ArtifactDiagnostics {
  gaps?: TripRouteTelemetryGap[];
  gapCount?: number;
  r3?: {
    matchedSegmentBoundaries?: MatchedSegmentBoundary[];
  };
}

interface ResolvedRouteGeometry {
  routeQuality: RouteQuality | null;
  geometry: CanonicalTripRouteResponse['geometry'];
  gapCount: number;
  continuityStatus: RouteContinuityStatus;
  qualityAdjusted: boolean;
}

@Injectable()
export class TripRouteCanonicalReadService {
  private readonly logger = new Logger(TripRouteCanonicalReadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly artifactRepository: VehicleTripRouteArtifactRepository,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async getCanonicalRouteForTrip(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<CanonicalTripRouteResponse> {
    const [artifact, routeJob, routeStage, waypoints] = await Promise.all([
      this.artifactRepository.getRouteArtifact(organizationId, tripId),
      this.findLatestRouteJob(organizationId, tripId),
      this.findLatestRouteStage(organizationId, tripId),
      this.loadWaypoints(tripId),
    ]);

    const processing = deriveRouteProcessingState({ artifact, routeJob, routeStage });
    const speedPoints = waypoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speedKmh: point.speedKmh,
      timestamp: point.timestamp,
    }));

    const diagnostics = this.parseDiagnostics(artifact?.diagnosticsJson ?? null);
    const gapCount = this.resolveGapCount(diagnostics, speedPoints, processing.ready);
    const continuityStatus = this.resolveContinuityStatus(processing.ready, gapCount, speedPoints.length);

    if (!processing.ready) {
      const response = this.buildResponse({
        tripId,
        vehicleId,
        routeQuality: null,
        geometry: null,
        artifact,
        speedPoints,
        gapCount,
        continuityStatus,
        processing,
        qualityAdjusted: false,
      });
      this.recordRead(response);
      return response;
    }

    const resolved = this.resolveCanonicalGeometry(artifact, speedPoints, diagnostics);
    const response = this.buildResponse({
      tripId,
      vehicleId,
      routeQuality: resolved.routeQuality,
      geometry: resolved.geometry,
      artifact,
      speedPoints,
      gapCount: resolved.gapCount,
      continuityStatus: resolved.continuityStatus,
      processing,
      qualityAdjusted: resolved.qualityAdjusted,
    });
    this.recordRead(response);
    return response;
  }

  private buildResponse(input: {
    tripId: string;
    vehicleId: string;
    routeQuality: RouteQuality | null;
    geometry: CanonicalTripRouteResponse['geometry'];
    artifact: VehicleTripRouteArtifact | null;
    speedPoints: CanonicalTripRouteSpeedPoint[];
    gapCount: number;
    continuityStatus: RouteContinuityStatus;
    processing: ReturnType<typeof deriveRouteProcessingState>;
    qualityAdjusted: boolean;
  }): CanonicalTripRouteResponse {
    const persistedQuality = input.artifact?.routeQuality ?? null;
    const displayQualityDiffers =
      input.qualityAdjusted &&
      persistedQuality != null &&
      input.routeQuality != null &&
      persistedQuality !== input.routeQuality;

    return {
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      routeQuality: input.routeQuality,
      geometry: input.geometry,
      source: {
        provider: input.artifact?.provider ?? null,
        algorithmVersion: input.artifact?.algorithmVersion ?? null,
        processedAt: input.artifact?.processedAt?.toISOString() ?? null,
      },
      quality: {
        matchConfidence: displayQualityDiffers ? null : input.artifact?.matchConfidence ?? null,
        matchCoverage: displayQualityDiffers ? null : input.artifact?.matchCoverage ?? null,
      },
      counts: {
        sourcePointCount: input.artifact?.sourcePointCount ?? input.speedPoints.length,
        filteredPointCount: input.artifact?.filteredPointCount ?? 0,
        matchedPointCount: input.artifact?.matchedPointCount ?? null,
      },
      continuity: {
        status: input.continuityStatus,
        hasUnknownGaps: input.gapCount > 0,
        gapCount: input.gapCount,
      },
      status: {
        processingState: input.processing.processingState,
        ready: input.processing.ready,
        retryableFailure: input.processing.retryableFailure,
        failureReason: input.processing.failureReason,
      },
      speedPoints: input.speedPoints,
    };
  }

  private resolveCanonicalGeometry(
    artifact: VehicleTripRouteArtifact | null,
    speedPoints: CanonicalTripRouteSpeedPoint[],
    diagnostics: ArtifactDiagnostics,
  ): ResolvedRouteGeometry {
    if (!artifact) {
      return { ...this.resolveRawGeometry(speedPoints, diagnostics), qualityAdjusted: false };
    }

    const gaps = diagnostics.gaps ?? [];
    const matchedBoundaries = diagnostics.r3?.matchedSegmentBoundaries ?? [];

    if (artifact.routeQuality === 'MATCHED') {
      const matchedGeometry = safeParseTripRouteGeometryJson(artifact.matchedGeometryJson);
      if (!matchedGeometry || matchedGeometry.length < 2) {
        this.logger.warn(
          `MATCHED artifact missing valid matchedGeometry trip=${artifact.tripId}; falling back`,
        );
        return {
          ...this.resolveFilteredOrRawFallback(artifact, speedPoints, diagnostics),
          qualityAdjusted: true,
        };
      }

      const sanitizedBoundaries = sanitizeMatchedSegmentBoundaries(
        matchedGeometry.length,
        matchedBoundaries,
      );
      const segments = splitMatchedGeometryByBoundaries(matchedGeometry, sanitizedBoundaries);
      const geometry = toMultiLineStringGeometry(segments);
      if (!geometry) {
        return {
          ...this.resolveFilteredOrRawFallback(artifact, speedPoints, diagnostics),
          qualityAdjusted: true,
        };
      }

      return {
        routeQuality: 'MATCHED',
        geometry,
        gapCount: sanitizedBoundaries.length,
        continuityStatus: this.resolveContinuityStatus(
          true,
          sanitizedBoundaries.length,
          matchedGeometry.length,
        ),
        qualityAdjusted: false,
      };
    }

    if (artifact.routeQuality === 'FILTERED') {
      const filteredGeometry = safeParseTripRouteGeometryJson(artifact.filteredGeometryJson);
      if (!filteredGeometry || filteredGeometry.length < 2) {
        this.logger.warn(
          `FILTERED artifact missing valid filteredGeometry trip=${artifact.tripId}; falling back to RAW`,
        );
        return { ...this.resolveRawGeometry(speedPoints, diagnostics), qualityAdjusted: true };
      }
      const segments = splitFilteredGeometryByGaps(filteredGeometry, gaps);
      const geometry = toMultiLineStringGeometry(segments);
      if (!geometry) {
        return { ...this.resolveRawGeometry(speedPoints, diagnostics), qualityAdjusted: true };
      }
      return {
        routeQuality: 'FILTERED',
        geometry,
        gapCount: gaps.length,
        continuityStatus: this.resolveContinuityStatus(true, gaps.length, filteredGeometry.length),
        qualityAdjusted: false,
      };
    }

    return { ...this.resolveRawGeometry(speedPoints, diagnostics), qualityAdjusted: false };
  }

  private resolveFilteredOrRawFallback(
    artifact: VehicleTripRouteArtifact,
    speedPoints: CanonicalTripRouteSpeedPoint[],
    diagnostics: ArtifactDiagnostics,
  ): Omit<ResolvedRouteGeometry, 'qualityAdjusted'> {
    const gaps = diagnostics.gaps ?? [];
    const filteredGeometry = safeParseTripRouteGeometryJson(artifact.filteredGeometryJson);
    if (filteredGeometry && filteredGeometry.length >= 2) {
      const segments = splitFilteredGeometryByGaps(filteredGeometry, gaps);
      const geometry = toMultiLineStringGeometry(segments);
      if (geometry) {
        return {
          routeQuality: 'FILTERED',
          geometry,
          gapCount: gaps.length,
          continuityStatus: this.resolveContinuityStatus(true, gaps.length, filteredGeometry.length),
        };
      }
    }
    return this.resolveRawGeometry(speedPoints, diagnostics);
  }

  private resolveRawGeometry(
    speedPoints: CanonicalTripRouteSpeedPoint[],
    diagnostics: ArtifactDiagnostics,
  ): Omit<ResolvedRouteGeometry, 'qualityAdjusted'> {
    if (speedPoints.length < 2) {
      const persistedGapCount = resolvePersistedGapCount(diagnostics) ?? 0;
      return {
        routeQuality: 'RAW',
        geometry: null,
        gapCount: persistedGapCount,
        continuityStatus: 'INSUFFICIENT_DATA',
      };
    }

    const geometry: TripRouteLngLat[] = speedPoints.map((point) => [point.longitude, point.latitude]);
    const timestamps = speedPoints.map((point) => point.timestamp);
    const split = splitMeasuredPointsByGapAuthority({
      geometry,
      timestamps,
      diagnostics,
    });

    return {
      routeQuality: 'RAW',
      geometry: toMultiLineStringGeometry(split.segments),
      gapCount: split.gapCount,
      continuityStatus: this.resolveContinuityStatus(true, split.gapCount, speedPoints.length),
    };
  }

  private resolveGapCount(
    diagnostics: ArtifactDiagnostics,
    speedPoints: CanonicalTripRouteSpeedPoint[],
    ready: boolean,
  ): number {
    const persisted = resolvePersistedGapCount(diagnostics);
    if (persisted != null) return persisted;
    if (!ready || speedPoints.length < 2) return 0;

    const geometry = speedPoints.map((point) => [point.longitude, point.latitude] as TripRouteLngLat);
    const split = splitMeasuredPointsByGapAuthority({
      geometry,
      timestamps: speedPoints.map((point) => point.timestamp),
      diagnostics,
    });
    return split.gapCount;
  }

  private resolveContinuityStatus(
    ready: boolean,
    gapCount: number,
    pointCount: number,
  ): RouteContinuityStatus {
    if (!ready || pointCount < 2) return 'INSUFFICIENT_DATA';
    if (gapCount > 0) return 'GAPS_PRESENT';
    return 'COMPLETE';
  }

  private parseDiagnostics(value: unknown): ArtifactDiagnostics {
    if (!value || typeof value !== 'object') return {};
    return value as ArtifactDiagnostics;
  }

  private async loadWaypoints(tripId: string): Promise<CanonicalTripRouteSpeedPoint[]> {
    const waypoints = await this.prisma.vehicleTripWaypoint.findMany({
      where: { tripId },
      orderBy: { recordedAt: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        speedKmh: true,
        recordedAt: true,
      },
    });
    return waypoints.map((waypoint) => ({
      latitude: waypoint.latitude,
      longitude: waypoint.longitude,
      speedKmh: waypoint.speedKmh,
      timestamp: waypoint.recordedAt.toISOString(),
    }));
  }

  private async findLatestRouteJob(organizationId: string, tripId: string) {
    return this.prisma.drivingIntelligenceJob.findFirst({
      where: {
        organizationId,
        tripId,
        jobType: 'DRIVING_ROUTE_ENRICH',
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  private async findLatestRouteStage(organizationId: string, tripId: string) {
    const run = await this.prisma.drivingAnalysisRun.findFirst({
      where: { organizationId, tripId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!run) return null;
    return this.prisma.drivingAnalysisStage.findFirst({
      where: {
        organizationId,
        analysisRunId: run.id,
        stageKey: 'ROUTE',
      },
    });
  }

  private recordRead(response: CanonicalTripRouteResponse): void {
    if (!this.tripMetrics) return;
    recordTripRouteV2CanonicalRead(this.tripMetrics, {
      processingState: response.status.processingState,
      routeQuality: response.routeQuality,
      segmentCount: response.geometry?.coordinates.length ?? 0,
      ready: response.status.ready,
    });
  }
}
