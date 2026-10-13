/**
 * VO-SIG-01 — Vehicle Onboarding connection identity contract (owned by Vehicle Onboarding).
 *
 * Provider identity and connection modality are separate axes.
 * VSI/APDS must consume classified facts from onboarding — not invent them.
 */

export const VO_CONNECTION_IDENTITY_CONTRACT_VERSION = 'vo-connection-identity-v1' as const;

export type VoConnectionIdentityContractVersion = typeof VO_CONNECTION_IDENTITY_CONTRACT_VERSION;

/** Proposed modality vocabulary — not a Prisma enum. */
export const VehicleConnectionModality = {
  HARDWARE_DEVICE: 'HARDWARE_DEVICE',
  OEM_CLOUD: 'OEM_CLOUD',
  SOFTWARE_INTEGRATION: 'SOFTWARE_INTEGRATION',
  MANUAL_NO_TELEMETRY: 'MANUAL_NO_TELEMETRY',
  UNKNOWN_REQUIRES_REVIEW: 'UNKNOWN_REQUIRES_REVIEW',
} as const;

export type VehicleConnectionModality =
  (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality];

export type VehicleConnectionIdentityRecordV1 = {
  contractVersion: VoConnectionIdentityContractVersion;
  provider: string;
  /** Resolved onboarding source ref / data-source link id when known. */
  providerSourceLinkId: string | 'UNRESOLVED';
  /** Provider-native vehicle identity (DIMO externalId, HM reference, etc.). */
  providerVehicleReference: string;
  classifiedModality: VehicleConnectionModality;
  /** Physical device reference when modality requires hardware — never invented. */
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
  verificationEvidence: readonly string[];
  classifiedAt: string;
  lifecycle: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
  organizationId: string;
  vehicleId: string | 'PRE_ACTIVATION';
};

export type VoConnectionIdentityBindingMetadataV1 = {
  connectionIdentity?: {
    contractVersion: VoConnectionIdentityContractVersion;
    classifiedModality: VehicleConnectionModality;
    provider: string;
    providerVehicleReference: string;
    physicalDeviceReference?: string | 'NOT_APPLICABLE' | 'UNKNOWN';
    deviceBindingRequired?: boolean;
    deviceBindingPresent?: boolean | 'UNKNOWN';
    verificationEvidence?: string[];
    classifiedAt?: string;
  };
};
