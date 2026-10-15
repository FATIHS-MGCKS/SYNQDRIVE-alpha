import {
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';
import { DIMO_DATA_SOURCE_PROVIDER } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import { VehicleConnectionModality } from '@modules/vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { parseConnectionIdentityFromLinkMetadata } from '@modules/vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import { normalizePhysicalDeviceSerial } from './physical-device-identifier.normalize';

export type ProviderIdentityAuthorityFailure = {
  ok: false;
  reasonCode: string;
  evidence: string[];
};

export type ProviderIdentityAuthoritySuccess = {
  ok: true;
  evidence: string[];
  activeDimoLinkId: string;
  evidenceScope: 'INVENTORY_SERIAL_IDENTITY';
};

export type ProviderIdentityAuthorityResult =
  | ProviderIdentityAuthoritySuccess
  | ProviderIdentityAuthorityFailure;

type PrismaLike = PrismaClient | Prisma.TransactionClient;

function fail(reasonCode: string, evidence: string[]): ProviderIdentityAuthorityFailure {
  return { ok: false, reasonCode, evidence };
}

export async function assertProviderIdentityAuthorityForVerification(
  prisma: PrismaLike,
  input: {
    deviceId: string;
    deviceOwnerOrganizationId: string | null;
    vehicle: {
      id: string;
      organizationId: string;
      dimoVehicleId: string | null;
    };
    modelCode: PhysicalDeviceModelCode;
    inventorySerial: string;
  },
): Promise<ProviderIdentityAuthorityResult> {
  const evidence: string[] = ['evidenceScope:INVENTORY_SERIAL_IDENTITY'];

  if (
    input.deviceOwnerOrganizationId &&
    input.deviceOwnerOrganizationId !== input.vehicle.organizationId
  ) {
    return fail('DEVICE_VEHICLE_ORG_MISMATCH', [
      ...evidence,
      'ownerOrganization:scoped',
      'vehicleOrganization:mismatch',
    ]);
  }

  if (!input.vehicle.dimoVehicleId) {
    return fail('VEHICLE_DIMO_MIRROR_UNLINKED', [...evidence, 'vehicle.dimoVehicleId:null']);
  }

  const dimoLinks = await prisma.vehicleDataSourceLink.findMany({
    where: {
      vehicleId: input.vehicle.id,
      provider: DIMO_DATA_SOURCE_PROVIDER,
    },
    select: {
      id: true,
      dimoVehicleId: true,
      isActive: true,
      metadata: true,
      deactivatedAt: true,
      supersededByLinkId: true,
    },
    orderBy: { activatedAt: 'desc' },
  });

  const activeDimoLinks = dimoLinks.filter((l) => l.isActive && !l.supersededByLinkId);
  if (activeDimoLinks.length === 0) {
    const hadInactive = dimoLinks.some((l) => !l.isActive || l.supersededByLinkId);
    return fail(
      hadInactive ? 'PROVIDER_DIMO_LINK_INACTIVE_OR_SUPERSEDED' : 'PROVIDER_DIMO_LINK_MISSING',
      [
        ...evidence,
        `activeDimoLinks:0`,
        `historicalDimoLinks:${dimoLinks.length}`,
      ],
    );
  }
  if (activeDimoLinks.length > 1) {
    return fail('PROVIDER_DIMO_LINK_AMBIGUOUS', [
      ...evidence,
      `activeDimoLinks:${activeDimoLinks.length}`,
    ]);
  }

  const activeLink = activeDimoLinks[0]!;
  if (activeLink.dimoVehicleId !== input.vehicle.dimoVehicleId) {
    return fail('PROVIDER_DIMO_LINK_VEHICLE_MIRROR_MISMATCH', [
      ...evidence,
      'link.dimoVehicleId:masked',
      'vehicle.dimoVehicleId:masked',
    ]);
  }

  const parsedIdentity = parseConnectionIdentityFromLinkMetadata(activeLink.metadata);
  if (!parsedIdentity) {
    return fail('PROVIDER_CONNECTION_IDENTITY_MISSING', [
      ...evidence,
      `activeDimoLinkId:${activeLink.id}`,
    ]);
  }

  const identity = parsedIdentity.record;
  if (identity.vehicleId && identity.vehicleId !== input.vehicle.id) {
    return fail('PROVIDER_CONNECTION_IDENTITY_VEHICLE_MISMATCH', [
      ...evidence,
      'connectionIdentity.vehicleId:mismatch',
    ]);
  }
  if (identity.organizationId && identity.organizationId !== input.vehicle.organizationId) {
    return fail('PROVIDER_CONNECTION_IDENTITY_ORG_MISMATCH', [
      ...evidence,
      'connectionIdentity.organizationId:mismatch',
    ]);
  }
  if (identity.sourceMirrorId && identity.sourceMirrorId !== input.vehicle.dimoVehicleId) {
    return fail('PROVIDER_CONNECTION_IDENTITY_MIRROR_STALE', [
      ...evidence,
      'connectionIdentity.sourceMirrorId:stale',
    ]);
  }

  const inventoryNorm = input.inventorySerial.trim().toUpperCase();
  if (identity.verifiedModality === VehicleConnectionModality.HARDWARE_DEVICE) {
    const ref = identity.physicalDeviceReference;
    if (typeof ref === 'string' && ref.trim()) {
      const refNorm = ref.trim().toUpperCase();
      if (refNorm !== inventoryNorm) {
        return fail('PROVIDER_CONNECTION_IDENTITY_SERIAL_MISMATCH', [
          ...evidence,
          'connectionIdentity.physicalDeviceReference:mismatch',
        ]);
      }
      evidence.push('connectionIdentity.serial:aligned');
    }
  }

  const serialNorm = normalizePhysicalDeviceSerial(input.inventorySerial, input.modelCode);
  if (serialNorm.canonical) {
    const peers = await prisma.physicalDevice.findMany({
      where: {
        id: { not: input.deviceId },
        modelCode: input.modelCode,
        serialNumber: serialNorm.canonical,
        status: PhysicalDeviceInventoryStatus.INSTALLED,
      },
      select: {
        id: true,
        serialNumber: true,
        modelCode: true,
        assignments: {
          where: { vehicleId: { not: null }, effectiveTo: null },
          take: 1,
          select: { vehicleId: true },
        },
      },
    });
    const conflict = peers.find(
      (p) =>
        p.assignments.some(
          (a) => a.vehicleId && a.vehicleId !== input.vehicle.id,
        ),
    );
    if (conflict) {
      return fail('INVENTORY_SERIAL_ACTIVE_ON_OTHER_VEHICLE', [
        ...evidence,
        'peerDevice:present',
        'peerActiveInstall:other_vehicle',
      ]);
    }
  }

  evidence.push(`activeDimoLinkId:${activeLink.id}`);
  return {
    ok: true,
    evidence,
    activeDimoLinkId: activeLink.id,
    evidenceScope: 'INVENTORY_SERIAL_IDENTITY',
  };
}
