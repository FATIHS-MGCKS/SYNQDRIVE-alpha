/**
 * VSI P3A per-link provider catalog axes (disposable PostgreSQL).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import {
  VsiDeclaredCatalogResolver,
  VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION,
} from './vsi-declared-catalog.resolver';
import { VsiP3aPerLinkCatalogRepository } from './vsi-p3a-per-link-catalog.repository';
import { VsiP3aPerLinkCatalogWriterService } from './vsi-p3a-per-link-catalog-writer.service';
import { classifyVsiP3aCatalogAxes } from './vsi-p3a-catalog-axis.classifier';
import {
  VsiProviderCatalogAxisProvenance,
  VsiProviderCatalogSnapshotCompleteness,
} from './vsi-p3a-catalog-axis.contract';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p3a-test' },
  syntheticDevice: null,
};

async function cleanupOrg(prisma: PrismaClient, organizationId: string) {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.vsiProviderCatalogAxis.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

(LIVE ? describe : describe.skip)('VSI P3A per-link catalog (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const repository = new VsiP3aPerLinkCatalogRepository(prisma as never);
  const writer = new VsiP3aPerLinkCatalogWriterService(prisma as never, repository);
  const resolver = new VsiDeclaredCatalogResolver(prisma as never);

  const priorWrite = process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED;
  const priorResolver = process.env.VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED;

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
    process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED = 'true';
    process.env.VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED = priorWrite;
    process.env.VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED = priorResolver;
    return prisma.$disconnect();
  });

  it('persists link-scoped LISTED for speed from complete availableSignals snapshot', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });

    const checkedAt = new Date('2026-10-19T10:00:00.000Z');
    const availableSignals = [
      'speed',
      'powertrainTransmissionTravelledDistance',
      'currentLocationCoordinates',
      'lowVoltageBatteryCurrentVoltage',
    ];

    const result = await writer.persistFromAvailableSignalsPreflight({
      organizationId,
      vehicleId: fixture.vehicleId,
      availableSignals,
      fuelType: 'GASOLINE',
      checkedAt,
      providerError: null,
      preflightMetadata: { test: true },
    });
    expect(result.wrote).toBeGreaterThan(0);

    const snapshot = await resolver.resolveForMaterialization(
      organizationId,
      fixture.vehicleId,
      fixture.linkId,
      'DIMO',
    );
    expect(
      resolver.catalogForCanonicalKey(snapshot, 'vehicle_speed'),
    ).toBe(VsiProviderCatalogStatus.LISTED);

    await cleanupOrg(prisma, organizationId);
  });

  it('rejects out-of-order older catalog checkedAt updates', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });

    const newer = new Date('2026-10-20T10:00:00.000Z');
    const older = new Date('2026-10-19T10:00:00.000Z');

    await writer.persistFromAvailableSignalsPreflight({
      organizationId,
      vehicleId: fixture.vehicleId,
      availableSignals: ['speed'],
      fuelType: 'GASOLINE',
      checkedAt: newer,
      providerError: null,
      preflightMetadata: {},
    });

    await writer.persistFromAvailableSignalsPreflight({
      organizationId,
      vehicleId: fixture.vehicleId,
      availableSignals: [],
      fuelType: 'GASOLINE',
      checkedAt: older,
      providerError: null,
      preflightMetadata: {},
    });

    const row = await prisma.vsiProviderCatalogAxis.findFirst({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerNativeSignalName: 'speed',
      },
    });
    expect(row?.declaredCatalogStatus).toBe('LISTED');

    await cleanupOrg(prisma, organizationId);
  });

  it('isolates multi active link declared catalog per link id', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixtureA = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });

    await prisma.vehicleDataSourceLink.update({
      where: { id: fixtureA.linkId },
      data: { isActive: true },
    });

    const dimoB = await prisma.dimoVehicle.create({
      data: {
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        tokenId: Math.floor(Math.random() * 1_000_000),
        rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      },
    });
    const linkB = await prisma.vehicleDataSourceLink.create({
      data: {
        vehicleId: fixtureA.vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: dimoB.id,
        isActive: true,
      },
    });

    const classifications = classifyVsiP3aCatalogAxes({
      availableSignals: ['speed'],
      fuelType: 'ELECTRIC',
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    });

    await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixtureA.vehicleId,
      link: {
        providerSourceLinkId: fixtureA.linkId,
        providerIdentity: 'DIMO',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: null,
        connectionIdentityContractVersion: null,
      },
      checkedAt: new Date(),
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications,
      metadata: {},
    });

    const snapshotB = await resolver.resolveForMaterialization(
      organizationId,
      fixtureA.vehicleId,
      linkB.id,
      'DIMO',
    );
    expect(snapshotB.limitations).toContain(VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION);
    expect(
      resolver.catalogForCanonicalKey(snapshotB, 'vehicle_speed'),
    ).toBe(VsiProviderCatalogStatus.UNKNOWN);

    await cleanupOrg(prisma, organizationId);
  });

  it('gate OFF keeps legacy resolver semantics', async () => {
    process.env.VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED = 'false';
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });

    await repository.upsertCatalogAxes({
      organizationId,
      vehicleId: fixture.vehicleId,
      link: {
        providerSourceLinkId: fixture.linkId,
        providerIdentity: 'DIMO',
        verifiedModality: null,
        telemetrySourceFamily: null,
        connectionIdentityContractVersion: null,
      },
      checkedAt: new Date(),
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      provenance: VsiProviderCatalogAxisProvenance.DIMO_AVAILABLE_SIGNALS_PREFLIGHT,
      classifications: classifyVsiP3aCatalogAxes({
        availableSignals: ['speed'],
        fuelType: 'GASOLINE',
        catalogSnapshotCompleteness:
          VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
      }),
      metadata: {},
    });

    const snapshot = await resolver.resolveForMaterialization(
      organizationId,
      fixture.vehicleId,
      fixture.linkId,
      'DIMO',
    );
    expect(
      resolver.catalogForCanonicalKey(snapshot, 'vehicle_speed'),
    ).toBe(VsiProviderCatalogStatus.UNKNOWN);

    process.env.VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED = 'true';
    await cleanupOrg(prisma, organizationId);
  });
});
