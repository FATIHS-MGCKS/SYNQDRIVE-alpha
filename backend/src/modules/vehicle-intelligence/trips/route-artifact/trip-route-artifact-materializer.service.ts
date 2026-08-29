import { Injectable, Logger } from '@nestjs/common';
import {
  buildTripRouteInputFingerprintInput,
  computeTripRouteInputFingerprint,
} from './trip-route-input-fingerprint';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import { TRIP_ROUTE_MEASURED_PROVIDER } from './trip-route-preprocessing.constants';
import { preprocessTripRoute } from './trip-route-preprocessor';
import type { TripRouteInputPoint } from './trip-route.types';
import {
  TripRouteArtifactTenantMismatchError,
  VehicleTripRouteArtifactRepository,
} from './vehicle-trip-route-artifact.repository';
import { TripRouteArtifactValidationError } from './trip-route-artifact.validation';

export interface TripRouteArtifactMaterializeInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  points: TripRouteInputPoint[];
  provider?: string;
}

export type TripRouteArtifactMaterializeOutcome =
  | { ok: true; action: 'CREATED' | 'UPDATED' | 'UNCHANGED'; routeQuality: 'FILTERED' | 'RAW' }
  | { ok: false; error: string; retryable: boolean };

@Injectable()
export class TripRouteArtifactMaterializerService {
  private readonly logger = new Logger(TripRouteArtifactMaterializerService.name);

  constructor(
    private readonly artifactRepository: VehicleTripRouteArtifactRepository,
  ) {}

  /**
   * Preprocess measured route input and persist canonical RAW/FILTERED artifact.
   * Retryable failures return { ok: false, retryable: true } for caller propagation.
   */
  async materializeFromMeasuredRoute(
    input: TripRouteArtifactMaterializeInput,
  ): Promise<TripRouteArtifactMaterializeOutcome> {
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

      const upsert = await this.artifactRepository.upsertRouteArtifact(
        {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          routeQuality: preprocessing.quality,
          matchedGeometry: null,
          filteredGeometry: preprocessing.filteredGeometry,
          matchConfidence: null,
          matchCoverage: null,
          provider: input.provider ?? TRIP_ROUTE_MEASURED_PROVIDER,
          algorithmVersion: TRIP_ROUTE_ALGORITHM_VERSION,
          inputFingerprint: fingerprint,
          sourcePointCount: preprocessing.diagnostics.sourcePointCount,
          filteredPointCount: preprocessing.diagnostics.filteredPointCount,
          matchedPointCount: null,
          chunkCount: null,
          failedChunkCount: null,
          processedAt: new Date(),
          failureReason: preprocessing.diagnostics.fallbackReason,
          diagnostics: preprocessing.diagnostics as unknown as Record<string, unknown>,
        },
        tenant,
      );

      return {
        ok: true,
        action: upsert.action,
        routeQuality: preprocessing.quality,
      };
    } catch (err) {
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
