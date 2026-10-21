import { Injectable, Logger, Optional } from '@nestjs/common';
import type { MapMatchResult } from '../mapbox.service';
import type { VehicleTripRouteArtifact } from '@prisma/client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  buildTripRouteInputFingerprintInput,
  computeTripRouteInputFingerprint,
} from './trip-route-input-fingerprint';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import { TRIP_ROUTE_MEASURED_PROVIDER } from './trip-route-preprocessing.constants';
import { preprocessTripRoute } from './trip-route-preprocessor';
import { parseTripRouteGeometryJson } from './trip-route-geometry';
import type { TripRouteInputPoint } from './trip-route.types';
import {
  TripRouteArtifactTenantMismatchError,
  VehicleTripRouteArtifactRepository,
} from './vehicle-trip-route-artifact.repository';
import { TripRouteArtifactValidationError } from './trip-route-artifact.validation';
import { TripRouteChunkedMatcherService } from './chunked-matching/trip-route-chunked-matcher.service';
import { TripRouteMatchRetryableError } from './chunked-matching/trip-route-chunked-matching.errors';
import { TRIP_ROUTE_MAPBOX_PROVIDER } from './chunked-matching/trip-route-chunked-matching.constants';
import {
  recordTripRouteV2MatchAttempt,
  recordTripRouteV2MatchChunks,
  recordTripRouteV2MatchDuration,
  recordTripRouteV2MatchOutcome,
  recordTripRouteV2MatchQuality,
} from './chunked-matching/trip-route-v2-match-prometheus.metrics';
import type { ChunkedMatchDiagnostics } from './chunked-matching/trip-route-chunked-matching.types';

export interface TripRouteArtifactMaterializeInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  points: TripRouteInputPoint[];
  provider?: string;
}

export type TripRouteArtifactMaterializeOutcome =
  | {
      ok: true;
      action: 'CREATED' | 'UPDATED' | 'UNCHANGED';
      routeQuality: 'MATCHED' | 'FILTERED' | 'RAW';
      matchResult: MapMatchResult | null;
      mapboxSkipped?: boolean;
    }
  | { ok: false; error: string; retryable: boolean };

interface PersistedR3MatchCache {
  legs: MapMatchResult['legs'];
  totalDistance: number;
  confidence: number;
  tracepointCoverage?: number;
}

function readPersistedMatchCache(
  diagnostics: Record<string, unknown> | null | undefined,
): PersistedR3MatchCache | null {
  const r3 = diagnostics?.r3 as { persistedMatchResult?: PersistedR3MatchCache } | undefined;
  return r3?.persistedMatchResult ?? null;
}

function reconstructMatchFromArtifact(artifact: VehicleTripRouteArtifact): MapMatchResult | null {
  if (artifact.routeQuality !== 'MATCHED') return null;
  const geometry = parseTripRouteGeometryJson(artifact.matchedGeometryJson);
  if (!geometry || geometry.length < 2) return null;
  const cache = readPersistedMatchCache(
    artifact.diagnosticsJson as Record<string, unknown> | null,
  );
  if (!cache) return null;
  return {
    matchedGeometry: geometry as [number, number][],
    legs: cache.legs,
    totalDistance: cache.totalDistance,
    confidence: cache.confidence,
    tracepointCoverage: cache.tracepointCoverage,
  };
}

@Injectable()
export class TripRouteArtifactMaterializerService {
  private readonly logger = new Logger(TripRouteArtifactMaterializerService.name);

