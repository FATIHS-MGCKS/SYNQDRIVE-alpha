/**
 * VO-SIG-01 — Vehicle Onboarding connection identity contract (owned by Vehicle Onboarding).
 */

export const VO_CONNECTION_IDENTITY_CONTRACT_VERSION = 'vo-connection-identity-v1' as const;

export type VoConnectionIdentityContractVersion = typeof VO_CONNECTION_IDENTITY_CONTRACT_VERSION;

export const VehicleConnectionModality = {
  HARDWARE_DEVICE: 'HARDWARE_DEVICE',
  OEM_CLOUD: 'OEM_CLOUD',
  SOFTWARE_INTEGRATION: 'SOFTWARE_INTEGRATION',
  MANUAL_NO_TELEMETRY: 'MANUAL_NO_TELEMETRY',
  UNKNOWN_REQUIRES_REVIEW: 'UNKNOWN_REQUIRES_REVIEW',
} as const;

export type VehicleConnectionModality =
  (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality];

export type ModalityVerificationStatus =
  | 'PROPOSED_ONLY'
  | 'VERIFIED_PROVIDER_EVIDENCE'
  | 'VERIFIED_ADMIN';

export type VoConnectionIdentityBindingMetadataV1 = {
  connectionIdentity?: {
    contractVersion: VoConnectionIdentityContractVersion;
    /** Capture-time hint only — not sufficient for activation. */
    proposedModality: VehicleConnectionModality;
    /** Required for telemetry-connected activation. */
    verifiedModality: VehicleConnectionModality | null;
    modalityVerification: ModalityVerificationStatus;
    provider: string;
    providerVehicleReference: string;
    /** Pre-activation onboarding case source ref id. */
    providerSourceRefId?: string;
    physicalDeviceReference?: string | 'NOT_APPLICABLE' | 'UNKNOWN';
    deviceBindingRequired?: boolean;
    deviceBindingEvidence?: {
      source: 'DIMO_TELEMETRY_SOURCE_FAMILY';
      telemetrySourceFamily: 'RUPTELA_R1' | 'API_SYNTHETIC' | 'UNKNOWN';
      deviceSerial: string | null;
    } | null;
    verificationEvidence?: string[];
    classifiedAt?: string;
    /** @deprecated P0 — use verifiedModality; ignored for activation. */
    classifiedModality?: VehicleConnectionModality;
    deviceBindingPresent?: boolean | 'UNKNOWN';
  };
};

export type VehicleConnectionIdentityRecordV1 = {
  contractVersion: VoConnectionIdentityContractVersion;
  provider: string;
  providerSourceLinkId: string | 'UNRESOLVED';
  providerSourceRefId?: string;
  providerVehicleReference: string;
  proposedModality: VehicleConnectionModality;
  verifiedModality: VehicleConnectionModality;
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
  verificationEvidence: readonly string[];
  classifiedAt: string;
  lifecycle: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
  organizationId: string;
  vehicleId: string | 'PRE_ACTIVATION';
};
