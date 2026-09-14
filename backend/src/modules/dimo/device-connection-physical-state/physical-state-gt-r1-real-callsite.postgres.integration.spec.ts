import {
  DeviceConnectionPhysicalEvidenceSource,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV,
} from '@config/connectivity-physical-state-runtime.config';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from '@config/connectivity-physical-state.config';
import { evaluateOrphanReconciliationEligibility } from '../connectivity/connectivity-lifecycle-runtime.policy';
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { getCoordinatorReconcile } from './device-connection-physical-state.types';
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

describePg('GT-R1 real call-site orchestration (postgres)', () => {
  let prisma: PrismaClient;
  let webhookService: DeviceConnectionWebhookService;
  let orchestrator: PhysicalStateSnapshotEvidenceOrchestrator;
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
    const writer = new PhysicalStateEvidenceWriterService(
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

  it('GT-R1: snapshot orchestrator call-site + webhook service call-site', async () => {
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

    const snapshotResult = await orchestrator.applyPhysicalSnapshotEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: T2 } },
      providerBindingId: null,
      hardwareType: 'LTE_R1',
      sourceSubtype: null,
      fetchedAt: new Date(T2),
      vehicleLatestStateId: 'vls-gt-r1-webhook-callsite',
    });

    expect(snapshotResult?.shadowComparison?.classification).toBe(
      PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
    );
    expect(getCoordinatorReconcile(snapshotResult?.coordinatorResult)?.projection?.effectiveState).toBe(
      'PLUGGED',
    );

    const webhookOutcome = await webhookService.processValidatedWebhookEvent({
      vehicle: { id: fixture.vehicle.id, organizationId: fixture.org.id },
      tokenId: fixture.tokenId,
      pluggedIn: false,
      observedAt: new Date(T3),
      rawPayload: { obdIsPluggedIn: false },
    });

    expect(webhookOutcome.outcome).toBe('created');
    expect(webhookOutcome.eventId).toBeTruthy();

    const projection = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(projection?.effectiveState).toBe('UNPLUGGED');
    expect(projection?.evidenceObservedAt.toISOString()).toBe(new Date(T3).toISOString());

    const events = await prisma.dimoDeviceConnectionEvent.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(events.length).toBeGreaterThanOrEqual(2);

    const episodes = await prisma.deviceConnectionEpisode.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(episodes).toHaveLength(0);

    const outbox = await prisma.deviceConnectionPhysicalStateActionOutbox.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(outbox).toHaveLength(0);
  });
});
