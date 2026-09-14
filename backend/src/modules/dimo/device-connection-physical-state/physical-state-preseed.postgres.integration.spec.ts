import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from '@config/connectivity-physical-state.config';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStatePreseedService } from './physical-state-preseed.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import type { PhysicalStatePreseedScope } from './physical-state-preseed.types';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  type PhysicalStatePostgresFixture,
} from './testing/physical-state-postgres.integration.harness';

const LIVE =
  process.env.PHYSICAL_STATE_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRED = process.env.PHYSICAL_STATE_POSTGRES_REQUIRED === '1';
const describePg = LIVE ? describe : describe.skip;

if (REQUIRED && !LIVE) {
  throw new Error(
    'PHYSICAL_STATE_POSTGRES_REQUIRED=1 but DATABASE_URL / PHYSICAL_STATE_POSTGRES_INTEGRATION not configured',
  );
}

describePg('PhysicalStatePreseedService (postgres)', () => {
  let prisma: PrismaClient;
  let preseed: PhysicalStatePreseedService;
  let writer: PhysicalStateEvidenceWriterService;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  const T1 = '2026-08-01T10:00:00.000Z';
  const T2 = '2026-09-12T15:02:29.000Z';
  const T3 = '2026-09-12T16:27:51.000Z';

  function scope(): PhysicalStatePreseedScope {
    return {
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
    };
  }

  async function countSideEffectArtifacts() {
    const [episodes, outbox, events, authority] = await Promise.all([
      prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } }),
      prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
      prisma.dimoDeviceConnectionEvent.count({ where: { vehicleId: fixture.vehicle.id } }),
      prisma.deviceConnectionPhysicalAuthorityCutover.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ]);
    return { episodes, outbox, events, authority };
  }

  async function createWebhookEvent(input: {
    tokenId: number;
    eventType: 'OBD_DEVICE_PLUGGED_IN' | 'OBD_DEVICE_UNPLUGGED';
    observedAt: string;
  }) {
    const observedAt = new Date(input.observedAt);
    await prisma.dimoDeviceConnectionEvent.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: input.tokenId,
        provider: 'DIMO',
        eventType: input.eventType,
        observedAt,
        receivedAt: observedAt,
        dedupBucket: BigInt(Math.floor(observedAt.getTime() / 30_000)),
        rawPayloadJson: {},
      },
    });
  }

  async function upsertVlsObd(input: {
    tokenId: number;
    plugged: boolean;
    timestamp: string;
  }) {
    await prisma.vehicleLatestState.upsert({
      where: { vehicleId: fixture.vehicle.id },
      create: {
        vehicleId: fixture.vehicle.id,
        dimoTokenId: input.tokenId,
        rawPayloadJson: {
          obdIsPluggedIn: { value: input.plugged, timestamp: input.timestamp },
        },
      },
      update: {
        dimoTokenId: input.tokenId,
        rawPayloadJson: {
          obdIsPluggedIn: { value: input.plugged, timestamp: input.timestamp },
        },
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    const prismaService = prisma as unknown as PrismaService;
    const repository = new DeviceConnectionPhysicalStateRepository(prismaService);
    const coordinator = new PhysicalStateReconcileCoordinator(
      prismaService,
      repository,
      new DeviceConnectionPhysicalStateActionOutboxRepository(prismaService),
    );
    preseed = new PhysicalStatePreseedService(prismaService, coordinator);
    writer = new PhysicalStateEvidenceWriterService(
      prismaService,
      coordinator,
      new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService),
    );
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
    binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: fixture.tokenId });
  });

  afterEach(async () => {
    await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  it('P24-A — initial establishment', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });
    const before = await countSideEffectArtifacts();

    const result = await preseed.applyPhysicalStatePreseed(scope());

    expect(result.decision).toBe('ESTABLISHED');
    expect(result.reconcileDecision).toBe(DeviceConnectionPhysicalTransitionDecision.ESTABLISHED);
    expect(result.episodeAction).toBe('none');
    expect(result.alertAction).toBe('none');
    expect(result.wouldWrite.outbox).toBe(false);
    expect(result.projectionStateVersion).toBe(1);

    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.effectiveState).toBe('UNPLUGGED');

    const after = await countSideEffectArtifacts();
    expect(after).toEqual(before);
    expect(await preseed.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.LEGACY,
    );
  });

  it('P24-B — exact rerun idempotent', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });
    const first = await preseed.applyPhysicalStatePreseed(scope());
    expect(first.decision).toBe('ESTABLISHED');
    const transitionsAfterFirst = await prisma.deviceConnectionPhysicalStateTransition.count({
      where: { vehicleId: fixture.vehicle.id },
    });

    const second = await preseed.applyPhysicalStatePreseed(scope());
    expect(second.decision).toBe('SKIP_EXISTING_PROJECTION');
    expect(second.wouldWrite.projection).toBe(false);

    const transitionsAfterSecond = await prisma.deviceConnectionPhysicalStateTransition.count({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(transitionsAfterSecond).toBe(transitionsAfterFirst);
    expect(await countSideEffectArtifacts()).toEqual({
      episodes: 0,
      outbox: 0,
      events: 1,
      authority: 0,
    });
  });

  it('P24-C — repeated dry-run zero mutation', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_PLUGGED_IN',
      observedAt: T2,
    });
    const beforeProjections = await prisma.deviceConnectionPhysicalState.count({
      where: { vehicleId: fixture.vehicle.id },
    });

    for (let i = 0; i < 3; i += 1) {
      const dry = await preseed.dryRunPhysicalStatePreseed(scope());
      expect(dry.dryRun).toBe(true);
      expect(dry.decision).toBe('WOULD_ESTABLISH');
      expect(dry.wouldWrite.episode).toBe(false);
      expect(dry.wouldWrite.outbox).toBe(false);
    }

    const afterProjections = await prisma.deviceConnectionPhysicalState.count({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(afterProjections).toBe(beforeProjections);
  });

  it('P24-D — existing projection untouched', async () => {
    const repository = new DeviceConnectionPhysicalStateRepository(prisma as unknown as PrismaService);
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'existing-projection',
      },
    });
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T3,
    });

    const result = await preseed.applyPhysicalStatePreseed(scope());
    expect(result.decision).toBe('SKIP_EXISTING_PROJECTION');

    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
    expect(row?.evidenceReferenceId).toBe('existing-projection');
    expect(await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
  });

  it('P24-E — newer snapshot wins over older webhook', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T1,
    });
    await upsertVlsObd({ tokenId: fixture.tokenId, plugged: true, timestamp: T2 });

    const plan = await preseed.planPhysicalStatePreseed(scope());
    expect(plan.selectedCandidate?.evidenceSource).toBe('SNAPSHOT_OBD');
    expect(plan.selectedCandidate?.candidateState).toBe('PLUGGED');

    const applied = await preseed.applyPhysicalStatePreseed(scope());
    expect(applied.decision).toBe('ESTABLISHED');
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
  });

  it('P24-F — newer webhook wins over older snapshot', async () => {
    await upsertVlsObd({ tokenId: fixture.tokenId, plugged: true, timestamp: T1 });
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });

    const plan = await preseed.planPhysicalStatePreseed(scope());
    expect(plan.selectedCandidate?.evidenceSource).toBe('WEBHOOK');
    expect(plan.selectedCandidate?.candidateState).toBe('UNPLUGGED');

    const applied = await preseed.applyPhysicalStatePreseed(scope());
    expect(applied.decision).toBe('ESTABLISHED');
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
    });
    expect(row?.effectiveState).toBe('UNPLUGGED');
  });

  it('P24-G — equal-time opposing states fail closed', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });
    await upsertVlsObd({ tokenId: fixture.tokenId, plugged: true, timestamp: T2 });

    const result = await preseed.applyPhysicalStatePreseed(scope());
    expect(result.decision).toBe('AMBIGUOUS_EQUAL_TIME_CONFLICT');
    expect(
      await prisma.deviceConnectionPhysicalState.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ).toBe(0);
  });

  it('P24-H — equal-time same state establishes once', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_PLUGGED_IN',
      observedAt: T2,
    });
    await upsertVlsObd({ tokenId: fixture.tokenId, plugged: true, timestamp: T2 });

    const applied = await preseed.applyPhysicalStatePreseed(scope());
    expect(applied.decision).toBe('ESTABLISHED');
    expect(
      await prisma.deviceConnectionPhysicalState.count({
        where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
      }),
    ).toBe(1);
  });

  it('P24-I — unknown binding / insufficient evidence', async () => {
    const otherToken = fixture.tokenId + 99_999;
    await createWebhookEvent({
      tokenId: otherToken,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });

    const result = await preseed.applyPhysicalStatePreseed(scope());
    expect(result.decision).toBe('INSUFFICIENT_EVIDENCE');
    expect(
      await prisma.deviceConnectionPhysicalState.count({ where: { vehicleId: fixture.vehicle.id } }),
    ).toBe(0);
  });

  it('P24-J — master flag off does not activate writer; preseed authority stays LEGACY', async () => {
    delete process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV];
    expect(writer.isWriterCapable()).toBe(false);

    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });
    const result = await preseed.applyPhysicalStatePreseed(scope());
    expect(result.decision).toBe('ESTABLISHED');
    expect(await preseed.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.LEGACY,
    );
  });

  it('P24-K — concurrent duplicate seed attempts', async () => {
    await createWebhookEvent({
      tokenId: fixture.tokenId,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: T2,
    });

    const [a, b] = await Promise.all([
      preseed.applyPhysicalStatePreseed(scope()),
      preseed.applyPhysicalStatePreseed(scope()),
    ]);

    const decisions = new Set([a.decision, b.decision]);
    expect(decisions.has('ESTABLISHED')).toBe(true);
    for (const decision of decisions) {
      expect(['ESTABLISHED', 'SKIP_EXISTING_PROJECTION', 'SKIPPED_ALREADY_ESTABLISHED']).toContain(
        decision,
      );
    }
    expect(
      await prisma.deviceConnectionPhysicalState.count({
        where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
      }),
    ).toBe(1);
    expect(await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
    expect(
      await prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ).toBe(0);
  });
});
