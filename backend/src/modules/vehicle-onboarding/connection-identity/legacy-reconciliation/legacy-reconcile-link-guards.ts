import type { Prisma } from '@prisma/client';
import {
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { DIMO_DATA_SOURCE_PROVIDER, DIMO_DATA_SOURCE_TYPE } from '@modules/dimo/dimo-vehicle-data-source-link.contract';

const CONSENT_PROVIDER = 'DIMO';

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

  const consent = await tx.vehicleProviderConsent.findUnique({
    where: { id: link.consentId },
  });
  if (!consent) {
    throw new Error('GUARD_CONSENT_MISSING');
  }
  if (consent.vehicleId !== ctx.vehicleId || consent.organizationId !== ctx.organizationId) {
    throw new Error('GUARD_CONSENT_OWNERSHIP_MISMATCH');
  }
  if (consent.provider !== CONSENT_PROVIDER) {
    throw new Error('GUARD_CONSENT_PROVIDER_MISMATCH');
  }
  if (consent.grantType !== VehicleProviderConsentGrantType.DIMO_DIRECT) {
    throw new Error('GUARD_CONSENT_GRANT_MISMATCH');
  }
  if (consent.status !== VehicleProviderConsentStatus.ACTIVE) {
    throw new Error('GUARD_CONSENT_NOT_ACTIVE');
  }
  if (consent.revokedAt) {
    throw new Error('GUARD_CONSENT_REVOKED');
  }
  if (consent.expiresAt && consent.expiresAt.getTime() <= ctx.now.getTime()) {
    throw new Error('GUARD_CONSENT_EXPIRED');
  }
  const providerRef = consent.providerVehicleRef?.trim();
  const mirrorExt = link.dimoVehicle.externalId?.trim();
  if (providerRef && mirrorExt && providerRef !== mirrorExt) {
    throw new Error('GUARD_CONSENT_PROVIDER_VEHICLE_REF_MISMATCH');
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
    lastVerifiedAt: link.lastVerifiedAt,
    dimoVehicleId: link.dimoVehicleId,
    dimoExternalId: link.dimoVehicle.externalId,
    consentId: link.consentId,
  };
}
