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
export type {
  RouteQuality,
  TripRouteInputPoint,
  TripRouteInputFingerprintInput,
  TripRouteArtifactWriteInput,
  TripRouteArtifactUpsertResult,
  TripRouteArtifactTenantContext,
  TripRouteUpsertAction,
} from './trip-route.types';
