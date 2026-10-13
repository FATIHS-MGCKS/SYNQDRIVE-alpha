import { createHash } from 'node:crypto';
import type { DeviceBindingAssuranceLevel } from '../device-binding-assurance';
import {
  VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
  type VehicleConnectionModality,
} from '../vehicle-connection-identity.contract';
import {
  VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION,
  type VoSourceLinkConnectionIdentityMetadataV1,
} from '../source-link-connection-identity.metadata';

export const VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION =
  'vo-source-link-connection-identity-v2' as const;

export type ConnectionIdentityRecordOrigin =
  | 'ONBOARDING_ACTIVATION'
  | 'LEGACY_RECONCILIATION';

export type ConnectionIdentityPreActivationScope =
  | 'ONBOARDING_CASE_SOURCE_REF'
  | 'LEGACY_NO_ONBOARDING_SOURCE_REF';

export type LegacyReconciliationProvenanceV1 = {
  runId: string;
  authorizationReference: string;
  operatorReference?: string | null;
  evidenceCheckedAt: string;
  dryRunManifestFingerprint?: string | null;
  productionReleaseSha?: string | null;
};

export type SourceEvidenceFingerprintV1 = {
  rawJsonSha256: string;
  externalId: string;
  tokenId: number | null;
  dimoMirrorId: string;
};

/** Physical episode proof is separate from provider mirror assurance (B0/B1). */
export type PhysicalEpisodeAttestationV1 = {
  independentlyProven: false;
  reason: 'PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF';
};

export type VoSourceLinkConnectionIdentityMetadataV2 = {
  version: typeof VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION;
  contractVersion: typeof VO_CONNECTION_IDENTITY_CONTRACT_VERSION;
  origin: ConnectionIdentityRecordOrigin;
  preActivationScope: ConnectionIdentityPreActivationScope;
  /** Present for ONBOARDING_ACTIVATION only; null for legacy reconciliation. */
  preActivationProviderSourceRefId: string | null;
  providerSourceLinkId: string;
  provider: string;
  sourceMirrorId: string;
  providerVehicleReference: string;
  proposedModality: VehicleConnectionModality | null;
  verifiedModality: VehicleConnectionModality;
  modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE' | 'VERIFIED_ADMIN';
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
  deviceBindingAssurance?: DeviceBindingAssuranceLevel | null;
  providerDeviceIdHash?: string | null;
  dimoTokenId?: number | null;
  verificationEvidence: string[];
  /** When identity was verified (activation or reconciliation execution time). */
  verifiedAt: string;
  /** Prior link.lastVerifiedAt when trustworthy; omitted when unknown or misleading. */
  priorLinkLastVerifiedAt?: string | null;
  organizationId: string;
  vehicleId: string;
  sourceEvidenceFingerprint: SourceEvidenceFingerprintV1;
  physicalEpisodeAttestation: PhysicalEpisodeAttestationV1;
  reconciliationProvenance?: LegacyReconciliationProvenanceV1;
};

export type ParsedConnectionIdentityMetadata =
  | { kind: 'v1'; record: VoSourceLinkConnectionIdentityMetadataV1 }
  | { kind: 'v2'; record: VoSourceLinkConnectionIdentityMetadataV2 };

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

export function fingerprintLinkMetadata(metadata: unknown): string {
  return createHash('sha256').update(JSON.stringify(metadata ?? null)).digest('hex');
}

export function buildLegacyReconciliationConnectionIdentityV2(input: {
  link: { id: string };
  organizationId: string;
  vehicleId: string;
  dimo: {
    id: string;
    externalId: string;
    tokenId: number | null;
    rawJson: unknown;
  };
  verifiedModality: VehicleConnectionModality;
  modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE' | 'VERIFIED_ADMIN';
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
  deviceBindingAssurance?: DeviceBindingAssuranceLevel | null;
  providerDeviceIdHash?: string | null;
  verificationEvidence: string[];
  verifiedAt: Date;
  priorLinkLastVerifiedAt?: Date | null;
  reconciliationProvenance: LegacyReconciliationProvenanceV1;
}): VoSourceLinkConnectionIdentityMetadataV2 {
  const verifiedAtIso = input.verifiedAt.toISOString();
  return {
    version: VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION,
    contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
    origin: 'LEGACY_RECONCILIATION',
    preActivationScope: 'LEGACY_NO_ONBOARDING_SOURCE_REF',
    preActivationProviderSourceRefId: null,
    providerSourceLinkId: input.link.id,
    provider: 'DIMO',
    sourceMirrorId: input.dimo.id,
    providerVehicleReference: input.dimo.externalId.trim(),
    proposedModality: null,
    verifiedModality: input.verifiedModality,
    modalityVerification: input.modalityVerification,
    physicalDeviceReference: input.physicalDeviceReference,
    deviceBindingAssurance: input.deviceBindingAssurance ?? null,
    providerDeviceIdHash: input.providerDeviceIdHash ?? null,
    dimoTokenId: input.dimo.tokenId,
    verificationEvidence: [...input.verificationEvidence],
    verifiedAt: verifiedAtIso,
    priorLinkLastVerifiedAt: input.priorLinkLastVerifiedAt?.toISOString() ?? null,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    sourceEvidenceFingerprint: {
      rawJsonSha256: sha256CanonicalJson(input.dimo.rawJson),
      externalId: input.dimo.externalId.trim(),
      tokenId: input.dimo.tokenId,
      dimoMirrorId: input.dimo.id,
    },
    physicalEpisodeAttestation: {
      independentlyProven: false,
      reason: 'PROVIDER_MIRROR_ONLY_NOT_EPISODE_PROOF',
    },
    reconciliationProvenance: input.reconciliationProvenance,
  };
}

export function isOnboardingActivationConnectionIdentity(
  record: VoSourceLinkConnectionIdentityMetadataV1 | VoSourceLinkConnectionIdentityMetadataV2,
): boolean {
  if (record.version === VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION) {
    return record.origin === 'ONBOARDING_ACTIVATION';
  }
  return Boolean(record.preActivationProviderSourceRefId);
}

export function parseConnectionIdentityFromLinkMetadata(
  metadata: unknown,
): ParsedConnectionIdentityMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const ci = (metadata as { connectionIdentity?: unknown }).connectionIdentity;
  if (!ci || typeof ci !== 'object' || Array.isArray(ci)) return null;
  const version = (ci as { version?: string }).version;
  if (version === VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION) {
    return { kind: 'v2', record: ci as VoSourceLinkConnectionIdentityMetadataV2 };
  }
  if (version === VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION) {
    return { kind: 'v1', record: ci as VoSourceLinkConnectionIdentityMetadataV1 };
  }
  return null;
}
