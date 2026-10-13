import {
  BusinessType,
  PrismaClient,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../testing/dimo-mirror-postgres.fixture';

export async function createLegacyReconcileOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `B1 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL },
  });
  return id;
}

export async function insertDimoMirrorRaw(
  prisma: PrismaClient,
  input: {
    id: string;
    externalId: string;
    rawJson: object;
    tokenId?: number | null;
  },
): Promise<void> {
  const raw = JSON.stringify(input.rawJson);
  await prisma.$executeRaw`
    INSERT INTO dimo_vehicles (
      id, external_id, vin, make, model, year, fuel_type, connection_status, raw_json, token_id, created_at, updated_at
    )
    VALUES (
      ${input.id}::text,
      ${input.externalId},
      NULL,
      'Make',
      'Model',
      2021,
      'GASOLINE',
      'CONNECTED'::"DimoConnectionStatus",
      ${raw}::jsonb,
      ${input.tokenId ?? null},
      NOW(),
      NOW()
    )
  `;
}

export async function createLegacyDimoLinkFixture(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    externalId: string;
    rawJson: object;
    tokenId?: number | null;
    registryLifecycle?: VehicleRegistryLifecycle;
    linkActive?: boolean;
    consentStatus?: VehicleProviderConsentStatus;
    consentGrant?: VehicleProviderConsentGrantType;
    metadata?: Record<string, unknown>;
  },
) {
  const vehicleId = randomUUID();
  const dimoId = randomUUID();
  const linkId = randomUUID();
  const consentId = randomUUID();

  await insertDimoMirrorRaw(prisma, {
    id: dimoId,
    externalId: input.externalId,
    rawJson: input.rawJson,
    tokenId: input.tokenId ?? Math.floor(Math.random() * 1_000_000) + 3_000_000,
  });

  const lifecycle = input.registryLifecycle ?? VehicleRegistryLifecycle.ACTIVE;
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type,
      registry_lifecycle, dimo_vehicle_id, created_at, updated_at
    ) VALUES (
      ${vehicleId},
      ${input.organizationId},
      ${vin},
      'Make',
      'Model',
      2021,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      ${lifecycle}::"VehicleRegistryLifecycle",
      ${dimoId},
      NOW(),
      NOW()
    )
  `;

  await prisma.vehicleProviderConsent.create({
    data: {
      id: consentId,
      vehicleId,
      organizationId: input.organizationId,
      provider: 'DIMO',
      grantType: input.consentGrant ?? VehicleProviderConsentGrantType.DIMO_DIRECT,
      status: input.consentStatus ?? VehicleProviderConsentStatus.ACTIVE,
      scopes: [],
    },
  });

  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      dimoVehicleId: dimoId,
      consentId,
      isActive: input.linkActive ?? true,
      metadata: (input.metadata ?? {
        provenance: 'backfill',
        version: 1,
        dimoExternalId: input.externalId,
      }) as object,
    },
  });

  return { vehicleId, dimoId, linkId, consentId };
}

export const B1_TESLA_RAW = VO_PG_DIMO_SOFTWARE_RAW_JSON;

export const B1_RUPTELA_RAW = (serial: string) => ({
  aftermarketDevice: { serial },
});
