import type { PrismaService } from '../../../shared/database/prisma.service';
import { resolveTelemetrySourceFamily } from '../telemetry-source-family';
import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { evaluateLegacyDimoLinkProviderEvidence } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-connection-identity-evidence';
import {
  buildLegacyReconciliationConnectionIdentityV2,
  parseConnectionIdentityFromLinkMetadata,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import { validateConnectionIdentityForLink } from './vsi-connection-identity-projection';
import { inferTelemetrySourceFamilyFromEvidence } from './vsi-connection-identity-projection';

export type VsiP3aVerifiedDimoLinkContext = {
  providerSourceLinkId: string;
  providerIdentity: string;
  verifiedModality: string | null;
  telemetrySourceFamily: string | null;
  connectionIdentityContractVersion: string | null;
};

export type VsiP3aLinkResolutionFailure =
  | 'NO_ACTIVE_DIMO_LINK'
  | 'MULTIPLE_ACTIVE_DIMO_LINKS'
  | 'VEHICLE_NOT_FOUND'
  | 'LINK_VEHICLE_MISMATCH'
  | 'ORGANIZATION_MISMATCH'
  | 'DIMO_VEHICLE_BINDING_MISMATCH'
  | 'CONNECTION_IDENTITY_MISSING'
  | 'CONNECTION_IDENTITY_UNSUPPORTED_VERSION'
  | 'CONNECTION_IDENTITY_SCOPE_MISMATCH'
  | 'PROVIDER_TOKEN_BINDING_MISMATCH'
  | 'PROVIDER_MIRROR_EVIDENCE_MISMATCH'
  | 'MODALITY_PROVIDER_EVIDENCE_CONFLICT';

function resolveIdentityTokenId(record: {
  dimoTokenId?: number | null;
  sourceEvidenceFingerprint?: { tokenId?: number | null };
}): number | null {
  if (typeof record.dimoTokenId === 'number' && Number.isFinite(record.dimoTokenId)) {
    return record.dimoTokenId;
  }
  const fromFingerprint = record.sourceEvidenceFingerprint?.tokenId;
  if (typeof fromFingerprint === 'number' && Number.isFinite(fromFingerprint)) {
    return fromFingerprint;
  }
  return null;
}

export async function resolveVerifiedDimoProviderSourceLinkForPreflight(
  prisma: PrismaService,
  input: { organizationId: string; vehicleId: string; dimoTokenId: number },
): Promise<
  | { ok: true; context: VsiP3aVerifiedDimoLinkContext }
  | { ok: false; reason: VsiP3aLinkResolutionFailure }
> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: input.vehicleId, organizationId: input.organizationId },
    select: {
      id: true,
      organizationId: true,
      dimoVehicleId: true,
      dimoVehicle: { select: { id: true, tokenId: true, externalId: true } },
    },
  });
  if (!vehicle) {
    return { ok: false, reason: 'VEHICLE_NOT_FOUND' };
  }

  const activeLinks = await prisma.vehicleDataSourceLink.findMany({
    where: {
      vehicleId: input.vehicleId,
      isActive: true,
      provider: 'DIMO',
    },
    select: {
      id: true,
      provider: true,
      vehicleId: true,
      dimoVehicleId: true,
      metadata: true,
      dimoVehicle: { select: { id: true, externalId: true, tokenId: true, rawJson: true } },
    },
  });

  if (activeLinks.length === 0) {
    return { ok: false, reason: 'NO_ACTIVE_DIMO_LINK' };
  }
  if (activeLinks.length > 1) {
    return { ok: false, reason: 'MULTIPLE_ACTIVE_DIMO_LINKS' };
  }

  const link = activeLinks[0]!;
  if (link.vehicleId !== vehicle.id) {
    return { ok: false, reason: 'LINK_VEHICLE_MISMATCH' };
  }

  if (vehicle.dimoVehicleId && link.dimoVehicleId && vehicle.dimoVehicleId !== link.dimoVehicleId) {
    return { ok: false, reason: 'DIMO_VEHICLE_BINDING_MISMATCH' };
  }

  const parsed = parseConnectionIdentityFromLinkMetadata(link.metadata);
  if (!parsed) {
    return { ok: false, reason: 'CONNECTION_IDENTITY_MISSING' };
  }
  if (parsed.kind !== 'v2') {
    return { ok: false, reason: 'CONNECTION_IDENTITY_UNSUPPORTED_VERSION' };
  }

  const record = parsed.record;
  const scopeFailures = validateConnectionIdentityForLink({
    record,
    link: {
      id: link.id,
      provider: link.provider,
      metadata: link.metadata,
      isActive: true,
    },
    scope: { organizationId: input.organizationId, vehicleId: input.vehicleId },
  });
  if (scopeFailures.length > 0) {
    return { ok: false, reason: 'CONNECTION_IDENTITY_SCOPE_MISMATCH' };
  }

  const mirrorTokenId = link.dimoVehicle?.tokenId ?? vehicle.dimoVehicle?.tokenId ?? null;
  const identityTokenId = resolveIdentityTokenId(record);
  if (
    mirrorTokenId == null ||
    identityTokenId == null ||
    mirrorTokenId !== input.dimoTokenId ||
    identityTokenId !== input.dimoTokenId ||
    mirrorTokenId !== identityTokenId
  ) {
    return { ok: false, reason: 'PROVIDER_TOKEN_BINDING_MISMATCH' };
  }

  const dimoVehicleId = link.dimoVehicleId ?? vehicle.dimoVehicleId;
  const externalId =
    record.providerVehicleReference?.trim() ||
    link.dimoVehicle?.externalId?.trim() ||
    vehicle.dimoVehicle?.externalId?.trim() ||
    '';
  if (!dimoVehicleId || !externalId) {
    return { ok: false, reason: 'PROVIDER_MIRROR_EVIDENCE_MISMATCH' };
  }

  const evidence = await evaluateLegacyDimoLinkProviderEvidence(prisma, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    linkId: link.id,
    dimoVehicleId,
    externalId,
  });
  if (!evidence.ok) {
    return { ok: false, reason: 'PROVIDER_MIRROR_EVIDENCE_MISMATCH' };
  }

  if (record.verifiedModality !== evidence.verifiedModality) {
    return { ok: false, reason: 'MODALITY_PROVIDER_EVIDENCE_CONFLICT' };
  }

  const familyFromMirror = resolveTelemetrySourceFamily(link.dimoVehicle?.rawJson);
  if (familyFromMirror === 'API_SYNTHETIC') {
    if (record.verifiedModality !== VehicleConnectionModality.SOFTWARE_INTEGRATION) {
      return { ok: false, reason: 'MODALITY_PROVIDER_EVIDENCE_CONFLICT' };
    }
  } else if (familyFromMirror === 'RUPTELA_R1') {
    if (record.verifiedModality !== VehicleConnectionModality.HARDWARE_DEVICE) {
      return { ok: false, reason: 'MODALITY_PROVIDER_EVIDENCE_CONFLICT' };
    }
  }

  const telemetryFromIdentity = inferTelemetrySourceFamilyFromEvidence(
    record.verificationEvidence,
  );
  const telemetrySourceFamily =
    telemetryFromIdentity === 'UNKNOWN' ? evidence.telemetrySourceFamily : telemetryFromIdentity;

  return {
    ok: true,
    context: {
      providerSourceLinkId: link.id,
      providerIdentity: link.provider || 'DIMO',
      verifiedModality: record.verifiedModality,
      telemetrySourceFamily,
      connectionIdentityContractVersion: record.contractVersion,
    },
  };
}

/** Test/fixture helper — builds v2 connection identity bound to link + DIMO mirror. */
export function buildP3aVerifiedConnectionIdentityMetadata(input: {
  linkId: string;
  organizationId: string;
  vehicleId: string;
  dimo: { id: string; externalId: string; tokenId: number | null; rawJson: unknown };
  verifiedModality: (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality];
  verificationEvidence: string[];
  verifiedAt: Date;
}) {
  return {
    connectionIdentity: buildLegacyReconciliationConnectionIdentityV2({
      link: { id: input.linkId },
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      dimo: input.dimo,
      verifiedModality: input.verifiedModality,
      modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
      physicalDeviceReference:
        input.verifiedModality === VehicleConnectionModality.HARDWARE_DEVICE
          ? 'RUPTELA_DEVICE'
          : 'NOT_APPLICABLE',
      verificationEvidence: input.verificationEvidence,
      verifiedAt: input.verifiedAt,
      reconciliationProvenance: {
        runId: 'p3a-test',
        authorizationReference: 'p3a-test',
        evidenceCheckedAt: input.verifiedAt.toISOString(),
      },
    }),
  };
}
