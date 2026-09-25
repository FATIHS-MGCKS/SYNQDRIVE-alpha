import {
  DeviceConnectionPhysicalEvidenceSource,
  DeviceConnectionPhysicalTransitionDecision,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { isPhysicalStateCoordinatorReconciled } from './device-connection-physical-state.types';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
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
const describePg = LIVE ? describe : describe.skip;

describePg('Physical state coordinator-parent adversarial (postgres)', () => {
  let prisma: PrismaClient;
  let writer: PhysicalStateEvidenceWriterService;
  let repository: DeviceConnectionPhysicalStateRepository;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    repository = new DeviceConnectionPhysicalStateRepository(prismaService);
    const authorityRepository = new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService);
    const coordinator = new PhysicalStateReconcileCoordinator(
      prismaService,
      repository,
      new DeviceConnectionPhysicalStateActionOutboxRepository(prismaService),
      authorityRepository,
    );
    writer = new PhysicalStateEvidenceWriterService(prismaService, coordinator, authorityRepository);
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
    enablePhysicalStateStatefulShadowEnvForFixture(fixture);
    binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: fixture.tokenId });
  });

  afterEach(async () => {
    disablePhysicalStateStatefulShadowEnv();
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const legacyPlugReject = (reason: string, at: string) => ({
    accepted: false,
    diagnosticReason: reason,
    effectivePlugState: 'plugged' as const,
    evidenceObservedAt: new Date(at),
    bindingKey: binding.bindingKey,
  });

  it('A — concurrent same-state newer timestamps serialize to single provenance chain', async () => {
    const t0 = '2026-09-20T10:00:00.000Z';
    const t1 = '2026-09-20T10:00:05.000Z';
    const t2 = '2026-09-20T10:00:10.000Z';
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(t0),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh:seed',
      },
    });

    await Promise.all([
      writer.writeWebhookEvidence({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        tokenId: fixture.tokenId,
        pluggedIn: true,
        observedAt: new Date(t1),
        receivedAt: new Date(t1),
        rawPayload: {},
        evidenceReferenceId: 'wh:refresh-1',
        legacyShadow: legacyPlugReject('no_state_change', t1),
      }),
      writer.writeWebhookEvidence({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        tokenId: fixture.tokenId,
        pluggedIn: true,
        observedAt: new Date(t2),
        receivedAt: new Date(t2),
        rawPayload: {},
        evidenceReferenceId: 'wh:refresh-2',
        legacyShadow: legacyPlugReject('no_state_change', t2),
      }),
    ]);

    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
    expect(row?.evidenceObservedAt.toISOString()).toBe(new Date(t2).toISOString());
  });

  it('B — equal-time WEBHOOK then SNAPSHOT same-state cross-channel refresh', async () => {
    const t = '2026-09-20T11:00:00.000Z';
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(t),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh:equal',
      },
    });

    const result = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: t } },
      evidenceReferenceId: `vls:obd:${t}`,
      legacyShadow: legacyPlugReject('no_open_episode', t),
    });

    expect(result.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH,
    );
    expect(result.shadowComparison?.correctnessBlocking).toBe(false);
  });

  it('C — newer UNPLUG wins over earlier same-state refresh attempt', async () => {
    const tRefresh = '2026-09-23T07:41:49.000Z';
    const tUnplug = '2026-09-23T07:41:53.000Z';
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date('2026-09-23T07:41:00.000Z'),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh:base',
      },
    });

    await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: true,
      observedAt: new Date(tRefresh),
      receivedAt: new Date(tRefresh),
      rawPayload: {},
      evidenceReferenceId: 'wh:refresh',
      legacyShadow: legacyPlugReject('no_state_change', tRefresh),
    });

    const unplug = await writer.writeWebhookEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      provider: 'DIMO',
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(tUnplug),
      receivedAt: new Date(tUnplug),
      rawPayload: {},
      evidenceReferenceId: 'wh:unplug',
      legacyShadow: {
        accepted: true,
        diagnosticReason: null,
        effectivePlugState: 'unplugged',
        evidenceObservedAt: new Date(tUnplug),
        bindingKey: binding.bindingKey,
      },
    });

    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id, bindingKey: binding.bindingKey },
    });
    expect(row?.effectiveState).toBe('UNPLUGGED');
    expect(
      unplug.coordinatorResult &&
        isPhysicalStateCoordinatorReconciled(unplug.coordinatorResult) &&
        unplug.coordinatorResult.reconcile.decision,
    ).toBe(DeviceConnectionPhysicalTransitionDecision.APPLIED);
  });

  it('F — equal-time opposing state remains CONFLICT / blocking shadow', async () => {
    const t = '2026-09-20T12:00:00.000Z';
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date(t),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
        evidenceReferenceId: 'wh:plug',
      },
    });

    const result = await writer.writeSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: false, timestamp: t } },
      evidenceReferenceId: `snap:unplug:${t}`,
      legacyShadow: {
        accepted: false,
        diagnosticReason: 'obd_false',
        effectivePlugState: 'plugged',
        evidenceObservedAt: new Date(t),
        bindingKey: binding.bindingKey,
      },
    });

    expect(result.shadowComparison?.classification).toBe(PhysicalStateShadowClassification.CONFLICT);
    expect(result.shadowComparison?.correctnessBlocking).toBe(true);
  });
});
