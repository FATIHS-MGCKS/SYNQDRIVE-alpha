/**
 * VSI P5-H1 immutable profile revision history (disposable PostgreSQL).
 */
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';
import {
  selectVsiProfileRevisionAsOf,
  VsiProfileRevisionAsOfAuthority,
} from './vsi-profile-revision-as-of.resolver';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE } from './vsi-profile-lifecycle.constants';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-p5h1-test' },
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
      ${input.lvBatteryVoltage ?? 12.4},
      null,
      ${input.sourceTimestamp},
      ${input.providerFetchedAt},
      ${input.linkId},
      'DIMO',
      ${raw}::jsonb,
      ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      lv_battery_voltage = EXCLUDED.lv_battery_voltage,
      source_timestamp = EXCLUDED.source_timestamp,
      provider_fetched_at = EXCLUDED.provider_fetched_at,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `;
}

async function cleanupOrg(prisma: PrismaClient, organizationId: string) {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  if (vehicleIds.length > 0) {
    await prisma.vehicleSignalCapabilityProfileRevision.deleteMany({
      where: { organizationId, vehicleId: { in: vehicleIds } },
    });
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

(LIVE ? describe : describe.skip)('VSI P5-H1 profile revision history (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const service = new VsiSignalProfileMaterializationService(prisma as never, declared);
  const historyRepo = new VsiProfileRevisionHistoryRepository(prisma as never);

  const prevHistoryFlag = process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED;

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterEach(() => {
    if (prevHistoryFlag === undefined) {
      delete process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED;
    } else {
      process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED = prevHistoryFlag;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedFixture() {
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
    return { organizationId, fixture };
  }

  it('does not write history when capture gate is OFF', async () => {
    delete process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED;
    const { organizationId, fixture } = await seedFixture();
    const t0 = new Date('2026-10-10T10:00:00.000Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: t0,
      providerFetchedAt: t0,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: t0.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });
    const count = await prisma.vehicleSignalCapabilityProfileRevision.count({
      where: { organizationId },
    });
    expect(count).toBe(0);
    await cleanupOrg(prisma, organizationId);
  });

  it('captures one immutable row per committed profile revision when gate ON', async () => {
    process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED = '1';
    const { organizationId, fixture } = await seedFixture();
    const t0 = new Date('2026-10-10T10:00:00.000Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: t0,
      providerFetchedAt: t0,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: t0.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });
    const t1 = new Date('2026-10-10T11:00:00.000Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: t1,
      providerFetchedAt: t1,
      lvBatteryVoltage: 12.9,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.9, timestamp: t1.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SNAPSHOT_HOOK',
    });

    const profile = await prisma.vehicleSignalCapabilityProfile.findFirstOrThrow({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      },
    });
    expect(profile.profileRevision).toBe(2);

    const revisions = await prisma.vehicleSignalCapabilityProfileRevision.findMany({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      },
      orderBy: { profileRevision: 'asc' },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[0]!.profileRevision).toBe(1);
    expect(revisions[1]!.profileRevision).toBe(2);
    expect(revisions[1]!.contentFingerprint).toBe(profile.contentFingerprint);
    expect(revisions[0]!.recordedAt.getTime()).toBeLessThanOrEqual(
      revisions[1]!.recordedAt.getTime(),
    );

    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SNAPSHOT_HOOK',
    });
    const afterIdempotent = await prisma.vehicleSignalCapabilityProfileRevision.count({
      where: { organizationId, vehicleId: fixture.vehicleId },
    });
    expect(afterIdempotent).toBe(2);

    await cleanupOrg(prisma, organizationId);
  });

  it('records lifecycle limitation revisions without fingerprint change', async () => {
    process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED = '1';
    const { organizationId, fixture } = await seedFixture();
    const t0 = new Date('2026-10-10T10:00:00.000Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: t0,
      providerFetchedAt: t0,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: t0.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });
    const before = await prisma.vehicleSignalCapabilityProfile.findFirstOrThrow({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      },
    });
    await service.appendLifecycleLimitations({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      limitations: [VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE],
    });
    const after = await prisma.vehicleSignalCapabilityProfile.findFirstOrThrow({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      },
    });
    expect(after.profileRevision).toBe(before.profileRevision + 1);
    expect(after.contentFingerprint).toBe(before.contentFingerprint);

    const rev2 = await prisma.vehicleSignalCapabilityProfileRevision.findFirst({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        profileRevision: 2,
      },
    });
    expect(rev2?.materializationTrigger).toBe('SOURCE_LINK_LIFECYCLE');
    expect(rev2?.signalsSnapshot).toEqual(before.signalsSnapshot);

    await cleanupOrg(prisma, organizationId);
  });

  it('supports as-of lookup and rejects decisions before history activation', async () => {
    process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED = '1';
    const { organizationId, fixture } = await seedFixture();
    const t0 = new Date('2026-10-10T10:00:00.000Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: t0,
      providerFetchedAt: t0,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: t0.toISOString() },
      },
    });
    await service.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });

    const rows = await historyRepo.listRevisionsForLink({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    const beforeHistory = selectVsiProfileRevisionAsOf({
      revisions: rows,
      decisionAt: new Date('2026-10-09T00:00:00.000Z'),
      historicalLinkAttributionProven: true,
    });
    expect(beforeHistory.authority).toBe(VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION);

    const revision = rows[0]!;
    const decisionAt = new Date(
      Math.max(revision.recordedAt.getTime(), revision.evaluatedAt.getTime()) + 60_000,
    );
    const atDecision = selectVsiProfileRevisionAsOf({
      revisions: rows,
      decisionAt,
      historicalLinkAttributionProven: true,
    });
    expect(atDecision.authority).toBe(
      VsiProfileRevisionAsOfAuthority.VERIFIED_DECISION_TIME_EVIDENCE,
    );

    await cleanupOrg(prisma, organizationId);
  });

  it('isolates revision history per organization', async () => {
    process.env.VSI_P5H1_PROFILE_REVISION_HISTORY_ENABLED = '1';
    const orgA = await seedFixture();
    const orgB = await seedFixture();
    for (const { organizationId, fixture } of [orgA, orgB]) {
      const t0 = new Date('2026-10-10T10:00:00.000Z');
      await upsertVlsForTest(prisma, {
        vehicleId: fixture.vehicleId,
        linkId: fixture.linkId,
        sourceTimestamp: t0,
        providerFetchedAt: t0,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: t0.toISOString() },
        },
      });
      await service.materializeFromPersistedEvidence({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        lifecycleMode: 'SOURCE_LINK_ACTIVATED',
      });
    }
    const countA = await prisma.vehicleSignalCapabilityProfileRevision.count({
      where: { organizationId: orgA.organizationId },
    });
    const countB = await prisma.vehicleSignalCapabilityProfileRevision.count({
      where: { organizationId: orgB.organizationId },
    });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
    await cleanupOrg(prisma, orgA.organizationId);
    await cleanupOrg(prisma, orgB.organizationId);
  });
});
