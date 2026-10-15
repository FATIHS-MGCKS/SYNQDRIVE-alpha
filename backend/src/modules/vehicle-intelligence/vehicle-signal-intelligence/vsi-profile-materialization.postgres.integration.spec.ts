/**
 * VSI P0+P1 profile materialization (disposable PostgreSQL).
 */
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-pg-test' },
  syntheticDevice: null,
};

async function cleanupProfiles(prisma: PrismaClient, organizationId: string) {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.vehicleSignalCapabilityProfile.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleDrivingCapability.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleProviderConsent.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

(LIVE ? describe : describe.skip)('VSI signal profile materialization (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const service = new VsiSignalProfileMaterializationService(prisma as never, declared);

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('materializes Ruptela LV declared+observed and bumps revision only on change', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
      metadata: {
        connectionIdentity: {
          version: 'vo-source-link-connection-identity-v1',
          verifiedModality: 'HARDWARE_DEVICE',
          telemetrySourceFamily: 'RUPTELA_R1',
        },
      },
    });

    await prisma.vehicleDrivingCapability.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        hardwareProfile: 'LTE_R1',
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        signalName: 'lowVoltageBatteryCurrentVoltage',
        capabilityKey: 'lowVoltageBatteryCurrentVoltage',
        capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        checkedAt: new Date(),
        capabilityVersion: 'test',
        metadata: { listedInAvailableSignals: true },
      },
    });

    const dimo = await prisma.dimoVehicle.findUnique({
      where: { id: fixture.dimoId },
      select: { tokenId: true },
    });
    const tokenId = dimo?.tokenId ?? 1;

    const ts = new Date('2026-10-15T12:00:00Z');
    await prisma.vehicleLatestState.create({
      data: {
        vehicleId: fixture.vehicleId,
        dimoTokenId: tokenId,
        source: 'dimo',
        providerSource: 'DIMO',
        providerBindingId: fixture.linkId,
        sourceTimestamp: ts,
        providerFetchedAt: new Date('2026-10-15T12:00:01Z'),
        lvBatteryVoltage: 12.5,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: ts.toISOString() },
        },
      },
    });

    const first = await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(first).not.toBeNull();
    const row1 = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(row1?.profileRevision).toBe(1);
    const lv = (row1?.signalsSnapshot as { canonicalSignalKey: string; declaredSupport: string }[]).find(
      (s) => s.canonicalSignalKey === 'lv_voltage',
    );
    expect(lv?.declaredSupport).toBe('LISTED');

    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const row2 = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(row2?.profileRevision).toBe(1);

    await cleanupProfiles(prisma, organizationId);
  });

  it('Tesla software profile: HV observed, LV absent in payload', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      metadata: {
        connectionIdentity: {
          version: 'vo-source-link-connection-identity-v1',
          verifiedModality: 'SOFTWARE_INTEGRATION',
          telemetrySourceFamily: 'API_SYNTHETIC',
        },
      },
    });

    await prisma.vehicleDrivingCapability.createMany({
      data: [
        'lowVoltageBatteryCurrentVoltage',
        'powertrainTractionBatteryStateOfChargeCurrent',
      ].map((signalName) => ({
        organizationId,
        vehicleId: fixture.vehicleId,
        hardwareProfile: 'LTE_R1' as const,
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        signalName,
        capabilityKey: signalName,
        capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        checkedAt: new Date(),
        capabilityVersion: 'test',
        metadata: { listedInAvailableSignals: true },
      })),
    });

    const dimo = await prisma.dimoVehicle.findUnique({
      where: { id: fixture.dimoId },
      select: { tokenId: true },
    });
    const tokenId = dimo?.tokenId ?? 1;

    const ts = new Date('2026-10-15T14:00:00Z');
    await prisma.vehicleLatestState.create({
      data: {
        vehicleId: fixture.vehicleId,
        dimoTokenId: tokenId,
        source: 'dimo',
        providerSource: 'DIMO',
        providerBindingId: fixture.linkId,
        sourceTimestamp: ts,
        providerFetchedAt: new Date('2026-10-15T14:00:01Z'),
        evSoc: 80,
        rawPayloadJson: {
          powertrainTractionBatteryStateOfChargeCurrent: { value: 80, timestamp: ts.toISOString() },
        },
      },
    });

    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    const row = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    const signals = row?.signalsSnapshot as {
      canonicalSignalKey: string;
      empiricalObservation: string;
    }[];
    expect(signals.find((s) => s.canonicalSignalKey === 'hv_battery_soc')?.empiricalObservation).toBe(
      'OBSERVED',
    );
    expect(signals.find((s) => s.canonicalSignalKey === 'lv_voltage')?.empiricalObservation).toBe(
      'NEVER_OBSERVED',
    );

    await cleanupProfiles(prisma, organizationId);
  });

  it('rejects wrong tenant and isolates profiles per source link', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const otherOrg = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });
    const link2 = randomUUID();
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: link2,
        vehicleId: fixture.vehicleId,
        provider: 'DIMO',
        sourceType: 'TELEMETRY',
        isActive: true,
        activatedAt: new Date(),
        metadata: {},
      },
    });

    await prisma.vehicleLatestState.create({
      data: {
        vehicleId: fixture.vehicleId,
        dimoTokenId: 1,
        source: 'dimo',
        providerBindingId: fixture.linkId,
        sourceTimestamp: new Date(),
        providerFetchedAt: new Date(),
      },
    });

    await expect(
      service.getProfileForLink(otherOrg, fixture.vehicleId, fixture.linkId),
    ).rejects.toThrow();

    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: link2,
      requireBindingMatch: true,
    });

    const profiles = await prisma.vehicleSignalCapabilityProfile.findMany({
      where: { organizationId, vehicleId: fixture.vehicleId },
    });
    expect(profiles).toHaveLength(1);

    await cleanupProfiles(prisma, organizationId);
    await cleanupProfiles(prisma, otherOrg);
  });

  it('skips out-of-order source timestamps', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });

    const newer = new Date('2026-10-16T00:00:00Z');
    await prisma.vehicleLatestState.create({
      data: {
        vehicleId: fixture.vehicleId,
        dimoTokenId: 1,
        source: 'dimo',
        providerBindingId: fixture.linkId,
        sourceTimestamp: newer,
        providerFetchedAt: newer,
      },
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    await prisma.vehicleLatestState.update({
      where: { vehicleId: fixture.vehicleId },
      data: {
        sourceTimestamp: new Date('2026-10-10T00:00:00Z'),
        providerFetchedAt: new Date('2026-10-10T00:00:00Z'),
      },
    });

    const skipped = await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(skipped).toBeNull();

    const row = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(row?.lastMaterializedSourceTimestamp?.toISOString()).toBe(newer.toISOString());

    await cleanupProfiles(prisma, organizationId);
  });
});
