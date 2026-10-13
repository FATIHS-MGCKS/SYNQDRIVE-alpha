export {
  VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
  VehicleConnectionModality,
  type VehicleConnectionIdentityRecordV1,
  type VoConnectionIdentityBindingMetadataV1,
  type ModalityVerificationStatus,
} from './vehicle-connection-identity.contract';
export {
  HIGH_MOBILITY_DATA_SOURCE_PROVIDER,
  HIGH_MOBILITY_DATA_SOURCE_TYPE,
} from './high-mobility-data-source-link.contract';
export {
  assessTelemetryConnectionIdentityForActivation,
  assertHardwareDeviceBindingForActivation,
  detectConflictingProviderIdentity,
  isManualOnlySourceSet,
  isTelemetryConnectedSourceRef,
  proposeDefaultConnectionModality,
  type ConnectionIdentityReadinessVerdict,
} from './vehicle-connection-identity.classifier';
export {
  applyVerifiedConnectionIdentityToSnapshot,
  getVerifiedModalityFromSnapshot,
  mergeProposedOnly,
  verifyDimoConnectionFromMirrorEvidence,
  verifyHighMobilityConnectionFromMirrorEvidence,
  verifyManualConnectionEvidence,
} from './connection-modality-verification';
export {
  assertHardwareDeviceBindingFromEvidence,
  assertPersistedSourceLinksMatchSnapshots,
  assertTelemetryConnectionIdentityForActivationTx,
  type PerProviderConnectionIdentityAssessment,
} from './activation-connection-identity.assertions';
