export {
  mapDimoProviderSignalToCanonical,
  mapDimoProviderSignalBatch,
  listCanonicalDrivingSignalKeys,
} from './canonical-driving-signal-mapper';
export {
  CANONICAL_DRIVING_SIGNAL_CATALOG,
  findCanonicalSignalDefinition,
  isEvPowertrain,
  isSignalApplicableForFuelType,
} from './canonical-driving-signal-mapper.config';
export {
  CANONICAL_DRIVING_SIGNAL_MAPPING_VERSION,
  CANONICAL_SIGNAL_PROVIDER_SOURCE,
  type CanonicalDrivingSignalKey,
  type CanonicalDrivingSignalMappingFailure,
  type CanonicalDrivingSignalMappingResult,
  type CanonicalDrivingSignalMappingSuccess,
  type CanonicalSignalMappingContext,
  type CanonicalSignalUnit,
  type CanonicalSignalUsageScope,
  type DimoProviderSignalSample,
} from './canonical-driving-signal-mapper.types';
