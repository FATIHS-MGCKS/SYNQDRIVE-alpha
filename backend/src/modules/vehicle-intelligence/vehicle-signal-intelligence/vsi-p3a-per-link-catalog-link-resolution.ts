import type { PrismaService } from '../../../shared/database/prisma.service';
import { parseConnectionIdentityFromLinkMetadata } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';

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
  | 'CONNECTION_IDENTITY_SCOPE_MISMATCH';

export async function resolveVerifiedDimoProviderSourceLinkForPreflight(
  prisma: PrismaService,
  input: { organizationId: string; vehicleId: string },
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
  let verifiedModality: string | null = null;
  let connectionIdentityContractVersion: string | null = null;
  if (parsed) {
    const record = parsed.record;
    if (record.organizationId !== input.organizationId || record.vehicleId !== input.vehicleId) {
      return { ok: false, reason: 'CONNECTION_IDENTITY_SCOPE_MISMATCH' };
    }
    verifiedModality = record.verifiedModality;
    connectionIdentityContractVersion = record.contractVersion;
  }

  return {
    ok: true,
    context: {
      providerSourceLinkId: link.id,
      providerIdentity: link.provider || 'DIMO',
      verifiedModality,
      telemetrySourceFamily: null,
      connectionIdentityContractVersion,
    },
  };
}
