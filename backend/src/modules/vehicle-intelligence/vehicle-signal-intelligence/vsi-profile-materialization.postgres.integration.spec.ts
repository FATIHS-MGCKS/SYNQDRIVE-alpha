/**
 * VSI P0+P1 profile materialization (disposable PostgreSQL).
 */
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { areVsiProfileSemanticEvaluationsEquivalent } from './vsi-profile-fingerprint.util';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
  insertDimoMirrorRaw,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-pg-test' },
  syntheticDevice: null,
};

async function upsertVlsForTest(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    linkId: string;
    sourceTimestamp: Date;
    providerFetchedAt: Date;
    lvBatteryVoltage?: number | null;
    evSoc?: number | null;
    rawPayloadJson: object;
  },
): Promise<void> {
  const id = randomUUID();
  const raw = JSON.stringify(input.rawPayloadJson);
  await prisma.$executeRaw`
    INSERT INTO vehicle_latest_states (
      id, vehicle_id, online, lv_battery_voltage, ev_soc, source_timestamp,
      provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
    ) VALUES (
      ${id}::uuid,
      ${input.vehicleId},
      true,
      ${input.lvBatteryVoltage ?? null},
      ${input.evSoc ?? null},
      ${input.sourceTimestamp},
      ${input.providerFetchedAt},
      ${input.linkId},
      'DIMO',
      ${raw}::jsonb,
      ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      lv_battery_voltage = EXCLUDED.lv_battery_voltage,
      ev_soc = EXCLUDED.ev_soc,
      source_timestamp = EXCLUDED.source_timestamp,
      provider_fetched_at = EXCLUDED.provider_fetched_at,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `;
}

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

    const ts = new Date('2026-10-15T12:00:00Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T12:00:01Z'),
      lvBatteryVoltage: 12.5,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: ts.toISOString() },
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

  it('refreshes operational fetch metadata without bumping revision when source evidence is unchanged', async () => {
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

    const sourceTs = new Date('2026-10-15T12:00:00Z');
    const firstFetch = new Date('2026-10-15T12:00:01Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: sourceTs,
      providerFetchedAt: firstFetch,
      lvBatteryVoltage: 12.5,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        speed: { value: 0, timestamp: sourceTs.toISOString() },
      },
    });

    const afterFirst = await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(afterFirst).not.toBeNull();
    const rowAfterFirst = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(rowAfterFirst?.profileRevision).toBe(1);

    const secondFetch = new Date(firstFetch.getTime() + 5_000);
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: sourceTs,
      providerFetchedAt: secondFetch,
      lvBatteryVoltage: 12.5,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.5, timestamp: sourceTs.toISOString() },
        speed: { value: 0, timestamp: sourceTs.toISOString() },
      },
    });

    const afterSecond = await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    expect(afterSecond).not.toBeNull();
    expect(areVsiProfileSemanticEvaluationsEquivalent(rowAfterFirst!, afterSecond!)).toBe(true);

    const row = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(row?.profileRevision).toBe(1);
    expect(row?.lastMaterializedProviderFetchAt?.toISOString()).toBe(secondFetch.toISOString());
    const speed = (row?.signalsSnapshot as { canonicalSignalKey: string; empiricalObservation: string; lastProviderFetchAt: string }[]).find(
      (s) => s.canonicalSignalKey === 'vehicle_speed',
    );
    expect(speed?.empiricalObservation).toBe('OBSERVED');
    expect(speed?.lastProviderFetchAt).toBe(secondFetch.toISOString());

    const revisionCount = await prisma.vehicleSignalCapabilityProfileRevision.count({
      where: { organizationId, vehicleId: fixture.vehicleId, providerSourceLinkId: fixture.linkId },
    });
    expect(revisionCount).toBe(0);

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

    const ts = new Date('2026-10-15T14:00:00Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T14:00:01Z'),
      evSoc: 80,
      rawPayloadJson: {
        powertrainTractionBatteryStateOfChargeCurrent: { value: 80, timestamp: ts.toISOString() },
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
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: new Date(),
      providerFetchedAt: new Date(),
      rawPayloadJson: {},
    });

    await expect(
      service.getProfileForLink(otherOrg, fixture.vehicleId, fixture.linkId),
    ).rejects.toThrow();

    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    const unbound = await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: randomUUID(),
      requireBindingMatch: true,
    });
    expect(unbound).toBeNull();

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
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: newer,
      providerFetchedAt: newer,
      rawPayloadJson: {},
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: new Date('2026-10-10T00:00:00Z'),
      providerFetchedAt: new Date('2026-10-10T00:00:00Z'),
      rawPayloadJson: {},
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

  it('declared catalog UNKNOWN when vehicle has multiple active source links', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });

    const secondDimoId = randomUUID();
    const secondExternalId = `0x${randomUUID().replace(/-/g, '')}`;
    await insertDimoMirrorRaw(prisma, {
      id: secondDimoId,
      externalId: secondExternalId,
      rawJson: RUPTELA_RAW_JSON,
    });
    const secondConsentId = randomUUID();
    await prisma.vehicleProviderConsent.create({
      data: {
        id: secondConsentId,
        vehicleId: fixture.vehicleId,
        organizationId,
        provider: 'DIMO',
        grantType: 'DIMO_DIRECT',
        status: 'ACTIVE',
        scopes: [],
      },
    });
    const secondLinkId = randomUUID();
    await prisma.vehicleDataSourceLink.create({
      data: {
        id: secondLinkId,
        vehicleId: fixture.vehicleId,
        provider: 'DIMO',
        sourceType: 'DIMO',
        sourceSubtype: 'TEST_SECOND_ACTIVE_LINK',
        dimoVehicleId: secondDimoId,
        consentId: secondConsentId,
        isActive: true,
        metadata: { provenance: 'test-second-link' },
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

    const ts = new Date('2026-10-18T10:00:00Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      lvBatteryVoltage: 12.4,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: ts.toISOString() },
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
    const lv = (row?.signalsSnapshot as { canonicalSignalKey: string; declaredSupport: string }[]).find(
      (s) => s.canonicalSignalKey === 'lv_voltage',
    );
    expect(lv?.declaredSupport).toBe('UNKNOWN');
    const limitations = row?.profileLimitations as string[];
    expect(limitations).toContain('MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS');

    await cleanupProfiles(prisma, organizationId);
  });

  it('concurrent materialization keeps revision consistent', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
    });

    const ts = new Date('2026-10-17T08:00:00Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      lvBatteryVoltage: 12.1,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.1, timestamp: ts.toISOString() },
      },
    });

    await Promise.all([
      service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      }),
      service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      }),
    ]);

    const row = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(row?.profileRevision).toBeGreaterThanOrEqual(1);
    expect(row?.profileRevision).toBeLessThanOrEqual(2);

    await cleanupProfiles(prisma, organizationId);
  });
});
