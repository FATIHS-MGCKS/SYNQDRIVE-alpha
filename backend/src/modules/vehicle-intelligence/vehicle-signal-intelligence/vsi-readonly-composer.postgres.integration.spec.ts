/**
 * VSI-03 P1 read-only composer PostgreSQL integration.
 * Run: VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-readonly-composer.postgres.integration --runInBand
 */
import { PrismaClient, BusinessType, VehicleRegistryLifecycle } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

async function createOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: {
      id,
      companyName: `VSI03 ${id.slice(0, 8)}`,
      businessType: BusinessType.RENTAL,
    },
  });
  return id;
}

async function createVehicle(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  lifecycle: VehicleRegistryLifecycle = VehicleRegistryLifecycle.ACTIVE,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, registry_lifecycle, hardware_type, created_at, updated_at
    ) VALUES (
      ${vehicleId}, ${organizationId}, ${`VIN${vehicleId.replace(/-/g, '').slice(0, 14)}`},
      'Tesla', 'M3', 2022, 'ELECTRIC'::"FuelType",
      ${lifecycle}::"VehicleRegistryLifecycle", 'LTE_R1'::"HardwareType", NOW(), NOW()
    )
  `;
}

function connectionIdentityMetadata(linkId: string, org: string, veh: string, modality: string) {
  return {
    connectionIdentity: {
      version: VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION,
      contractVersion: 'vo-connection-identity-v1',
      origin: 'LEGACY_RECONCILIATION',
      providerSourceLinkId: linkId,
      provider: 'DIMO',
      verifiedModality: modality,
      physicalDeviceReference:
        modality === VehicleConnectionModality.SOFTWARE_INTEGRATION
          ? 'NOT_APPLICABLE'
          : 'R1-test',
      verificationEvidence:
        modality === VehicleConnectionModality.SOFTWARE_INTEGRATION
          ? ['DIMO_RAW_JSON:API_SYNTHETIC']
          : ['DIMO_RAW_JSON:RUPTELA_R1'],
      organizationId: org,
      vehicleId: veh,
    },
  };
}

async function cleanupOrg(prisma: PrismaClient, organizationId: string): Promise<void> {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.dimoPollLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

(LIVE ? describe : describe.skip)('VsiReadonlySignalComposerService (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const service = new VsiReadonlySignalComposerService(prisma as unknown as PrismaService);
  const orgIdsToCleanup: string[] = [];

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterEach(async () => {
    while (orgIdsToCleanup.length > 0) {
      const orgId = orgIdsToCleanup.pop();
      if (orgId) {
        await cleanupOrg(prisma, orgId);
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('composes tenant-scoped signals with zero writes', async () => {
    const orgA = await createOrg(prisma);
    const orgB = await createOrg(prisma);
    orgIdsToCleanup.push(orgA, orgB);
    const vehicleA = randomUUID();
    const vehicleB = randomUUID();
    await createVehicle(prisma, orgA, vehicleA);
    await createVehicle(prisma, orgB, vehicleB);

    const linkId = randomUUID();
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: linkId,
        vehicleId: vehicleA,
        provider: 'DIMO',
        sourceType: 'DIMO',
        isActive: true,
        metadata: connectionIdentityMetadata(
          linkId,
          orgA,
          vehicleA,
          VehicleConnectionModality.SOFTWARE_INTEGRATION,
        ),
      },
    });

    await prisma.vehicleLatestState.create({
      data: {
        vehicleId: vehicleA,
        online: true,
        lvBatteryVoltage: null,
        evSoc: 72,
        sourceTimestamp: new Date(),
        providerFetchedAt: new Date(),
        providerBindingId: linkId,
        rawPayloadJson: {},
      },
    });

    const beforeLinks = await prisma.vehicleDataSourceLink.count();
    const beforeStates = await prisma.vehicleLatestState.count();

    const result = await service.composeVehicleSignals({
      organizationId: orgA,
      vehicleId: vehicleA,
    });

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.identityProjections[0].treatsAsPhysicalHardwareDevice).toBe(false);

    await expect(
      service.composeVehicleSignals({ organizationId: orgB, vehicleId: vehicleA }),
    ).rejects.toThrow();

    const afterLinks = await prisma.vehicleDataSourceLink.count();
    const afterStates = await prisma.vehicleLatestState.count();
    expect(afterLinks).toBe(beforeLinks);
    expect(afterStates).toBe(beforeStates);
  });

  it('Ruptela hardware link projects physical hardware identity', async () => {
    const org = await createOrg(prisma);
    orgIdsToCleanup.push(org);
    const vehicleId = randomUUID();
    await createVehicle(prisma, org, vehicleId);
    const linkId = randomUUID();
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: linkId,
        vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        isActive: true,
        metadata: connectionIdentityMetadata(
          linkId,
          org,
          vehicleId,
          VehicleConnectionModality.HARDWARE_DEVICE,
        ),
      },
    });

    const result = await service.composeVehicleSignals({
      organizationId: org,
      vehicleId,
    });
    expect(result.identityProjections[0].treatsAsPhysicalHardwareDevice).toBe(true);
    expect(result.identityProjections[0].telemetrySourceFamily).toBe('RUPTELA_R1');
  });
});
