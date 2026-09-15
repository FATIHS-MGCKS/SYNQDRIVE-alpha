import {
  DeviceConnectionPhysicalAuthorityMode,
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
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { PhysicalStateAuthorityCutoverService } from './physical-state-authority-cutover.service';
import { PhysicalStateCutoverEligibilityStatus } from './physical-state-authority-cutover.types';
import {
  buildValidSignedCutoverEvidenceBundleForScope,
  clearP25TestEvidencePublicKeyring,
  configureP25TestEvidencePublicKeyring,
  disableP25CutoverRuntimeEnv,
  P25_TEST_CUTOVER_BUILD,
} from './testing/physical-state-cutover-evidence.test-fixtures';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStatePreseedService } from './physical-state-preseed.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { PhysicalStateSnapshotEvidenceOrchestrator } from './physical-state-snapshot-evidence-orchestrator.service';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { getCoordinatorReconcile } from './device-connection-physical-state.types';
import { validateAuthorityTransition } from './physical-state-authority.state-machine';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  type PhysicalStatePostgresFixture,
} from './testing/physical-state-postgres.integration.harness';

const LIVE =
  process.env.PHYSICAL_STATE_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRED = process.env.PHYSICAL_STATE_POSTGRES_REQUIRED === '1';
const describePg = LIVE ? describe : describe.skip;

const CUTOVER_BUILD = P25_TEST_CUTOVER_BUILD;

function signedBundleForScope() {
  return buildValidSignedCutoverEvidenceBundleForScope(scope());
}

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
  process.env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID = CUTOVER_BUILD;
  process.env.SYNQDRIVE_BUILD_ID = CUTOVER_BUILD;
  configureP25TestEvidencePublicKeyring();
}

function disableStatefulShadowEnv(): void {
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV];
  delete process.env[CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV];
  disableP25CutoverRuntimeEnv();
  clearP25TestEvidencePublicKeyring();
}

