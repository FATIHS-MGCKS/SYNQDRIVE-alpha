import type { Prisma } from '@prisma/client';
import { VehicleRegistryLifecycle } from '@prisma/client';
import { DIMO_DATA_SOURCE_PROVIDER, DIMO_DATA_SOURCE_TYPE } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import { validateLegacyReconcileConsent } from './legacy-reconcile-consent';
import { lockLegacyReconcileDependencyRows } from './legacy-reconcile-transaction-locks';
import {
  classifyLinkMetadataStorage,
  type LinkMetadataStorageState,
} from './legacy-reconcile-metadata-snapshot';

export type LegacyReconcileGuardContext = {
  organizationId: string;
  vehicleId: string;
  sourceLinkId: string;
  now: Date;
};

export async function assertLegacyReconcileLinkGuards(
  tx: Prisma.TransactionClient,
  ctx: LegacyReconcileGuardContext,
): Promise<{
  metadata: Prisma.JsonValue | null;
  metadataStorageState: LinkMetadataStorageState;
  lastVerifiedAt: Date | null;
  dimoVehicleId: string;
  dimoExternalId: string;
  consentId: string;
}> {
  const link = await tx.vehicleDataSourceLink.findFirst({
    where: { id: ctx.sourceLinkId },
    select: {
      id: true,
      vehicleId: true,
      provider: true,
      sourceType: true,
      isActive: true,
      dimoVehicleId: true,
      metadata: true,
      lastVerifiedAt: true,
      consentId: true,
      vehicle: {
        select: {
          id: true,
          organizationId: true,
          registryLifecycle: true,
          dimoVehicleId: true,
        },
      },
      dimoVehicle: {
        select: { id: true, externalId: true },
      },
    },
  });

  if (!link) {
    throw new Error('GUARD_LINK_MISSING');
  }
  if (link.vehicleId !== ctx.vehicleId) {
    throw new Error('GUARD_VEHICLE_MISMATCH');
  }
  if (link.vehicle.organizationId !== ctx.organizationId) {
    throw new Error('GUARD_ORGANIZATION_MISMATCH');
  }
  if (link.vehicle.registryLifecycle !== VehicleRegistryLifecycle.ACTIVE) {
    throw new Error('GUARD_VEHICLE_NOT_ACTIVE');
  }
  if (!link.isActive) {
    throw new Error('GUARD_LINK_INACTIVE');
  }
  if (link.provider !== DIMO_DATA_SOURCE_PROVIDER || link.sourceType !== DIMO_DATA_SOURCE_TYPE) {
    throw new Error('GUARD_PROVIDER_MISMATCH');
  }
  if (!link.dimoVehicleId || !link.dimoVehicle) {
    throw new Error('GUARD_DIMO_MIRROR_MISSING');
  }
  if (link.vehicle.dimoVehicleId && link.vehicle.dimoVehicleId !== link.dimoVehicleId) {
    throw new Error('GUARD_VEHICLE_DIMO_BINDING_MISMATCH');
  }
  if (!link.consentId) {
    throw new Error('GUARD_CONSENT_MISSING');
  }

  await lockLegacyReconcileDependencyRows(tx, {
    organizationId: ctx.organizationId,
    vehicleId: ctx.vehicleId,
    sourceLinkId: ctx.sourceLinkId,
    consentId: link.consentId,
    dimoVehicleId: link.dimoVehicleId,
  });

  const consent = await tx.vehicleProviderConsent.findUnique({
    where: { id: link.consentId },
  });
  const consentVerdict = validateLegacyReconcileConsent({
    consent,
    vehicleId: ctx.vehicleId,
    organizationId: ctx.organizationId,
    dimoExternalId: link.dimoVehicle.externalId,
    now: ctx.now,
  });
  if (!consentVerdict.ok) {
    throw new Error(`GUARD_${consentVerdict.reasonCode}`);
  }

  const crossTenant = await tx.vehicleDataSourceLink.findFirst({
    where: {
      provider: DIMO_DATA_SOURCE_PROVIDER,
      sourceType: DIMO_DATA_SOURCE_TYPE,
      dimoVehicleId: link.dimoVehicleId,
      isActive: true,
      id: { not: ctx.sourceLinkId },
      vehicle: { organizationId: { not: ctx.organizationId } },
    },
    select: { id: true },
  });
  if (crossTenant) {
    throw new Error('GUARD_DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT');
  }

  return {
    metadata: link.metadata,
    metadataStorageState: classifyLinkMetadataStorage(link.metadata),
    lastVerifiedAt: link.lastVerifiedAt,
    dimoVehicleId: link.dimoVehicleId,
    dimoExternalId: link.dimoVehicle.externalId,
    consentId: link.consentId,
  };
}
