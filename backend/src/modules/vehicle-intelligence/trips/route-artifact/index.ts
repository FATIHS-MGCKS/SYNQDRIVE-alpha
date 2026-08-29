export { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
export {
  canonicalizeTripRouteInputPoints,
  computeTripRouteInputFingerprint,
  buildTripRouteInputFingerprintInput,
} from './trip-route-input-fingerprint';
export {
  parseTripRouteGeometryJson,
  serializeTripRouteGeometry,
  isValidLngLatPair,
  type TripRouteLngLat,
} from './trip-route-geometry';
export {
  validateTripRouteArtifactWrite,
  resolveStoredRouteQuality,
  TripRouteArtifactValidationError,
} from './trip-route-artifact.validation';
export {
  VehicleTripRouteArtifactRepository,
  assertTripRouteArtifactTenantContext,
  TripRouteArtifactTenantMismatchError,
} from './vehicle-trip-route-artifact.repository';
export { TripRouteArtifactMaterializerService } from './trip-route-artifact-materializer.service';
export { TripRouteCanonicalReadService } from './trip-route-canonical-read.service';
export {
  splitFilteredGeometryByGaps,
  splitMatchedGeometryByBoundaries,
  splitGeometryAtGapBoundaries,
  splitWaypointGeometryByTimestamps,
  toMultiLineStringGeometry,
} from './trip-route-segment-geometry';
export { deriveRouteProcessingState } from './trip-route-processing-state';
export type {
  CanonicalTripRouteResponse,
  CanonicalTripRouteSpeedPoint,
  CanonicalTripRouteGeometry,
  RouteProcessingState,
  RouteContinuityStatus,
} from './trip-route-canonical-read.types';
export type {
  TripRouteArtifactMaterializeInput,
  TripRouteArtifactMaterializeOutcome,
} from './trip-route-artifact-materializer.service';
export { preprocessTripRoute, assertMeasuredVerticesOnly } from './trip-route-preprocessor';
export {
  selectWaypointsForPersistence,
  routePointsToTripRouteInputPoints,
  waypointsToTripRouteInputPoints,
  computeFingerprintFromWaypoints,
} from './trip-route-measured-waypoints';
export type {
  TripRouteWaypointFidelity,
  PersistedTripWaypointRow,
} from './trip-route-measured-waypoints';
export {
  TRIP_ROUTE_BOUNDED_WAYPOINT_MAX,
  TRIP_ROUTE_CANONICAL_WAYPOINT_MAX,
  TRIP_ROUTE_COORD_DECIMALS,
  TRIP_ROUTE_GAP_THRESHOLD_SECONDS,
  TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH,
  TRIP_ROUTE_MEASURED_PROVIDER,
} from './trip-route-preprocessing.constants';
export type {
  MeasuredRoutePoint,
  TripRoutePreprocessingResult,
  TripRoutePreprocessingDiagnostics,
  TripRouteTelemetryGap,
} from './trip-route-preprocessing.types';
export type {
  RouteQuality,
  TripRouteInputPoint,
  TripRouteInputFingerprintInput,
  TripRouteArtifactWriteInput,
  TripRouteArtifactUpsertResult,
  TripRouteArtifactTenantContext,
  TripRouteUpsertAction,
} from './trip-route.types';