describePg('P2.5 authority cutover runtime (postgres)', () => {
  let prisma: PrismaClient;
  let prismaService: PrismaService;
  let authorityRepository: DeviceConnectionPhysicalAuthorityCutoverRepository;
  let cutoverService: PhysicalStateAuthorityCutoverService;
  let writer: PhysicalStateEvidenceWriterService;
  let orchestrator: PhysicalStateSnapshotEvidenceOrchestrator;
  let preseedService: PhysicalStatePreseedService;
  let webhookService: DeviceConnectionWebhookService;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  const scope = () => ({
    organizationId: fixture.org.id,
    vehicleId: fixture.vehicle.id,
    provider: 'DIMO',
  });

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    prismaService = prisma as unknown as PrismaService;
    authorityRepository = new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService);
    cutoverService = new PhysicalStateAuthorityCutoverService(prismaService, authorityRepository);
    const stateRepository = new DeviceConnectionPhysicalStateRepository(prismaService);
    const coordinator = new PhysicalStateReconcileCoordinator(
      prismaService,
      stateRepository,
      new DeviceConnectionPhysicalStateActionOutboxRepository(prismaService),
      authorityRepository,
    );
    writer = new PhysicalStateEvidenceWriterService(prismaService, coordinator, authorityRepository);
    orchestrator = new PhysicalStateSnapshotEvidenceOrchestrator(prismaService, writer);
    preseedService = new PhysicalStatePreseedService(
      prismaService,
      coordinator,
      new TripMetricsService(),
    );
    webhookService = new DeviceConnectionWebhookService(
      prismaService,
      { openFromUnplugEvent: jest.fn(), resolveFromExplicitPlugEvent: jest.fn() } as never,
      {
        automaticLifecycleReconciliationEnabled: false,
        lifecycleReconcileAfter: null,
        evaluateOrphanReconciliationEligibility: jest.fn(),
        isInboxEligibleForAutomaticRuntimeReplay: jest.fn(),
      } as never,
      undefined,
      writer,
    );
  });

  beforeEach(async () => {
    enableStatefulShadowEnv();
    fixture = await createPhysicalStatePostgresFixture(prisma);
    binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: fixture.tokenId });
  });

  afterEach(async () => {
    disableStatefulShadowEnv();
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('P25-A — default authority LEGACY for new scope', async () => {
    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.LEGACY,
    );
  });

  it('P25-B — LEGACY -> PHYSICAL latch succeeds once with verified signed evidence', async () => {
    const bundle = signedBundleForScope();
    const result = await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      latchedBy: 'p25-test',
      signedEvidenceBundle: bundle,
    });
    expect(result.outcome).toBe('LATCHED');
    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    );

    const row = await prisma.deviceConnectionPhysicalAuthorityCutover.findFirstOrThrow({
      where: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      },
      select: { evidenceSnapshot: true },
    });
    const snapshot = row.evidenceSnapshot as Record<string, unknown>;
    expect(snapshot.bundleId).toBe(bundle.payload.bundleId);
    expect(snapshot.payloadCanonicalSha256).toMatch(/^[a-f0-9]{64}$/i);
    expect(snapshot.scope).toEqual(scope());
  });

  it('P25-C — PHYSICAL -> LEGACY rejected by state machine', () => {
    const transition = validateAuthorityTransition(
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
      DeviceConnectionPhysicalAuthorityMode.LEGACY,
    );
    expect(transition.allowed).toBe(false);
    if (!transition.allowed) {
      expect(transition.reason).toBe('PHYSICAL_TO_LEGACY_FORBIDDEN');
    }
  });

  it('P25-D — repeated PHYSICAL cutover is idempotent', async () => {
    const first = await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });
    expect(first.outcome).toBe('LATCHED');

    const second = await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });
    expect(second.outcome).toBe('ALREADY_PHYSICAL');

    const count = await prisma.deviceConnectionPhysicalAuthorityCutover.count({
      where: { vehicleId: fixture.vehicle.id, provider: 'DIMO' },
    });
    expect(count).toBe(1);
  });

  it('P25-E — concurrent latch attempts serialize to one PHYSICAL row', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        cutoverService.attemptAuthorityCutover({
          scope: scope(),
          signedEvidenceBundle: signedBundleForScope(),
        }),
      ),
    );

    const latched = attempts.filter((a) => a.outcome === 'LATCHED').length;
    const already = attempts.filter((a) => a.outcome === 'ALREADY_PHYSICAL').length;
    expect(latched + already).toBe(4);
    expect(latched).toBeGreaterThanOrEqual(1);

    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    );
  });

  it('P25-G — device replacement inherits PHYSICAL authority', async () => {
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });

    const replacementBinding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId + 1,
    });
    expect(replacementBinding.bindingKey).not.toBe(binding.bindingKey);
    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    );
  });

  it('P25-H — PHYSICAL webhook routes through physical writer, not legacy persist gate', async () => {
    await prisma.deviceConnectionPhysicalState.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        bindingKey: binding.bindingKey,
        effectiveState: 'PLUGGED',
        evidenceObservedAt: new Date('2026-08-01T10:00:00.000Z'),
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'seed:plugged',
        stateVersion: 1,
      },
    });
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });

    const eventsBefore = await prisma.dimoDeviceConnectionEvent.count({
      where: { vehicleId: fixture.vehicle.id },
    });

    const result = await webhookService.processValidatedWebhookEvent({
      vehicle: { id: fixture.vehicle.id, organizationId: fixture.org.id },
      tokenId: fixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T16:27:51.000Z'),
      rawPayload: { obdIsPluggedIn: false },
    });

    expect(result.outcome).toBe('ignored_by_policy');
    expect(result.policyReason).not.toBe('no_state_change');
    expect(result.policyReason).not.toBe('baseline_already_plugged');

    const eventsAfter = await prisma.dimoDeviceConnectionEvent.count({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(eventsAfter).toBe(eventsBefore);
  });

  it('P25-J — master=false after PHYSICAL retains physical gate', async () => {
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });
    delete process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV];

    const policy = await writer.resolveRuntimePolicy(scope());
    expect(policy.physicalGateAuthoritative).toBe(true);
    expect(policy.legacyGateAuthoritative).toBe(false);
    expect(policy.masterEnabled).toBe(false);
  });

  it('P25-K — sideEffects=false suppresses outbox under PHYSICAL authority', async () => {
    await prisma.deviceConnectionPhysicalState.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        bindingKey: binding.bindingKey,
        effectiveState: 'PLUGGED',
        evidenceObservedAt: new Date('2026-08-01T10:00:00.000Z'),
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'seed:plugged',
        stateVersion: 1,
      },
    });
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });

    await webhookService.processValidatedWebhookEvent({
      vehicle: { id: fixture.vehicle.id, organizationId: fixture.org.id },
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date('2026-09-12T16:27:51.000Z'),
      rawPayload: { obdIsPluggedIn: false },
    });

    expect(
      await prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ).toBe(0);
    expect(
      await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } }),
    ).toBe(0);
  });

  it('P25-F — pre-seed apply and cutover latch serialize on shared authority lock', async () => {
    await prisma.dimoDeviceConnectionEvent.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        provider: 'DIMO',
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date('2026-08-01T10:00:00.000Z'),
        receivedAt: new Date('2026-08-01T10:00:00.000Z'),
        dedupBucket: BigInt(Math.floor(new Date('2026-08-01T10:00:00.000Z').getTime() / 30_000)),
        rawPayloadJson: {},
      },
    });

    const [preseedResult, cutoverResult] = await Promise.all([
      preseedService.applyPhysicalStatePreseed({
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        tokenId: fixture.tokenId,
      }),
      cutoverService.attemptAuthorityCutover({
        scope: scope(),
        signedEvidenceBundle: signedBundleForScope(),
      }),
    ]);

    expect(preseedResult.decision).toBeTruthy();
    expect(['LATCHED', 'ALREADY_PHYSICAL']).toContain(cutoverResult.outcome);
    expect(
      await prisma.deviceConnectionPhysicalAuthorityCutover.count({
        where: { vehicleId: fixture.vehicle.id, provider: 'DIMO' },
      }),
    ).toBe(1);
    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    );
  });

  it('P25-I — PHYSICAL snapshot routes through orchestrator with master disabled', async () => {
    await prisma.deviceConnectionPhysicalState.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        bindingKey: binding.bindingKey,
        effectiveState: 'UNPLUGGED',
        evidenceObservedAt: new Date('2026-08-01T10:00:00.000Z'),
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'seed:unplugged',
        stateVersion: 1,
      },
    });
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });
    delete process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV];

    const snapshotResult = await orchestrator.applyPhysicalSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: '2026-09-12T15:02:29.000Z' } },
      providerBindingId: null,
      hardwareType: 'LTE_R1',
      sourceSubtype: null,
      fetchedAt: new Date('2026-09-12T15:02:29.000Z'),
      vehicleLatestStateId: 'vls-p25-i',
    });

    expect(snapshotResult).not.toBeNull();
    expect(snapshotResult?.policy?.physicalGateAuthoritative).toBe(true);
    expect(snapshotResult?.policy?.legacyGateAuthoritative).toBe(false);
  });

  it('P25-L — GT-R1 repair under PHYSICAL authority with sideEffects=false', async () => {
    await prisma.deviceConnectionPhysicalState.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        bindingKey: binding.bindingKey,
        effectiveState: 'UNPLUGGED',
        evidenceObservedAt: new Date('2026-08-01T10:00:00.000Z'),
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'seed:unplugged',
        stateVersion: 1,
      },
    });
    await prisma.dimoDeviceConnectionEvent.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        provider: 'DIMO',
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date('2026-08-01T10:00:00.000Z'),
        receivedAt: new Date('2026-08-01T10:00:00.000Z'),
        dedupBucket: BigInt(Math.floor(new Date('2026-08-01T10:00:00.000Z').getTime() / 30_000)),
        rawPayloadJson: {},
      },
    });
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });

    const snapshotResult = await orchestrator.applyPhysicalSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: '2026-09-12T15:02:29.000Z' } },
      providerBindingId: null,
      hardwareType: 'LTE_R1',
      sourceSubtype: null,
      fetchedAt: new Date('2026-09-12T15:02:29.000Z'),
      vehicleLatestStateId: 'vls-p25-l',
    });

    expect(snapshotResult?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(getCoordinatorReconcile(snapshotResult?.coordinatorResult)?.projection?.effectiveState).toBe(
      'PLUGGED',
    );
    expect(
      await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } }),
    ).toBe(0);
    expect(
      await prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ).toBe(0);
  });

  it('P25-M — mixed-replica interlock blocks cutover when peer builds diverge', async () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope(), {
      fleetReplicaCount: 2,
      peerBuildIds: [CUTOVER_BUILD],
      skipEnvMutation: true,
    });
    process.env.SYNQDRIVE_BUILD_ID = CUTOVER_BUILD;
    process.env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID = CUTOVER_BUILD;
    process.env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS = `${CUTOVER_BUILD},stale-replica`;

    const blocked = await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: bundle,
    });
    expect(blocked.outcome).toBe('BLOCKED');
    if (blocked.outcome === 'BLOCKED') {
      expect(blocked.eligibility.status).toBe(
        PhysicalStateCutoverEligibilityStatus.BLOCKED_MIXED_REPLICA,
      );
    }
    delete process.env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS;
  });

  it('P25-N — stale replica build cannot pass mixed-replica interlock', async () => {
    const bundle = buildValidSignedCutoverEvidenceBundleForScope(scope(), {
      skipEnvMutation: true,
    });
    process.env.SYNQDRIVE_BUILD_ID = 'legacy-replica-build';
    process.env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID = CUTOVER_BUILD;

    const blocked = await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: bundle,
    });
    expect(blocked.outcome).toBe('BLOCKED');
    if (blocked.outcome === 'BLOCKED') {
      expect(blocked.eligibility.status).toBe(
        PhysicalStateCutoverEligibilityStatus.BLOCKED_RUNTIME_NOT_READY,
      );
    }

    process.env.SYNQDRIVE_BUILD_ID = CUTOVER_BUILD;
  });

  it('P25-O — authority lock identity is org+vehicle+provider', async () => {
    const { buildPhysicalStateAuthorityLockKey } = await import(
      './device-connection-physical-state.binding'
    );
    const key = buildPhysicalStateAuthorityLockKey(scope());
    expect(key).toContain(fixture.org.id);
    expect(key).toContain(fixture.vehicle.id);
    expect(key).toContain('DIMO');
    expect(key).not.toContain(binding.bindingKey);
  });

  it('P25-P — blocked cutover and aborted latch transaction leave authority LEGACY', async () => {
    const blocked = await cutoverService.attemptAuthorityCutover({ scope: scope() });
    expect(blocked.outcome).toBe('BLOCKED');
    if (blocked.outcome === 'BLOCKED') {
      expect(blocked.eligibility.status).not.toBe(PhysicalStateCutoverEligibilityStatus.ELIGIBLE);
    }
    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.LEGACY,
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await authorityRepository.latchLegacyToPhysicalInTransaction(tx, scope(), {
          latchedBy: 'p25-abort-test',
        });
        throw new Error('simulated_crash_before_commit');
      }),
    ).rejects.toThrow('simulated_crash_before_commit');

    expect(await cutoverService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.LEGACY,
    );
  });

  it('P25-Q — committed PHYSICAL survives re-read', async () => {
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });
    const freshService = new PhysicalStateAuthorityCutoverService(
      prismaService,
      new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService),
    );
    expect(await freshService.readAuthorityMode(scope())).toBe(
      DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
    );
  });

  it('P25-R — no duplicate episode/alert/outbox during PHYSICAL routing with sideEffects=false', async () => {
    await prisma.deviceConnectionPhysicalState.create({
      data: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
        bindingKey: binding.bindingKey,
        effectiveState: 'UNPLUGGED',
        evidenceObservedAt: new Date('2026-08-01T10:00:00.000Z'),
        evidenceSource: 'WEBHOOK',
        evidenceReferenceId: 'seed:unplugged',
        stateVersion: 1,
      },
    });
    await cutoverService.attemptAuthorityCutover({
      scope: scope(),
      signedEvidenceBundle: signedBundleForScope(),
    });

    await webhookService.processValidatedWebhookEvent({
      vehicle: { id: fixture.vehicle.id, organizationId: fixture.org.id },
      tokenId: fixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T17:01:20.000Z'),
      rawPayload: { obdIsPluggedIn: true },
    });
    await webhookService.processValidatedWebhookEvent({
      vehicle: { id: fixture.vehicle.id, organizationId: fixture.org.id },
      tokenId: fixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T17:01:21.000Z'),
      rawPayload: { obdIsPluggedIn: true },
    });

    expect(
      await prisma.deviceConnectionEpisode.count({ where: { vehicleId: fixture.vehicle.id } }),
    ).toBe(0);
    expect(
      await prisma.deviceConnectionPhysicalStateActionOutbox.count({
        where: { vehicleId: fixture.vehicle.id },
      }),
    ).toBe(0);
  });
});
