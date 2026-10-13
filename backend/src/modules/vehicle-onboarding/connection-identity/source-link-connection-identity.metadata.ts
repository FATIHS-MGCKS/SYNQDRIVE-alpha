import type { Prisma, VehicleDataSourceLink, VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';
import { getVerifiedModalityFromSnapshot } from './connection-modality-verification';
import type { PerProviderConnectionIdentityAssessment } from './activation-connection-identity.assertions';
import {
  VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
  type VehicleConnectionModality,
} from './vehicle-connection-identity.contract';
import type { DeviceBindingAssuranceLevel } from './device-binding-assurance';
import { parseConnectionIdentityFromLinkMetadata } from './legacy-reconciliation/connection-identity-metadata-v2';

export const VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION = 'vo-source-link-connection-identity-v1' as const;

export type VoSourceLinkConnectionIdentityMetadataV1 = {
  version: typeof VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION;
  contractVersion: typeof VO_CONNECTION_IDENTITY_CONTRACT_VERSION;
  /** Canonical active VehicleDataSourceLink.id — not the onboarding case source ref id. */
  providerSourceLinkId: string;
  preActivationProviderSourceRefId: string;
  provider: string;
  providerVehicleReference: string;
  sourceMirrorId: string;
  proposedModality: VehicleConnectionModality | null;
  verifiedModality: VehicleConnectionModality;
  modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE' | 'VERIFIED_ADMIN';
  physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
  deviceBindingAssurance?: DeviceBindingAssuranceLevel | null;
  providerDeviceIdHash?: string | null;
  dimoTokenId?: number | null;
  verificationEvidence: string[];
  verifiedAt: string;
  organizationId: string;
  vehicleId: string;
};

export function buildSourceLinkConnectionIdentityMetadata(
  input: {
    link: Pick<VehicleDataSourceLink, 'id'>;
    assessment: PerProviderConnectionIdentityAssessment;
    organizationId: string;
    vehicleId: string;
    sourceMirrorId: string;
    snapBinding: {
      proposedModality?: VehicleConnectionModality | null;
      modalityVerification?: 'VERIFIED_PROVIDER_EVIDENCE' | 'VERIFIED_ADMIN';
    } | null;
  },
): VoSourceLinkConnectionIdentityMetadataV1 {
  const verifiedAt = new Date().toISOString();
  return {
    version: VO_SOURCE_LINK_CONNECTION_IDENTITY_VERSION,
    contractVersion: VO_CONNECTION_IDENTITY_CONTRACT_VERSION,
    providerSourceLinkId: input.link.id,
    preActivationProviderSourceRefId: input.assessment.providerSourceRefId,
    provider: input.assessment.provider,
    providerVehicleReference: input.assessment.providerVehicleReference,
    sourceMirrorId: input.sourceMirrorId,
    proposedModality: input.snapBinding?.proposedModality ?? null,
    verifiedModality: input.assessment.verifiedModality as VehicleConnectionModality,
    modalityVerification:
      input.snapBinding?.modalityVerification ?? 'VERIFIED_PROVIDER_EVIDENCE',
    physicalDeviceReference: input.assessment.physicalDeviceReference,
    deviceBindingAssurance:
      input.assessment.deviceBindingEvidence?.assurance ?? null,
    providerDeviceIdHash: input.assessment.deviceBindingEvidence?.providerDeviceIdHash ?? null,
    dimoTokenId: input.assessment.deviceBindingEvidence?.dimoTokenId ?? null,
    verificationEvidence: input.assessment.evidence,
    verifiedAt,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  };
}

function readSnapBinding(ref: VehicleOnboardingCaseSourceRef) {
  const snap = parseValidatedSourceSnapshot(ref);
  const meta = snap.bindingMetadata as {
    connectionIdentity?: {
      proposedModality?: VehicleConnectionModality;
      modalityVerification?: 'VERIFIED_PROVIDER_EVIDENCE' | 'VERIFIED_ADMIN';
    };
  };
  return meta?.connectionIdentity ?? null;
}

export async function persistConnectionIdentityOnActiveSourceLinksTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    sourceRefs: VehicleOnboardingCaseSourceRef[];
    assessments: PerProviderConnectionIdentityAssessment[];
  },
): Promise<void> {
  const links = await tx.vehicleDataSourceLink.findMany({
    where: { vehicleId: input.vehicleId, isActive: true },
  });

  for (const assessment of input.assessments) {
    const ref = input.sourceRefs.find((r) => r.id === assessment.providerSourceRefId);
    if (!ref?.sourceMirrorId) continue;

    let link: VehicleDataSourceLink | undefined;
    if (assessment.provider === 'DIMO') {
      link = links.find(
        (l) => l.sourceType === 'DIMO' && l.dimoVehicleId === ref.sourceMirrorId,
      );
    } else if (assessment.provider === 'HIGH_MOBILITY') {
      link = links.find(
        (l) =>
          l.sourceType === 'HIGH_MOBILITY' && l.sourceReferenceId === ref.sourceMirrorId,
      );
    }
    if (!link) continue;

    const snapBinding = readSnapBinding(ref);
    const connectionIdentity = buildSourceLinkConnectionIdentityMetadata({
      link,
      assessment: {
        ...assessment,
        providerVehicleReference: ref.externalVehicleIdentity,
      },
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sourceMirrorId: ref.sourceMirrorId,
      snapBinding,
    });

    const existing =
      link.metadata && typeof link.metadata === 'object' && !Array.isArray(link.metadata)
        ? (link.metadata as Record<string, unknown>)
        : {};
    await tx.vehicleDataSourceLink.update({
      where: { id: link.id },
      data: {
        metadata: {
          ...existing,
          connectionIdentity,
        } as Prisma.InputJsonValue,
        lastVerifiedAt: new Date(),
      },
    });
  }
}

export function readConnectionIdentityFromLinkMetadata(
  metadata: unknown,
): VoSourceLinkConnectionIdentityMetadataV1 | null {
  const parsed = parseConnectionIdentityFromLinkMetadata(metadata);
  if (!parsed || parsed.kind !== 'v1') return null;
  return parsed.record;
}

export function readConnectionIdentityFromLinkMetadataV2(
  metadata: unknown,
): import('./legacy-reconciliation/connection-identity-metadata-v2').VoSourceLinkConnectionIdentityMetadataV2 | null {
  const parsed = parseConnectionIdentityFromLinkMetadata(metadata);
  if (!parsed || parsed.kind !== 'v2') return null;
  return parsed.record;
}
