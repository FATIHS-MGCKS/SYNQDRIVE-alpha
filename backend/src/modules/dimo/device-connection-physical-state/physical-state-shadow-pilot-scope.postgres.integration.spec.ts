import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from '@config/connectivity-physical-state.config';
import { CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV } from '@config/connectivity-physical-state-runtime.config';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import { DeviceConnectionPhysicalStateActionOutboxRepository } from './device-connection-physical-state-action-outbox.repository';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStateReconcileCoordinator } from './physical-state-reconcile.coordinator';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PhysicalStateShadowObservationRepository } from './physical-state-shadow-observation.repository';
import { PhysicalStateShadowObservabilityService } from './physical-state-shadow-observability.service';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  disablePhysicalStateStatefulShadowEnv,
  enablePhysicalStateStatefulShadowEnv,
  pilotScopeForFixture,
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

async function countArtifacts(prisma: PrismaClient, vehicleId: string) {
  const [authority, projections, transitions, events, outbox, observations] = await Promise.all([
    prisma.deviceConnectionPhysicalAuthorityCutover.count({ where: { vehicleId } }),
    prisma.deviceConnectionPhysicalState.count({ where: { vehicleId } }),
    prisma.deviceConnectionPhysicalStateTransition.count({ where: { vehicleId } }),
    prisma.dimoDeviceConnectionEvent.count({ where: { vehicleId } }),
    prisma.deviceConnectionPhysicalStateActionOutbox.count({ where: { vehicleId } }),
    prisma.deviceConnectionPhysicalStateShadowObservation.count({ where: { vehicleId } }),
  ]);
  return { authority, projections, transitions, events, outbox, observations };
}

