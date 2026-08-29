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
export type {
  TripRouteArtifactMaterializeInput,
  TripRouteArtifactMaterializeOutcome,
} from './trip-route-artifact-materializer.service';
export { preprocessTripRoute, assertMeasuredVerticesOnly } from './trip-route-preprocessor';
export {
  TRIP_ROUTE_COORD_DECIMALS,
  TRIP_ROUTE_GAP_THRESHOLD_SECONDS,
  TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH,
  TRIP_ROUTE_MEASURED_PROVIDER,
} from './trip-route-preprocessing.constants';
export type {
  MeasuredRoutePoint,
  TripRoutePreprocessingResult,
  TripRoutePreprocessingDiagnostics,
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
