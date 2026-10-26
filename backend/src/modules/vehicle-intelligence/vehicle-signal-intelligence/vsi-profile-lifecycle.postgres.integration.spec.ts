/**
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
 * VSI P2 lifecycle outbox + automatic profile initialization (disposable PostgreSQL).
 */
import {
  PrismaClient,
  DrivingCapabilityStatus,
  VsiProfileLifecycleOutboxStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import { VsiProfileLifecycleEnqueueService } from './vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';
import { planActiveVehicleProfileBackfill } from './vsi-profile-lifecycle.backfill';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
  insertDimoMirrorRaw,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import {
  VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE,
  VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED,
  VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS,
} from './vsi-profile-lifecycle.constants';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-lifecycle-test' },
  syntheticDevice: null,
};

const connectionIdentityRuptela = {
  version: 'vo-source-link-connection-identity-v1',
  verifiedModality: 'HARDWARE_DEVICE',
  telemetrySourceFamily: 'RUPTELA_R1',
};

const connectionIdentityTesla = {
  version: 'vo-source-link-connection-identity-v1',
  verifiedModality: 'SOFTWARE_INTEGRATION',
  telemetrySourceFamily: 'DIMO_SOFTWARE',
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
      ${input.lvBatteryVoltage ?? null},
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

(LIVE ? describe : describe.skip)('VSI P2 profile lifecycle (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared, createNoopVsiProfileCadenceEvidenceLoader());
  const outboxRepo = new VsiProfileLifecycleOutboxRepository(prisma as never);
  const enqueue = new VsiProfileLifecycleEnqueueService(outboxRepo);
  const processor = new VsiProfileLifecycleOutboxProcessor(
    prisma as never,
    outboxRepo,
    materialization,
    enqueue,
  );

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupOrg(organizationId: string) {
    await prisma.vsiProfileLifecycleOutbox.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const ids = vehicles.map((v) => v.id);
    if (ids.length) {
      await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDrivingCapability.deleteMany({ where: { organizationId } });
      await prisma.vehicleProviderConsent.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }

  async function ruptelaFixture(organizationId: string) {
    return createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW_JSON,
      metadata: { connectionIdentity: connectionIdentityRuptela },
    });
  }

  it('initializes Ruptela R1 profile on SOURCE_LINK_ACTIVATED without telemetry', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);

    const occurredAt = new Date('2026-10-15T12:00:00.000Z');
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: { activatedAt: occurredAt },
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
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        checkedAt: occurredAt,
        capabilityVersion: 'test',
        metadata: { listedInAvailableSignals: true },
      },
    });

    await enqueue.enqueueSourceLinkActivated({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt,
      reason: 'ruptela_onboarding_test',
    });

    const results = await processor.processPendingBatch(10);
    expect(results.some((r) => r.outcome === 'completed')).toBe(true);

    const profile = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(profile).not.toBeNull();
    expect(profile?.profileRevision).toBe(1);
    const lv = (profile?.signalsSnapshot as { canonicalSignalKey: string; declaredSupport: string }[]).find(
      (s) => s.canonicalSignalKey === 'lv_voltage',
    );
    expect(lv?.declaredSupport).toBe('LISTED');

    await cleanupOrg(organizationId);
  });

  it('initializes Tesla software declared-only profile without LV observations', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      metadata: { connectionIdentity: connectionIdentityTesla },
    });

    await prisma.vehicleDrivingCapability.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        hardwareProfile: 'LTE_R1',
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        signalName: 'speed',
        capabilityKey: 'speed',
        capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
        checkedAt: new Date('2026-10-15T11:00:00.000Z'),
        firstSeenAt: new Date('2026-10-15T11:00:00.000Z'),
        lastSeenAt: new Date('2026-10-15T11:00:00.000Z'),
        capabilityVersion: 'test',
        metadata: { listedInAvailableSignals: true },
      },
    });

    await enqueue.enqueueSourceLinkActivated({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt: new Date(),
      reason: 'tesla_software_onboarding_test',
    });
    await processor.processPendingBatch(10);

    const profile = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(profile).not.toBeNull();
    const snapshot = profile?.signalsSnapshot as Array<{
      canonicalSignalKey: string;
      empiricalObservation: string;
    }>;
    const lv = snapshot?.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.empiricalObservation).toBe('NEVER_OBSERVED');

    await cleanupOrg(organizationId);
  });

  it('is idempotent for replayed lifecycle enqueue keys', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);
    const occurredAt = new Date('2026-10-15T13:00:00.000Z');
    const key = enqueue.buildSourceLinkActivatedKey(fixture.linkId, occurredAt);
    await enqueue.enqueue({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      eventType: 'SOURCE_LINK_ACTIVATED',
      occurredAt,
      idempotencyKey: key,
    });
    await enqueue.enqueue({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      eventType: 'SOURCE_LINK_ACTIVATED',
      occurredAt,
      idempotencyKey: key,
    });
    const rows = await prisma.vsiProfileLifecycleOutbox.count({
      where: { organizationId },
    });
    expect(rows).toBe(1);
    await cleanupOrg(organizationId);
  });

  it('appends deactivation limitations without deleting historical profile', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);

    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });

    const before = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });

    const deactivatedAt = new Date('2026-10-15T15:00:00.000Z');
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: { isActive: false, deactivatedAt },
    });

    await enqueue.enqueueSourceLinkDeactivated({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt: deactivatedAt,
      reason: 'test_deactivate',
    });
    await processor.processPendingBatch(10);

    const after = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.profileRevision).toBeGreaterThan(before.profileRevision);
    expect(after.signalsSnapshot).toEqual(before.signalsSnapshot);
    const limitations = after.profileLimitations as string[];
    expect(limitations).toContain(VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE);

    await cleanupOrg(organizationId);
  });

  it('enforces tenant isolation on profile scope keys', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const fixtureA = await ruptelaFixture(orgA);

    await expect(
      prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId: orgB,
            vehicleId: fixtureA.vehicleId,
            providerSourceLinkId: fixtureA.linkId,
          },
        },
      }),
    ).resolves.toBeNull();

    await cleanupOrg(orgA);
    await cleanupOrg(orgB);
  });

  it('claims outbox rows with lease and recovers stale PROCESSING claims', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);
    const occurredAt = new Date('2026-10-15T10:00:00.000Z');
    await enqueue.enqueueSourceLinkActivated({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt,
    });

    const [claimed] = await outboxRepo.claimPendingBatch(1, 'worker-a');
    expect(claimed.claimToken).toBeTruthy();
    expect(claimed.status).toBe(VsiProfileLifecycleOutboxStatus.PROCESSING);

    const stale = new Date(Date.now() - 1_000);
    await prisma.vsiProfileLifecycleOutbox.update({
      where: { id: claimed.id },
      data: { claimExpiresAt: stale },
    });

    const [reclaimed] = await outboxRepo.claimPendingBatch(1, 'worker-b');
    expect(reclaimed.id).toBe(claimed.id);
    expect(reclaimed.claimToken).not.toBe(claimed.claimToken);

    const wrongComplete = await outboxRepo.markCompleted(claimed.id, claimed.claimToken);
    expect(wrongComplete).toBe(false);

    await outboxRepo.markCompleted(reclaimed.id, reclaimed.claimToken);
    const row = await prisma.vsiProfileLifecycleOutbox.findUniqueOrThrow({
      where: { id: claimed.id },
    });
    expect(row.status).toBe(VsiProfileLifecycleOutboxStatus.COMPLETED);

    await cleanupOrg(organizationId);
  });

  it('ignores stale deactivation after reactivation', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);
    const activatedAt = new Date('2026-10-15T12:00:00.000Z');
    const deactivatedAt = new Date('2026-10-15T14:00:00.000Z');
    const reactivatedAt = new Date('2026-10-15T16:00:00.000Z');

    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });

    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: {
        isActive: true,
        activatedAt: reactivatedAt,
        deactivatedAt: null,
      },
    });

    await enqueue.enqueue({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      eventType: 'SOURCE_LINK_DEACTIVATED',
      occurredAt: deactivatedAt,
      idempotencyKey: `test-stale-deact:${fixture.linkId}:${deactivatedAt.toISOString()}`,
    });
    await processor.processPendingBatch(10);

    const profile = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    const limitations = profile.profileLimitations as string[];
    expect(limitations).not.toContain(VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE);

    await cleanupOrg(organizationId);
  });

  it('does not attribute foreign VLS binding to lifecycle-init profile', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);

    const secondDimoId = randomUUID();
    await insertDimoMirrorRaw(prisma, {
      id: secondDimoId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
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
        metadata: { connectionIdentity: connectionIdentityRuptela },
      },
    });

    const ts = new Date('2026-10-15T12:00:00.000Z');
    await upsertVlsForTest(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: new Date('2026-10-15T12:00:01.000Z'),
      lvBatteryVoltage: 13.1,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 13.1, timestamp: ts.toISOString() },
      },
    });

    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: secondLinkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });

    const profile = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: secondLinkId,
        },
      },
    });
    const snapshot = profile.signalsSnapshot as Array<{
      canonicalSignalKey: string;
      empiricalObservation: string;
    }>;
    expect(snapshot.find((s) => s.canonicalSignalKey === 'lv_voltage')?.empiricalObservation).toBe(
      'NEVER_OBSERVED',
    );

    await cleanupOrg(organizationId);
  });

  it('schedules bounded backfill continuation across batches', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const anchor = await ruptelaFixture(organizationId);
    await ruptelaFixture(organizationId);

    const { nextCursor, processed } = await planActiveVehicleProfileBackfill({
      organizationId,
      materialization,
      cursor: null,
      maxLinks: 1,
    });
    expect(processed).toBe(1);
    expect(nextCursor).toBeTruthy();

    await enqueue.enqueueBackfillContinuation({
      organizationId,
      vehicleId: anchor.vehicleId,
      cursor: nextCursor!,
      occurredAt: new Date(),
    });
    await processor.processPendingBatch(5);

    const profiles = await prisma.vehicleSignalCapabilityProfile.count({
      where: { organizationId },
    });
    expect(profiles).toBe(2);

    const continuationRows = await prisma.vsiProfileLifecycleOutbox.count({
      where: {
        organizationId,
        eventType: 'ACTIVE_VEHICLE_BACKFILL_RECONCILE',
      },
    });
    expect(continuationRows).toBeGreaterThanOrEqual(1);

    await cleanupOrg(organizationId);
  });

  it('records superseded limitation for provider replacement', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });

    const supersededAt = new Date('2026-10-15T17:00:00.000Z');
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: { isActive: false, deactivatedAt: supersededAt },
    });

    await enqueue.enqueueSourceLinkDeactivated({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt: supersededAt,
      reason: 'replaced',
      supersededByLinkId: randomUUID(),
    });
    await processor.processPendingBatch(5);

    const profile = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    const limitations = profile.profileLimitations as string[];
    expect(limitations).toContain(VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_SUPERSEDED);

    await cleanupOrg(organizationId);
  });

  it('leaves max-attempt failures inspectable in FAILED status', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await ruptelaFixture(organizationId);
    const row = await prisma.vsiProfileLifecycleOutbox.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        eventType: 'SOURCE_LINK_ACTIVATED',
        idempotencyKey: `test-fail:${randomUUID()}`,
        payload: { version: 1, providerSourceLinkId: fixture.linkId },
        occurredAt: new Date(),
        attempts: VSI_PROFILE_LIFECYCLE_OUTBOX_MAX_ATTEMPTS - 1,
        status: VsiProfileLifecycleOutboxStatus.PENDING,
      },
    });

    const [claimed] = await outboxRepo.claimPendingBatch(1, 'worker');
    expect(claimed.id).toBe(row.id);
    await outboxRepo.markFailed(claimed.id, claimed.claimToken, 'forced_terminal_failure');

    const failed = await prisma.vsiProfileLifecycleOutbox.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(failed.status).toBe(VsiProfileLifecycleOutboxStatus.FAILED);
    expect(failed.lastError).toContain('forced_terminal_failure');

    await cleanupOrg(organizationId);
  });
});