describePg('PhysicalState shadow pilot scope gate (postgres)', () => {
  let prisma: PrismaClient;
  let writer: PhysicalStateEvidenceWriterService;
  let observationRepository: PhysicalStateShadowObservationRepository;
  let metricsStub: TripMetricsService;
  let pilotFixture: PhysicalStatePostgresFixture;
  let nonPilotFixture: PhysicalStatePostgresFixture;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    const prismaService = prisma as unknown as PrismaService;
    const repository = new DeviceConnectionPhysicalStateRepository(prismaService);
    const authorityRepository = new DeviceConnectionPhysicalAuthorityCutoverRepository(prismaService);
    observationRepository = new PhysicalStateShadowObservationRepository(prismaService);
    metricsStub = {
      connectivityPhysicalStateShadowEvaluationTotal: { inc: jest.fn() },
      connectivityPhysicalStateShadowClassificationTotal: { inc: jest.fn() },
      connectivityPhysicalStateShadowCorrectnessBlockerTotal: { inc: jest.fn() },
      connectivityPhysicalStateShadowPilotScopeGateTotal: { inc: jest.fn() },
      connectivityPhysicalStateStatefulShadowEvaluationTotal: { inc: jest.fn() },
      connectivityPhysicalStateEvidenceWriterTotal: { inc: jest.fn() },
      connectivityPhysicalStateGtR1ExpectedFixTotal: { inc: jest.fn() },
    } as unknown as TripMetricsService;
    const shadowObservability = new PhysicalStateShadowObservabilityService(
      metricsStub,
      observationRepository,
    );
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
      shadowObservability,
      metricsStub,
    );
  });

  beforeEach(async () => {
    pilotFixture = await createPhysicalStatePostgresFixture(prisma);
    nonPilotFixture = await createPhysicalStatePostgresFixture(prisma);
    enablePhysicalStateStatefulShadowEnv([pilotScopeForFixture(pilotFixture)]);
  });

  afterEach(async () => {
    disablePhysicalStateStatefulShadowEnv();
    await cleanupPhysicalStatePostgresFixture(prisma, pilotFixture);
    await cleanupPhysicalStatePostgresFixture(prisma, nonPilotFixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const legacyShadow = {
    accepted: true,
    diagnosticReason: null,
    effectivePlugState: 'plugged' as const,
    evidenceObservedAt: new Date('2026-09-12T10:00:00.000Z'),
    bindingKey: 'DIMO:device:legacy',
  };

  it('PSG-K non-pilot webhook has zero physical-state mutation deltas', async () => {
    const before = await countArtifacts(prisma, nonPilotFixture.vehicle.id);
    const result = await writer.writeWebhookEvidence({
      organizationId: nonPilotFixture.org.id,
      vehicleId: nonPilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: nonPilotFixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T10:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-non-pilot',
      legacyShadow,
    });
    const after = await countArtifacts(prisma, nonPilotFixture.vehicle.id);

    expect(result.skippedReason).toContain('pilot_scope_denied');
    expect(after.authority - before.authority).toBe(0);
    expect(after.projections - before.projections).toBe(0);
    expect(after.transitions - before.transitions).toBe(0);
    expect(after.events - before.events).toBe(0);
    expect(after.outbox - before.outbox).toBe(0);
    expect(after.observations - before.observations).toBe(0);
  });

  it('PSG-L non-pilot snapshot has zero physical-state mutation deltas', async () => {
    const before = await countArtifacts(prisma, nonPilotFixture.vehicle.id);
    const result = await writer.writeSnapshotEvidence({
      organizationId: nonPilotFixture.org.id,
      vehicleId: nonPilotFixture.vehicle.id,
      tokenId: nonPilotFixture.tokenId,
      signals: { obdIsPluggedIn: true },
      evidenceReferenceId: 'snap-non-pilot',
      legacyShadow,
    });
    const after = await countArtifacts(prisma, nonPilotFixture.vehicle.id);

    expect(result.skippedReason).toContain('pilot_scope_denied');
    expect(after.authority - before.authority).toBe(0);
    expect(after.projections - before.projections).toBe(0);
    expect(after.transitions - before.transitions).toBe(0);
    expect(after.outbox - before.outbox).toBe(0);
  });

  it('PSG-M pilot webhook creates expected shadow durable rows with sideEffects=false', async () => {
    const before = await countArtifacts(prisma, pilotFixture.vehicle.id);
    const result = await writer.writeWebhookEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: pilotFixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T10:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-pilot',
      legacyShadow,
    });
    const after = await countArtifacts(prisma, pilotFixture.vehicle.id);

    expect(result.policy?.statefulShadow).toBe(true);
    expect(after.authority - before.authority).toBe(1);
    expect(after.projections - before.projections).toBeGreaterThanOrEqual(1);
    expect(after.transitions - before.transitions).toBeGreaterThanOrEqual(1);
    expect(after.outbox - before.outbox).toBe(0);
    expect(result.physicalDecision).toBe(DeviceConnectionPhysicalTransitionDecision.ESTABLISHED);
    expect(after.observations - before.observations).toBeGreaterThanOrEqual(1);
  });

  it('PSG-N pilot snapshot creates expected shadow durable rows with sideEffects=false', async () => {
    const before = await countArtifacts(prisma, pilotFixture.vehicle.id);
    const observedAt = '2026-09-12T10:00:00.000Z';
    const result = await writer.writeSnapshotEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      tokenId: pilotFixture.tokenId,
      signals: { obdIsPluggedIn: { value: true, timestamp: observedAt } },
      evidenceReferenceId: 'snap-pilot',
      legacyShadow,
    });
    const after = await countArtifacts(prisma, pilotFixture.vehicle.id);

    expect(result.policy?.statefulShadow).toBe(true);
    expect(after.authority - before.authority).toBeGreaterThanOrEqual(0);
    expect(after.projections - before.projections).toBeGreaterThanOrEqual(1);
    expect(after.outbox - before.outbox).toBe(0);
    expect(after.observations - before.observations).toBeGreaterThanOrEqual(1);
  });

  it('PSG-J binding replacement remains pilot-allowed for same authority scope', async () => {
    const replacementTokenId = pilotFixture.tokenId + 1;
    const binding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: replacementTokenId });
    const before = await countArtifacts(prisma, pilotFixture.vehicle.id);
    const result = await writer.writeWebhookEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: replacementTokenId,
      deviceBindingId: 'binding-replacement',
      pluggedIn: true,
      observedAt: new Date('2026-09-12T11:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-pilot-replacement',
      legacyShadow: { ...legacyShadow, bindingKey: binding.bindingKey },
    });
    const after = await countArtifacts(prisma, pilotFixture.vehicle.id);

    expect(result.policy?.pilotScopeAllowed).toBe(true);
    expect(after.authority - before.authority).toBeLessThanOrEqual(1);
    expect(after.projections - before.projections).toBeGreaterThanOrEqual(1);
  });

  it('PSG-P/Q PHYSICAL-latched non-pilot scope bypasses pilot gate', async () => {
    const authorityRepository = new DeviceConnectionPhysicalAuthorityCutoverRepository(
      prisma as unknown as PrismaService,
    );
    await prisma.$transaction(async (tx) => {
      await authorityRepository.ensureAuthorityRow(tx, {
        organizationId: nonPilotFixture.org.id,
        vehicleId: nonPilotFixture.vehicle.id,
        provider: 'DIMO',
      });
      await tx.deviceConnectionPhysicalAuthorityCutover.updateMany({
        where: {
          organizationId: nonPilotFixture.org.id,
          vehicleId: nonPilotFixture.vehicle.id,
          provider: 'DIMO',
        },
        data: {
          authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
          latchedAt: new Date(),
          latchedBy: 'psg-p-test',
        },
      });
    });

    disablePhysicalStateStatefulShadowEnv();
    process.env[CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV] = 'true';
    process.env[CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV] = 'true';

    const policy = await writer.resolveRuntimePolicy({
      organizationId: nonPilotFixture.org.id,
      vehicleId: nonPilotFixture.vehicle.id,
      provider: 'DIMO',
    });

    expect(policy.physicalGateAuthoritative).toBe(true);
    expect(policy.pilotGateReason).toBe('BYPASSED_PHYSICAL_AUTHORITY');
    expect(await writer.shouldRoutePhysicalAuthority({
      organizationId: nonPilotFixture.org.id,
      vehicleId: nonPilotFixture.vehicle.id,
      provider: 'DIMO',
    })).toBe(true);
  });

  it('PSG-W multi-tenant proof: only pilot scope mutates', async () => {
    const pilotBefore = await countArtifacts(prisma, pilotFixture.vehicle.id);
    const nonPilotBefore = await countArtifacts(prisma, nonPilotFixture.vehicle.id);

    await writer.writeWebhookEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: pilotFixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T12:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-pilot-mt',
      legacyShadow,
    });
    await writer.writeWebhookEvidence({
      organizationId: nonPilotFixture.org.id,
      vehicleId: nonPilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: nonPilotFixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-09-12T12:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-non-pilot-mt',
      legacyShadow,
    });

    const pilotAfter = await countArtifacts(prisma, pilotFixture.vehicle.id);
    const nonPilotAfter = await countArtifacts(prisma, nonPilotFixture.vehicle.id);

    expect(pilotAfter.authority - pilotBefore.authority).toBeGreaterThanOrEqual(1);
    expect(pilotAfter.projections - pilotBefore.projections).toBeGreaterThanOrEqual(1);
    expect(nonPilotAfter.authority - nonPilotBefore.authority).toBe(0);
    expect(nonPilotAfter.projections - nonPilotBefore.projections).toBe(0);
    expect(nonPilotAfter.transitions - nonPilotBefore.transitions).toBe(0);
    expect(nonPilotAfter.outbox - nonPilotBefore.outbox).toBe(0);
  });

  it('durable shadow observation query supports scope/time window counts', async () => {
    const observedAt = new Date('2026-09-12T13:00:00.000Z');
    const binding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: pilotFixture.tokenId,
    });
    await writer.writeWebhookEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: pilotFixture.tokenId,
      pluggedIn: true,
      observedAt,
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-pilot-obs',
      legacyShadow: {
        ...legacyShadow,
        bindingKey: binding.bindingKey,
        evidenceObservedAt: observedAt,
      },
    });

    const summary = await observationRepository.summarizeScopeWindow({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: new Date('2026-09-12T00:00:00.000Z'),
      windowEnd: new Date('2026-09-13T00:00:00.000Z'),
    });

    expect(summary.comparisonCount).toBeGreaterThanOrEqual(1);
    expect(summary.correctnessBlockerCount).toBe(0);
  });
});
