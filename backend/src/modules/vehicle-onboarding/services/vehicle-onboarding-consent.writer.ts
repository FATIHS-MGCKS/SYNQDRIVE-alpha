import type { Prisma } from '@prisma/client';
import {
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function materializeDimoConsentIdempotent(
  tx: Tx,
  input: {
    vehicleId: string;
    organizationId: string;
    dimoExternalId: string | null;
    grantedByUserId: string | null;
  },
): Promise<string> {
  const existing = await tx.vehicleProviderConsent.findFirst({
    where: {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      provider: 'DIMO',
      status: VehicleProviderConsentStatus.ACTIVE,
    },
    orderBy: { grantedAt: 'desc' },
  });
  if (existing) return existing.id;

  const created = await tx.vehicleProviderConsent.create({
    data: {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      provider: 'DIMO',
      grantType: VehicleProviderConsentGrantType.DIMO_DIRECT,
      status: VehicleProviderConsentStatus.ACTIVE,
      scopes: ['telemetry', 'location', 'dtc', 'snapshot'],
      grantedByUserId: input.grantedByUserId,
      providerVehicleRef: input.dimoExternalId,
      metadataJson: {
        canonicalOnboarding: true,
        dimoExternalId: input.dimoExternalId,
      },
    },
  });
  return created.id;
}

export async function materializeHmConsentIdempotent(
  tx: Tx,
  input: {
    vehicleId: string;
    organizationId: string;
    hmVehicleId: string;
    hmVin: string | null;
    appContainerType: string | null;
    grantedByUserId: string | null;
    clearanceStatus: string;
  },
): Promise<string> {
  const existing = await tx.vehicleProviderConsent.findFirst({
    where: {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      provider: 'HIGH_MOBILITY',
      status: VehicleProviderConsentStatus.ACTIVE,
    },
    orderBy: { grantedAt: 'desc' },
  });
  if (existing) return existing.id;

  const created = await tx.vehicleProviderConsent.create({
    data: {
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      provider: 'HIGH_MOBILITY',
      grantType: VehicleProviderConsentGrantType.HM_FLEET_CLEARANCE,
      status: VehicleProviderConsentStatus.ACTIVE,
      scopes: ['health', 'tire_pressure', 'service_info'],
      grantedByUserId: input.grantedByUserId,
      providerVehicleRef: input.hmVehicleId,
      metadataJson: {
        canonicalOnboarding: true,
        hmVehicleId: input.hmVehicleId,
        hmVin: input.hmVin,
        appContainerType: input.appContainerType,
        clearanceStatus: input.clearanceStatus,
      },
    },
  });
  return created.id;
}
