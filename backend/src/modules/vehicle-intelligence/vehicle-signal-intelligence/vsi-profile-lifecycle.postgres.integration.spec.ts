/**
 * VSI P2 lifecycle outbox + automatic profile initialization (disposable PostgreSQL).
 */
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiProfileLifecycleOutboxRepository } from './vsi-profile-lifecycle-outbox.repository';
import { VsiProfileLifecycleEnqueueService } from './vsi-profile-lifecycle-enqueue.service';
import { VsiProfileLifecycleOutboxProcessor } from './vsi-profile-lifecycle.processor';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';
import { VSI_PROFILE_LIFECYCLE_LIMITATION_SOURCE_LINK_INACTIVE } from './vsi-profile-lifecycle.constants';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW_JSON = {
  aftermarketDevice: { id: 'R1-lifecycle-test' },
  syntheticDevice: null,
};

(LIVE ? describe : describe.skip)('VSI P2 profile lifecycle (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared);
  const outboxRepo = new VsiProfileLifecycleOutboxRepository(prisma as never);
  const enqueue = new VsiProfileLifecycleEnqueueService(outboxRepo);
  const processor = new VsiProfileLifecycleOutboxProcessor(outboxRepo, materialization);

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
      await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDrivingCapability.deleteMany({ where: { organizationId } });
      await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }

  it('initializes Ruptela R1 profile on SOURCE_LINK_ACTIVATED without telemetry', async () => {
    const org = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId: org.id,
      connectionIdentity: {
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'RUPTELA_R1',
      },
      dimoMirrorRawJson: RUPTELA_RAW_JSON,
    });

    const occurredAt = new Date('2026-10-15T12:00:00.000Z');
    await enqueue.enqueueSourceLinkActivated({
      organizationId: org.id,
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
          organizationId: org.id,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });
    expect(profile).not.toBeNull();
    expect(profile?.telemetrySourceFamily).toBe('RUPTELA_R1');

    await cleanupOrg(org.id);
  });

  it('initializes Tesla software declared-only profile without LV observations', async () => {
    const org = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId: org.id,
      connectionIdentity: {
        verifiedModality: 'SOFTWARE_INTEGRATION',
        telemetrySourceFamily: 'DIMO_SOFTWARE',
      },
      dimoMirrorRawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
    });

    await prisma.vehicleDrivingCapability.create({
      data: {
        organizationId: org.id,
        vehicleId: fixture.vehicleId,
        providerSource: DRIVING_CAPABILITY_PROVIDER,
        capabilityKey: 'speed',
        capabilityStatus: DrivingCapabilityStatus.AVAILABLE,
        hardwareProfile: 'EV',
        checkedAt: new Date('2026-10-15T11:00:00.000Z'),
        firstSeenAt: new Date('2026-10-15T11:00:00.000Z'),
        lastSeenAt: new Date('2026-10-15T11:00:00.000Z'),
        capabilityVersion: 1,
      },
    });

    await enqueue.enqueueSourceLinkActivated({
      organizationId: org.id,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt: new Date(),
      reason: 'tesla_software_onboarding_test',
    });
    await processor.processPendingBatch(10);

    const profile = await prisma.vehicleSignalCapabilityProfile.findUnique({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId: org.id,
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

    await cleanupOrg(org.id);
  });

  it('is idempotent for replayed lifecycle enqueue keys', async () => {
    const org = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId: org.id,
      dimoMirrorRawJson: RUPTELA_RAW_JSON,
    });
    const occurredAt = new Date('2026-10-15T13:00:00.000Z');
    const key = enqueue.buildSourceLinkActivatedKey(fixture.linkId, occurredAt);
    await enqueue.enqueue({
      organizationId: org.id,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      eventType: 'SOURCE_LINK_ACTIVATED',
      occurredAt,
      idempotencyKey: key,
    });
    await enqueue.enqueue({
      organizationId: org.id,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      eventType: 'SOURCE_LINK_ACTIVATED',
      occurredAt,
      idempotencyKey: key,
    });
    const rows = await prisma.vsiProfileLifecycleOutbox.count({
      where: { organizationId: org.id },
    });
    expect(rows).toBe(1);
    await cleanupOrg(org.id);
  });

  it('appends deactivation limitations without deleting historical profile', async () => {
    const org = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId: org.id,
      dimoMirrorRawJson: RUPTELA_RAW_JSON,
    });

    await materialization.materializeFromPersistedEvidence({
      organizationId: org.id,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      lifecycleMode: 'SOURCE_LINK_ACTIVATED',
    });

    const before = await prisma.vehicleSignalCapabilityProfile.findUniqueOrThrow({
      where: {
        organizationId_vehicleId_providerSourceLinkId: {
          organizationId: org.id,
          vehicleId: fixture.vehicleId,
          providerSourceLinkId: fixture.linkId,
        },
      },
    });

    await enqueue.enqueueSourceLinkDeactivated({
      organizationId: org.id,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      occurredAt: new Date(),
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

    await cleanupOrg(org.id);
  });

  it('enforces tenant isolation on profile scope keys', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    const fixtureA = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA.id,
      dimoMirrorRawJson: RUPTELA_RAW_JSON,
    });

    await expect(
      prisma.vehicleSignalCapabilityProfile.findUnique({
        where: {
          organizationId_vehicleId_providerSourceLinkId: {
            organizationId: orgB.id,
            vehicleId: fixtureA.vehicleId,
            providerSourceLinkId: fixtureA.linkId,
          },
        },
      }),
    ).resolves.toBeNull();

    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });
});
