import {
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { evaluateOrphanReconciliationEligibility } from '../connectivity/connectivity-lifecycle-runtime.policy';
import { hashProviderDeviceId } from '../device-connection-episode.service';
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { getCoordinatorReconcile } from './device-connection-physical-state.types';
import { buildSnapshotPlugInitialEstablishmentGtR1Proof } from './physical-state-gt-r1-proof';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { PhysicalStateSnapshotEvidenceOrchestrator } from './physical-state-snapshot-evidence-orchestrator.service';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  disablePhysicalStateStatefulShadowEnv,
  enablePhysicalStateStatefulShadowEnvForFixture,
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

describePg('PhysicalStateSnapshotEvidenceOrchestrator real call-site (postgres)', () => {
  let prisma: PrismaClient;
  let orchestrator: PhysicalStateSnapshotEvidenceOrchestrator;
  let writer: PhysicalStateEvidenceWriterService;
  let webhookService: DeviceConnectionWebhookService;
  let repository: DeviceConnectionPhysicalStateRepository;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  const T1 = '2026-08-01T10:00:00.000Z';
  const T2 = '2026-09-12T15:02:29.000Z';
  const T3 = '2026-09-12T16:27:51.000Z';
  const VLS_ID = 'vls-test-snapshot-callsite';

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
    orchestrator = new PhysicalStateSnapshotEvidenceOrchestrator(prismaService, writer);
    webhookService = new DeviceConnectionWebhookService(
      prismaService,
      { openFromUnplugEvent: jest.fn(), resolveFromExplicitPlugEvent: jest.fn() } as never,
      {
        automaticLifecycleReconciliationEnabled: false,
        lifecycleReconcileAfter: null,
        evaluateOrphanReconciliationEligibility,
        isInboxEligibleForAutomaticRuntimeReplay: jest.fn(),
      } as never,
      undefined,
      writer,
    );
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
    enablePhysicalStateStatefulShadowEnvForFixture(fixture);
    binding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId,
    });
  });

  afterEach(async () => {
    disablePhysicalStateStatefulShadowEnv();
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function countArtifacts() {
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

  function snapshotInput(
    signals: Record<string, unknown>,
    fetchedAt: string,
    existingVlsSourceTimestamp: Date | null = null,
  ) {
    return {
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals,
      providerBindingId: null,
      hardwareType: 'LTE_R1',
      sourceSubtype: null,
      fetchedAt: new Date(fetchedAt),
      vehicleLatestStateId: VLS_ID,
      existingVlsSourceTimestamp,
    };
  }

  it('1. GT-R1: UNPLUG T1 -> snapshot PLUG T2 -> webhook UNPLUG T3', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-hist',
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

    const snap = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );
    expect(snap?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );

    const webhookOutcome = await webhookService.processValidatedWebhookEvent({
      vehicle: { id: fixture.vehicle.id, organizationId: fixture.org.id },
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: { obdIsPluggedIn: false },
    });
    expect(webhookOutcome.outcome).toBe('created');

    const projection = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(projection?.effectiveState).toBe('UNPLUGGED');
    expect(projection?.evidenceObservedAt.toISOString()).toBe(new Date(T3).toISOString());
    expect(await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
    expect(await prisma.deviceConnectionPhysicalStateActionOutbox.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
  });

  it('2. stale snapshot after newer physical state => no overwrite', async () => {
    await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T3 } }, T3),
    );
    const stale = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: false, timestamp: T1 } }, T1),
    );
    expect(getCoordinatorReconcile(stale?.coordinatorResult)?.decision).toBe(
      DeviceConnectionPhysicalTransitionDecision.STALE,
    );
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
  });

  it('3. equal-time opposing state => CONFLICT', async () => {
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
        evidenceReferenceId: 'wh-base',
      },
    });
    const conflict = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(
        { obdIsPluggedIn: { value: false, timestamp: ts } },
        ts,
        new Date('2026-09-12T14:00:00.000Z'),
      ),
    );
    expect(getCoordinatorReconcile(conflict?.coordinatorResult)?.decision).toBe(
      DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    );
  });

  it('4. legacy/physical binding divergence => BINDING_DIVERGENCE', async () => {
    const oldTokenId = fixture.tokenId + 99_999;
    const oldHash = hashProviderDeviceId('DIMO', oldTokenId);
    await prisma.deviceConnectionEpisode.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        providerDeviceIdHash: oldHash,
        openedAt: new Date(T1),
        openedReason: 'OBD_DEVICE_UNPLUGGED_WEBHOOK',
        status: 'OPEN',
      },
    });
    await prisma.dimoDeviceConnectionEvent.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: oldTokenId,
        provider: 'DIMO',
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date(T1),
        receivedAt: new Date(T1),
        dedupBucket: BigInt(Math.floor(new Date(T1).getTime() / 30_000)),
        rawPayloadJson: {},
      },
    });
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

    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );
    expect(result?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.BINDING_DIVERGENCE,
    );
    expect(result?.shadowComparison?.classification).not.toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('5. synthetic snapshot source => no EXPECTED_FIX', async () => {
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
    const result = await orchestrator.applyPhysicalSnapshotEvidence({
      ...snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
      sourceSubtype: 'SYNTHETIC_TEST',
    });
    expect(result?.shadowComparison?.classification).not.toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('6. sideEffects=false => zero outbox / zero lifecycle effects', async () => {
    await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2),
    );
    expect(await prisma.deviceConnectionPhysicalStateActionOutbox.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
    expect(await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
  });

  it('CASE A — old event token, no episode, new physical token => BINDING_DIVERGENCE', async () => {
    const oldTokenId = fixture.tokenId + 88_888;
    const oldBinding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: oldTokenId });

    await prisma.dimoDeviceConnectionEvent.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: oldTokenId,
        provider: 'DIMO',
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date(T1),
        receivedAt: new Date(T1),
        dedupBucket: BigInt(Math.floor(new Date(T1).getTime() / 30_000)),
        rawPayloadJson: {},
      },
    });

    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-new-token',
      },
    });

    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );

    expect(result?.legacyShadow?.bindingKey).toBe(oldBinding.bindingKey);
    expect(result?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.BINDING_DIVERGENCE,
    );
    expect(result?.shadowComparison?.classification).not.toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
    expect(await prisma.deviceConnectionPhysicalStateActionOutbox.count({ where: { vehicleId: fixture.vehicle.id } })).toBe(0);
  });

  it('CASE B — same token control => EXPECTED_FIX remains valid', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-same-token',
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

    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );

    expect(result?.legacyShadow?.bindingKey).toBe(binding.bindingKey);
    expect(result?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('CASE C — unknown legacy binding => fail closed (no EXPECTED_FIX)', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date(T1),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh-no-legacy-event',
      },
    });

    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );

    expect(result?.legacyShadow?.bindingKey).toBeNull();
    expect(result?.shadowComparison?.classification).not.toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result?.shadowComparison?.classification).not.toBe(PhysicalStateShadowClassification.MATCH);
  });

  it('BOOTSTRAP CASE A — absent projection + aligned PLUGGED SNAPSHOT_OBD => EXPECTED_FIX', async () => {
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2),
    );

    expect(result?.legacyShadow?.accepted).toBe(false);
    expect(result?.legacyShadow?.diagnosticReason).toBe('no_open_episode');
    expect(getCoordinatorReconcile(result?.coordinatorResult)?.decision).toBe('ESTABLISHED');
    expect(result?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result?.shadowComparison?.correctnessBlocking).toBe(false);
  });

  it('BOOTSTRAP CASE B — cached replay at VLS boundary => orchestrator skips (no mutation)', async () => {
    await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );

    const replay = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T2)),
    );

    expect(replay).toBeNull();
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
    expect(row?.evidenceObservedAt.toISOString()).toBe(new Date(T2).toISOString());
  });

  it('BOOTSTRAP CASE C — PLUGGED baseline then valid UNPLUG snapshot transition', async () => {
    await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );

    const transition = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: false, timestamp: T3 } }, T3, new Date(T2)),
    );

    expect(transition?.legacyShadow?.diagnosticReason).toBe('obd_false');
    expect(transition?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('BOOTSTRAP-ACTUAL regression — stale bootstrap proof + DUPLICATE transition => UNEXPLAINED', async () => {
    await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
    );

    const staleBootstrapProof = buildSnapshotPlugInitialEstablishmentGtR1Proof({
      physicalProjectionState: null,
      physicalProjectionEvidenceAt: null,
      snapshotCandidatePlugged: true,
      snapshotEvidenceObservedAt: new Date(T2),
      legacyEvaluation: { action: 'reject', reason: 'no_open_episode' },
      physicalBindingScope: binding,
      legacyBindingKey: null,
      episode: null,
      hardwareType: 'LTE_R1',
      snapshotSource: 'dimo',
      sourceSubtype: null,
      evidenceReferenceId: `snapshot-obd:${fixture.vehicle.id}:${T2}`,
    });
    expect(staleBootstrapProof?.scenario).toBe('SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT');

    const duplicate = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: T2 } },
      evidenceReferenceId: `snapshot-obd:${fixture.vehicle.id}:${T2}`,
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'no_open_episode',
        effectivePlugState: null,
        evidenceObservedAt: null,
        bindingKey: null,
      },
      gtR1Proof: staleBootstrapProof,
      projectionSelfHeal: true,
    });

    const actualDecision = getCoordinatorReconcile(duplicate?.coordinatorResult)?.decision;
    expect(actualDecision).not.toBe(DeviceConnectionPhysicalTransitionDecision.ESTABLISHED);
    expect([DeviceConnectionPhysicalTransitionDecision.DUPLICATE, DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH]).toContain(
      actualDecision,
    );
    expect(duplicate?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(duplicate?.shadowComparison?.classification).not.toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
  });

  it('BOOTSTRAP CASE D — synthetic snapshot source invalidates bootstrap proof => UNEXPLAINED', async () => {
    const result = await orchestrator.applyPhysicalSnapshotEvidence({
      ...snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2, new Date(T1)),
      sourceSubtype: 'SYNTHETIC_TEST',
    });

    expect(result?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
    );
    expect(result?.shadowComparison?.correctnessBlocking).toBe(true);
  });

  it('7. master=false => zero P2.3 DB mutations', async () => {
    disablePhysicalStateStatefulShadowEnv();
    const before = await countArtifacts();
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput({ obdIsPluggedIn: { value: true, timestamp: T2 } }, T2),
    );
    expect(result).toBeNull();
    const after = await countArtifacts();
    expect(after).toEqual(before);
    enablePhysicalStateStatefulShadowEnvForFixture(fixture);
  });
});