  constructor(
    private readonly artifactRepository: VehicleTripRouteArtifactRepository,
    private readonly chunkedMatcher: TripRouteChunkedMatcherService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  /**
   * Preprocess measured route input, run R3 chunked matching, persist canonical artifact.
   * Retryable failures return { ok: false, retryable: true } for caller propagation.
   */
  async materializeFromMeasuredRoute(
    input: TripRouteArtifactMaterializeInput,
  ): Promise<TripRouteArtifactMaterializeOutcome> {
    const startedAt = Date.now();
    try {
      const preprocessing = preprocessTripRoute({
        tripId: input.tripId,
        points: input.points,
      });

      const fingerprint = computeTripRouteInputFingerprint(
        buildTripRouteInputFingerprintInput(
          input.tripId,
          TRIP_ROUTE_ALGORITHM_VERSION,
          input.points,
        ),
      );

      const tenant = {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        tripVehicleId: input.vehicleId,
        vehicleOrganizationId: input.organizationId,
      };

      const existing = await this.artifactRepository.findByInputFingerprint(
        input.organizationId,
        input.tripId,
        TRIP_ROUTE_ALGORITHM_VERSION,
        fingerprint,
      );

      if (existing?.routeQuality === 'MATCHED') {
        const cachedMatch = reconstructMatchFromArtifact(existing);
        if (cachedMatch) {
          this.tripMetrics && recordTripRouteV2MatchOutcome(this.tripMetrics, 'skipped');
          return {
            ok: true,
            action: 'UNCHANGED',
            routeQuality: 'MATCHED',
            matchResult: cachedMatch,
            mapboxSkipped: true,
          };
        }
      }

      this.tripMetrics && recordTripRouteV2MatchAttempt(this.tripMetrics);

      let routeQuality: 'MATCHED' | 'FILTERED' | 'RAW' = preprocessing.quality;
      let matchedGeometry = null;
      let matchConfidence: number | null = null;
      let matchCoverage: number | null = null;
      let matchedPointCount: number | null = null;
      let chunkCount: number | null = null;
      let failedChunkCount: number | null = null;
      let matchResult: MapMatchResult | null = null;
      let matchingDiagnostics: ChunkedMatchDiagnostics | null = null;
      let failureReason = preprocessing.diagnostics.fallbackReason;

      if (preprocessing.quality === 'FILTERED' && preprocessing.filteredPoints.length >= 2) {
        const pipeline = await this.chunkedMatcher.matchFilteredRoute({
          filteredPoints: preprocessing.filteredPoints,
          filteredGeometry: preprocessing.filteredGeometry,
          gaps: preprocessing.diagnostics.gaps,
          preprocessingQuality: preprocessing.quality,
        });

        matchingDiagnostics = pipeline.diagnostics;
        chunkCount = pipeline.chunkCount;
        failedChunkCount = pipeline.failedChunkCount;
        routeQuality = pipeline.routeQuality;
        matchedGeometry = pipeline.matchedGeometry;
        matchConfidence = pipeline.matchConfidence;
        matchCoverage = pipeline.matchCoverage;
        matchedPointCount = pipeline.matchedPointCount;
        matchResult = pipeline.matchResult;
        failureReason = pipeline.diagnostics.failureReason ?? failureReason;

        if (this.tripMetrics) {
          if (pipeline.routeQuality === 'MATCHED') {
            recordTripRouteV2MatchOutcome(this.tripMetrics, 'succeeded');
          } else if (pipeline.diagnostics.matchingStatus === 'FILTERED_FALLBACK') {
            recordTripRouteV2MatchOutcome(this.tripMetrics, 'quality_rejected');
          }
          if (chunkCount != null && failedChunkCount != null) {
            recordTripRouteV2MatchChunks(this.tripMetrics, {
              chunkCount,
              failedChunkCount,
            });
          }
          if (matchCoverage != null && matchConfidence != null) {
            recordTripRouteV2MatchQuality(this.tripMetrics, {
              coverage: matchCoverage,
              confidence: matchConfidence,
            });
          }
          recordTripRouteV2MatchDuration(this.tripMetrics, Date.now() - startedAt);
        }
      }

      const diagnostics = {
        ...preprocessing.diagnostics,
        r3: {
          ...(matchingDiagnostics ?? { matchingStatus: 'SKIPPED' }),
          persistedMatchResult: matchResult
            ? {
                legs: matchResult.legs,
                totalDistance: matchResult.totalDistance,
                confidence: matchResult.confidence,
                tracepointCoverage: matchResult.tracepointCoverage,
              }
            : null,
        },
      };

      const upsert = await this.artifactRepository.upsertRouteArtifact(
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          routeQuality,
          matchedGeometry: routeQuality === 'MATCHED' ? matchedGeometry : null,
          filteredGeometry: preprocessing.filteredGeometry,
          matchConfidence,
          matchCoverage,
          provider:
            routeQuality === 'MATCHED'
              ? TRIP_ROUTE_MAPBOX_PROVIDER
              : input.provider ?? TRIP_ROUTE_MEASURED_PROVIDER,
          algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
          inputFingerprint: fingerprint,
          sourcePointCount: preprocessing.diagnostics.sourcePointCount,
          filteredPointCount: preprocessing.diagnostics.filteredPointCount,
          matchedPointCount,
          chunkCount,
          failedChunkCount,
          processedAt: new Date(),
          failureReason,
          diagnostics: diagnostics as unknown as Record<string, unknown>,
        },
        tenant,
      );

      return {
        ok: true,
        action: upsert.action,
        routeQuality,
        matchResult,
      };
    } catch (err) {
      if (err instanceof TripRouteMatchRetryableError) {
        this.tripMetrics && recordTripRouteV2MatchOutcome(this.tripMetrics, 'retryable_failure');
        this.logger.warn(
          `Route matching retryable failure trip=${input.tripId}: ${err.message}`,
        );
        return { ok: false, error: err.message, retryable: true };
      }

      const message = err instanceof Error ? err.message : String(err);
      const retryable = !(
        err instanceof TripRouteArtifactValidationError ||
        err instanceof TripRouteArtifactTenantMismatchError
      );
      this.logger.warn(
        `Route artifact materialization failed trip=${input.tripId} retryable=${retryable}: ${message}`,
      );
      return { ok: false, error: message, retryable };
    }
  }
}
