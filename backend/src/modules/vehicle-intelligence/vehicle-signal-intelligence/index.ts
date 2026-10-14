/**
 * Vehicle Signal Intelligence — VSI-02 contracts + VSI-03 P1 read-only composer.
 */

export {
  VSI_CANONICAL_SIGNAL_CONTRACT_VERSION,
  VsiSignalFamily,
  VsiSignalValueCategory,
  VsiCanonicalUnit,
  VSI_CANONICAL_SIGNAL_DEFINITIONS,
  getVsiCanonicalSignalDefinition,
  isVsiCanonicalSignalKey,
  evaluateCanonicalProviderNativeAlias,
  type VsiCanonicalSignalContractVersion,
  type VsiCanonicalSignalKey,
  type VsiCanonicalSignalDefinition,
  type VsiCanonicalAliasMappingVerdict,
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
  formatProviderSourceLinkScopeSegment,
  assertDistinctTenantScope,
  assertProviderIdentityForScope,
  VsiAuthorizationRequestKind,
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
  type VsiProviderIdentity,
  type VsiAuthorizationHttpContext,
} from './vehicle-signal-evidence.contract';

export {
  VSI_READONLY_COMPOSER_VERSION,
  VSI_P1_SIGNAL_KEYS,
  type VsiP1SignalKey,
  type VsiReadonlyComposerRequest,
  type VsiReadonlyComposerResult,
  type VsiConnectionIdentityProjection,
} from './vsi-readonly-composer.types';

export { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
export { projectConnectionIdentitiesFromLinks } from './vsi-connection-identity-projection';
export { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
export { VsiReadonlySignalComposerModule } from './vsi-readonly-composer.module';
export {
  VSI_APDS_ADAPTER_CONTRACT_VERSION,
  projectVsiEvidenceForApdsReadonlyCorrelation,
  type VsiApdsReadonlyAdapterView,
} from './vsi-apds-consumer.adapter.contract';
