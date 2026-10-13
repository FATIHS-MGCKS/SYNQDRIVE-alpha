/**
 * Vehicle Signal Intelligence — contract-only exports (VSI-02).
 * No Nest module registration; no runtime wiring.
 */

export {
  VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
  VsiSignalFamily,
  VsiSignalValueCategory,
  VsiCanonicalUnit,
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  getVsiCanonicalSignalDefinition,
  isVsiCanonicalSignalKey,
  type VsiCanonicalSignalContractVersion,
  type VsiCanonicalSignalKey,
  type VsiCanonicalSignalDefinition,
} from './canonical-signal-keys';

export {
  VSI_EVIDENCE_CONTRACT_VERSION,
  VSI_UNRESOLVED_PROVIDER_SOURCE_LINK_ID,
  VsiProviderCatalogStatus,
  VsiEmpiricalObservationStatus,
  VsiAuthorizationStatus,
  VsiSignalQualityStatus,
  VsiConsumerEligibilityStatus,
  buildVsiEvidenceScopeKey,
  assertDistinctTenantScope,
  deriveProviderCatalogStatus,
  deriveEmpiricalObservationFromSamples,
  deriveAuthorizationFromHttpStatus,
  evaluateStrictSourceAdvance,
  mapBatteryProviderObservationOutcomeToVsiQuality,
  observationStatusDuringSuppressionWindow,
  assertVsiProjectionDoesNotOverwriteHistoricalFields,
  assertCanonicalUnitCompatible,
  type VsiEvidenceContractVersion,
  type VsiProviderSourceLinkRef,
  type VsiMeasuredTimestamp,
  type VsiMultiAxisCapability,
  type VsiEvidenceOrigin,
  type VsiCatalogListingEvidence,
  type VsiEmpiricalObservationEvidence,
  type VsiAuthorizationEvidence,
  type VsiConsumerEligibilityEvidence,
  type VsiVehicleSignalEvidenceDescriptorV1,
  type VsiEvidenceScopeKeyInput,
} from './vehicle-signal-evidence.contract';
