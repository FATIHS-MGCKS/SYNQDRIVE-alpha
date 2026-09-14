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
import {
  buildSnapshotPlugRepairGtR1Proof,
  buildWebhookStaleLegacyGateGtR1Proof,
} from './physical-state-gt-r1-proof';
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
    const authorityRepository = new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService);
    const coordinator = new PhysicalStateReconcileCoordinator(
      prismaService,
      repository,
      new DeviceConnectionPhysicalStateActionOutboxRepository(prismaService),
      authorityRepository,
    );
    writer = new PhysicalStateEvidenceWriterService(
      prismaService,
      coordinator,
      authorityRepository,
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

  async function countAllPhysicalStateArtifacts() {
    const [authority, projections, transitions, events, outbox] = await Promise.all([
      prisma.deviceConnectionPhysicalAuthorityCutover.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
      prisma.deviceConnectionPhysicalState.count({ where: { vehicleId: fixture.vehicle.id } }),
      prisma.deviceConnectionPhysicalStateTransition.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
      prisma.dimoDeviceConnectionEvent.count({ where: { vehicleId: fixture.vehicle.id } }),
      prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ]);
    return { authority, projections, transitions, events, outbox };
  }

  it('GT-R1 writer-level sequence: UNPLUG -> snapshot PLUG -> webhook UNPLUG', async () => {
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

    const snapshotProof = buildSnapshotPlugRepairGtR1Proof({
      physicalProjectionState: 'UNPLUGGED',
      physicalProjectionEvidenceAt: new Date(T1),
      snapshotCandidatePlugged: true,
      snapshotEvidenceObservedAt: new Date(T2),
      legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
      physicalBindingScope: binding,
      legacyBindingKey: binding.bindingKey,
      episode: null,
      hardwareType: 'LTE_R1',
      snapshotSource: 'dimo',
      sourceSubtype: null,
      evidenceReferenceId: `snapshot-obd:${fixture.vehicle.id}:${T2}`,
    });

    const snapshotResult = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: snapshotSignals,
      evidenceReferenceId: `snapshot-obd:${fixture.vehicle.id}:${T2}`,
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'no_open_episode',
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(T1),
        bindingKey: binding.bindingKey,
      },
      gtR1Proof: snapshotProof,
      projectionSelfHeal: true,
    });

    expect(snapshotResult.policy?.statefulShadow).toBe(true);
    expect(snapshotResult.physicalAccepted).toBe(true);
    expect(snapshotResult.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );

    const webhookProof = buildWebhookStaleLegacyGateGtR1Proof({
      legacyAccepted: false,
      legacyEffectivePlugState: 'unplugged',
      incomingPluggedIn: false,
      incomingObservedAt: new Date(T3),
      physicalProjectionState: 'PLUGGED',
      physicalProjectionEvidenceAt: new Date(T2),
      evidenceReferenceId: `webhook:${fixture.vehicle.id}:${T3}:unplug`,
    });

    const webhookResult = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: { obdIsPluggedIn: false },
      evidenceReferenceId: `webhook:${fixture.vehicle.id}:${T3}:unplug`,
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'no_state_change',
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(T1),
        bindingKey: binding.bindingKey,
      },
      gtR1Proof: webhookProof,
    });

    expect(webhookResult.physicalAccepted).toBe(true);
    expect(webhookResult.coordinatorResult?.canonicalEventId).toBeTruthy();

    const finalProjection = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(finalProjection?.effectiveState).toBe('UNPLUGGED');

    const episodes = await prisma.deviceConnectionEpisode.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(episodes).toHaveLength(0);

    const outbox = await prisma.deviceConnectionPhysicalStateActionOutbox.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(outbox).toHaveLength(0);
  });

  it('legacy diagnostic reason only => UNEXPLAINED (no forged proof)', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-base',
      },
    });

    const result = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: T2 } },
      evidenceReferenceId: 'snap-unexplained',
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'no_open_episode',
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(T1),
        bindingKey: binding.bindingKey,
      },
      gtR1Proof: null,
      projectionSelfHeal: true,
    });

    expect(result.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('master=false => zero authority/projection/transition/event/outbox writes', async () => {
    disableStatefulShadowEnv();
    const before = await countAllPhysicalStateArtifacts();

    const result = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: {},
      evidenceReferenceId: 'wh-disabled',
      legacyShadow: {
        accepted: true,
        diagnosticReason: null,
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(T3),
        bindingKey: binding.bindingKey,
      },
    });

    expect(result.enabled).toBe(false);
    const after = await countAllPhysicalStateArtifacts();
    expect(after).toEqual(before);
    enableStatefulShadowEnv();
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
        legacyShadow: {
          accepted: false,
          diagnosticReason: 'obd_false',
          effectivePlugState: 'unplugged',
          evidenceObservedAt: new Date(tOld),
          bindingKey: binding.bindingKey,
        },
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
        legacyShadow: {
          accepted: true,
          diagnosticReason: null,
          effectivePlugState: 'plugged',
          evidenceObservedAt: new Date(tNew),
          bindingKey: binding.bindingKey,
        },
      }),
    ]);

    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row).toBeTruthy();
    expect(row!.effectiveState).toBe('PLUGGED');
    expect(row!.evidenceReferenceId).toBe('wh-fresh');
    expect(row!.evidenceObservedAt.toISOString()).toBe(new Date(tNew).toISOString());
    expect(staleSnapshot.enabled).toBe(true);
    expect(freshWebhook.enabled).toBe(true);
  });

  it('stale overwrite rejected after winner commits', async () => {
    await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T16:00:00.000Z'),
      rawPayload: {},
      evidenceReferenceId: 'wh-new',
      legacyShadow: {
        accepted: true,
        diagnosticReason: null,
        effectivePlugState: 'plugged',
        evidenceObservedAt: new Date('2026-09-12T16:00:00.000Z'),
        bindingKey: binding.bindingKey,
      },
    });

    const stale = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: false, timestamp: '2026-09-12T14:00:00.000Z' } },
      evidenceReferenceId: 'snap-old',
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'obd_false',
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date('2026-09-12T14:00:00.000Z'),
        bindingKey: binding.bindingKey,
      },
    });

    expect(stale.coordinatorResult?.reconcile.decision).toBe(
      DeviceConnectionPhysicalTransitionDecision.STALE,
    );
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
    expect(row?.evidenceReferenceId).toBe('wh-new');
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
      legacyShadow: {
        accepted: true,
        diagnosticReason: null,
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(ts),
        bindingKey: binding.bindingKey,
      },
    });

    expect(conflict.coordinatorResult?.reconcile.decision).toBe('CONFLICT');
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
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'no_state_change',
        effectivePlugState: 'plugged',
        evidenceObservedAt: new Date(T1),
        bindingKey: binding.bindingKey,
      },
    });

    expect(duplicate.coordinatorResult?.reconcile.decision).toBe('DUPLICATE');
    expect(duplicate.coordinatorResult?.canonicalEventId).toBeNull();
  });

  it('sideEffects=false does not enqueue outbox despite open_unplug intent', async () => {
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
      legacyShadow: {
        accepted: true,
        diagnosticReason: null,
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(T3),
        bindingKey: binding.bindingKey,
      },
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
