import {
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalStateActionOutboxStatus,
  DeviceConnectionPhysicalTransitionDecision,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV,
} from '@config/connectivity-physical-state-runtime.config';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from '@config/connectivity-physical-state.config';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
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

function enableStatefulShadowEnv(): void {
  process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV] = 'true';
  process.env[CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV] = 'true';
  process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV] = 'true';
  process.env[CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV] = 'false';
}

function disableStatefulShadowEnv(): void {
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV];
}

describePg('PhysicalStateEvidenceWriterService (postgres)', () => {
  let prisma: PrismaClient;
  let writer: PhysicalStateEvidenceWriterService;
  let repository: DeviceConnectionPhysicalStateRepository;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  const T1 = '2026-08-01T10:00:00.000Z';
  const T2 = '2026-09-12T15:02:29.000Z';
  const T3 = '2026-09-12T16:27:51.000Z';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    const prismaService = prisma as unknown as PrismaService;
    repository = new DeviceConnectionPhysicalStateRepository(prismaService);
    const coordinator = new PhysicalStateReconcileCoordinator(
      prismaService,
      repository,
      new DeviceConnectionPhysicalStateActionOutboxRepository(prismaService),
    );
    writer = new PhysicalStateEvidenceWriterService(
      prismaService,
      coordinator,
      new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService),
    );
  });

  beforeEach(async () => {
    enableStatefulShadowEnv();
    fixture = await createPhysicalStatePostgresFixture(prisma);
    binding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId,
    });
  });

  afterEach(async () => {
    disableStatefulShadowEnv();
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GT-R1 STATEFUL_SHADOW full sequence: UNPLUG -> snapshot PLUG -> webhook UNPLUG', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-hist-unplug',
      },
    });

    await prisma.dimoDeviceConnectionEvent.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        provider: 'DIMO',
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date(T1),
        receivedAt: new Date(T1),
        dedupBucket: BigInt(Math.floor(new Date(T1).getTime() / 30_000)),
        rawPayloadJson: {},
      },
    });

    const snapshotSignals = {
      obdIsPluggedIn: { value: true, timestamp: T2 },
    };

    const snapshotResult = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: snapshotSignals,
      evidenceReferenceId: `snapshot-obd:${fixture.vehicle.id}:${T2}`,
      legacyGate: { accepted: false, reason: 'no_open_episode' },
      provenExpectedFix: true,
      projectionSelfHeal: true,
    });

    expect(snapshotResult.policy?.statefulShadow).toBe(true);
    expect(snapshotResult.physicalAccepted).toBe(true);
    expect(snapshotResult.coordinatorResult?.reconcile.decision).toBe(
      DeviceConnectionPhysicalTransitionDecision.APPLIED,
    );
    expect(snapshotResult.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );

    const afterPlug = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(afterPlug?.effectiveState).toBe('PLUGGED');
    expect(afterPlug?.evidenceObservedAt.toISOString()).toBe(new Date(T2).toISOString());

    const webhookResult = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: { obdIsPluggedIn: false },
      evidenceReferenceId: `webhook:${fixture.vehicle.id}:${T3}:unplug`,
      legacyGate: { accepted: false, reason: 'no_state_change' },
      provenExpectedFix: true,
    });

    expect(webhookResult.physicalAccepted).toBe(true);
    expect(webhookResult.coordinatorResult?.reconcile.decision).toBe(
      DeviceConnectionPhysicalTransitionDecision.APPLIED,
    );
    expect(webhookResult.coordinatorResult?.canonicalEventId).toBeTruthy();

    const finalProjection = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(finalProjection?.effectiveState).toBe('UNPLUGGED');
    expect(finalProjection?.evidenceObservedAt.toISOString()).toBe(new Date(T3).toISOString());

    const transitions = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: { vehicleId: fixture.vehicle.id },
      orderBy: { createdAt: 'asc' },
    });
    const applied = transitions.filter((t) => t.decision === 'APPLIED');
    expect(applied).toHaveLength(2);

    const events = await prisma.dimoDeviceConnectionEvent.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(events).toHaveLength(2);

    const episodes = await prisma.deviceConnectionEpisode.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(episodes).toHaveLength(0);

    const outbox = await prisma.deviceConnectionPhysicalStateActionOutbox.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(outbox).toHaveLength(0);
  });

  it('concurrent webhook + snapshot — newer timestamp wins', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date('2026-09-12T14:00:00.000Z'),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-base',
      },
    });

    const tOld = '2026-09-12T15:00:00.000Z';
    const tNew = '2026-09-12T15:00:01.000Z';

    const [staleSnapshot, freshWebhook] = await Promise.all([
      writer.writeSnapshotEvidence({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        signals: { obdIsPluggedIn: { value: false, timestamp: tOld } },
        evidenceReferenceId: 'snap-stale',
        legacyGate: { accepted: false, reason: 'obd_false' },
      }),
      writer.writeWebhookEvidence({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        tokenId: fixture.tokenId,
        pluggedIn: true,
        observedAt: new Date(tNew),
        rawPayload: {},
        evidenceReferenceId: 'wh-fresh',
        legacyGate: { accepted: true },
      }),
    ]);

    expect(staleSnapshot.coordinatorResult?.reconcile.decision).toBe('STALE');
    expect(freshWebhook.coordinatorResult?.reconcile.decision).toBe('APPLIED');

    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
    expect(row?.evidenceObservedAt.toISOString()).toBe(new Date(tNew).toISOString());
  });

  it('equal-time opposing states => CONFLICT without projection overwrite', async () => {
    const ts = '2026-09-12T15:00:00.000Z';
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(ts),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-plug',
      },
    });

    const conflict = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(ts),
      rawPayload: {},
      evidenceReferenceId: 'wh-conflict',
      legacyGate: { accepted: true },
    });

    expect(conflict.coordinatorResult?.reconcile.decision).toBe('CONFLICT');
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
  });

  it('master=false => zero projection writes', async () => {
    disableStatefulShadowEnv();
    const result = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: {},
      evidenceReferenceId: 'wh-disabled',
      legacyGate: { accepted: true },
    });
    expect(result.enabled).toBe(false);
    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(rows).toHaveLength(0);
    enableStatefulShadowEnv();
  });

  it('APPLIED-only webhook event history contract', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-established',
      },
    });

    const duplicate = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: true,
      observedAt: new Date(T1),
      rawPayload: {},
      evidenceReferenceId: 'wh-established',
      legacyGate: { accepted: false, reason: 'no_state_change' },
    });

    expect(duplicate.coordinatorResult?.reconcile.decision).toBe('DUPLICATE');
    expect(duplicate.coordinatorResult?.canonicalEventId).toBeNull();

    const events = await prisma.dimoDeviceConnectionEvent.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(events).toHaveLength(0);
  });

  it('snapshot UNPLUG APPLIED does not enqueue outbox when sideEffects=false', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-plug-base',
      },
    });

    const result = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: {},
      evidenceReferenceId: 'wh-unplug-sidefx',
      legacyGate: { accepted: true },
    });

    expect(result.coordinatorResult?.reconcile.episodeAction).toBe('open_unplug');
    const outbox = await prisma.deviceConnectionPhysicalStateActionOutbox.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(outbox).toHaveLength(0);
    expect(outbox.every((r) => r.status !== DeviceConnectionPhysicalStateActionOutboxStatus.PENDING)).toBe(
      true,
    );
  });
});
