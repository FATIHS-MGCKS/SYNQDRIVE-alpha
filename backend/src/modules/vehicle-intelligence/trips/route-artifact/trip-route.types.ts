import type { RouteQuality, VehicleTripRouteArtifact } from '@prisma/client';
import type { TripRouteLngLat } from './trip-route-geometry';

export type { RouteQuality };

/**
 * Canonical route display quality — machine-readable, persisted on the artifact.
 * Processing/job lifecycle is tracked separately (DrivingIntelligenceJob).
 */
export const ROUTE_QUALITIES = ['MATCHED', 'FILTERED', 'RAW'] as const satisfies readonly RouteQuality[];

export type TripRouteUpsertAction = 'CREATED' | 'UPDATED' | 'UNCHANGED';

/** Measured route observation used for fingerprinting and future preprocessing. */
export interface TripRouteInputPoint {
  latitude: number;
  longitude: number;
  /** ISO-8601 timestamp — ordering authority for fingerprint canonicalization. */
  recordedAt: string;
}

export interface TripRouteInputFingerprintInput {
  tripId: string;
  algorithmVersion: string;
  points: TripRouteInputPoint[];
}

export interface TripRouteArtifactWriteInput {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  routeQuality: RouteQuality;
  matchedGeometry?: TripRouteLngLat[] | null;
  filteredGeometry?: TripRouteLngLat[] | null;
  matchConfidence?: number | null;
  matchCoverage?: number | null;
  provider?: string | null;
  algorithmVersion: string;
  inputFingerprint: string;
  sourcePointCount: number;
  filteredPointCount?: number;
  matchedPointCount?: number | null;
  chunkCount?: number | null;
  failedChunkCount?: number | null;
  processedAt?: Date | null;
  failureReason?: string | null;
  diagnostics?: Record<string, unknown> | null;
}

export interface TripRouteArtifactUpsertResult {
  action: TripRouteUpsertAction;
  artifact: VehicleTripRouteArtifact;
  previousFingerprint: string | null;
}

export interface TripRouteArtifactTenantContext {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  tripVehicleId: string;
  vehicleOrganizationId: string;
}
