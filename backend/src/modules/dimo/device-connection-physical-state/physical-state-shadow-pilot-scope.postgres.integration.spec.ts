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
import { setShadowComparisonClockForTests } from './physical-state-shadow-comparison.clock';
import { CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS } from './physical-state-shadow-operational-evidence.constants';
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
    setShadowComparisonClockForTests(null);
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

  it('durable shadow observation query supports scope/time window counts on comparison runtime time', async () => {
    const comparisonObservedAt = new Date('2026-09-16T13:00:00.000Z');
    const evidenceObservedAt = new Date('2026-09-08T10:00:00.000Z');
    setShadowComparisonClockForTests(() => comparisonObservedAt);
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
      observedAt: evidenceObservedAt,
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-pilot-obs',
      legacyShadow: {
        ...legacyShadow,
        bindingKey: binding.bindingKey,
        evidenceObservedAt,
      },
    });

    const operationalWindow = await observationRepository.summarizeScopeWindow({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: new Date('2026-09-16T00:00:00.000Z'),
      windowEnd: new Date('2026-09-17T00:00:00.000Z'),
    });
    const evidenceTimeWindow = await observationRepository.summarizeScopeWindow({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: new Date('2026-09-08T00:00:00.000Z'),
      windowEnd: new Date('2026-09-09T00:00:00.000Z'),
    });

    expect(operationalWindow.comparisonCount).toBeGreaterThanOrEqual(1);
    expect(operationalWindow.correctnessBlockerCount).toBe(0);
    expect(evidenceTimeWindow.comparisonCount).toBe(0);

    const row = await prisma.deviceConnectionPhysicalStateShadowObservation.findFirst({
      where: { vehicleId: pilotFixture.vehicle.id, evidenceReferenceId: 'wh-pilot-obs' },
    });
    expect(row?.observedAt.toISOString()).toBe(comparisonObservedAt.toISOString());
    expect(row?.evidenceObservedAt?.toISOString()).toBe(evidenceObservedAt.toISOString());
  });

  it('PSG-TIME-0A old correctness-blocking observation before restart T0 excluded from new epoch summary', async () => {
    const preRestartComparison = new Date('2026-09-16T20:17:48.000Z');
    const postRestartComparison = new Date('2026-09-17T10:00:00.000Z');
    const pilotRestartT0 = new Date('2026-09-17T00:00:00.000Z');

    setShadowComparisonClockForTests(() => preRestartComparison);
    await prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        classification: 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT',
        correctnessBlocking: true,
        authorityMode: 'LEGACY',
        legacyDecision: 'reject',
        physicalDecision: 'accept',
        evidenceReferenceId: 'legacy-bootstrap-blocker',
        bindingKey: 'DIMO:device:legacy-blocker',
        observedAt: preRestartComparison,
        evidenceObservedAt: new Date('2026-09-16T12:00:00.000Z'),
      },
    });

    setShadowComparisonClockForTests(() => postRestartComparison);
    await prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        classification: 'MATCH',
        correctnessBlocking: false,
        authorityMode: 'LEGACY',
        legacyDecision: 'accept',
        physicalDecision: 'accept',
        evidenceReferenceId: 'post-restart-match',
        bindingKey: 'DIMO:device:post-restart',
        observedAt: postRestartComparison,
        evidenceObservedAt: new Date('2026-09-17T09:00:00.000Z'),
      },
    });

    const allTime = await observationRepository.summarizeScopeWindow({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: new Date('2026-09-16T00:00:00.000Z'),
      windowEnd: new Date('2026-09-18T00:00:00.000Z'),
    });
    const newEpoch = await observationRepository.summarizeScopeWindow({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: pilotRestartT0,
      windowEnd: new Date('2026-09-18T00:00:00.000Z'),
    });

    expect(allTime.correctnessBlockerCount).toBeGreaterThanOrEqual(1);
    expect(newEpoch.correctnessBlockerCount).toBe(0);
    expect(newEpoch.comparisonCount).toBeGreaterThanOrEqual(1);
  });

  it('PSG-TIME-0B old prefix cannot backdate new 7-day operational window', async () => {
    const pilotRestartT0 = new Date('2026-09-17T00:00:00.000Z');
    const oldComparison = new Date('2026-09-08T10:00:00.000Z');
    const newComparison = new Date('2026-09-17T12:00:00.000Z');

    await prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        classification: 'MATCH',
        correctnessBlocking: false,
        authorityMode: 'LEGACY',
        legacyDecision: 'accept',
        physicalDecision: 'accept',
        evidenceReferenceId: 'old-prefix-observation',
        bindingKey: 'DIMO:device:old-prefix',
        observedAt: oldComparison,
        evidenceObservedAt: new Date('2026-09-08T09:00:00.000Z'),
      },
    });

    await prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        classification: 'MATCH',
        correctnessBlocking: false,
        authorityMode: 'LEGACY',
        legacyDecision: 'accept',
        physicalDecision: 'accept',
        evidenceReferenceId: 'post-restart-observation',
        bindingKey: 'DIMO:device:post-restart',
        observedAt: newComparison,
        evidenceObservedAt: new Date('2026-09-17T11:00:00.000Z'),
      },
    });

    const coverage = await observationRepository.getOperationalCoverage({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: pilotRestartT0,
    });

    expect(coverage.comparisonCount).toBe(1);
    expect(coverage.firstComparisonObservedAt?.toISOString()).toBe(newComparison.toISOString());
    expect(coverage.firstComparisonObservedAt?.getTime()).toBeGreaterThanOrEqual(
      pilotRestartT0.getTime(),
    );
    expect(coverage.actualObservedSpanMs).toBeLessThan(
      CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS,
    );
    expect(coverage.sevenDayOperationalWindowProven).toBe(false);
  });

  it('PSG-TIME-0C post-restart observations spanning >=7 days prove operational window', async () => {
    const pilotRestartT0 = new Date('2026-09-01T00:00:00.000Z');
    const firstPostRestart = new Date('2026-09-02T00:00:00.000Z');
    const lastPostRestart = new Date('2026-09-10T12:00:00.000Z');

    await prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        classification: 'MATCH',
        correctnessBlocking: false,
        authorityMode: 'LEGACY',
        legacyDecision: 'accept',
        physicalDecision: 'accept',
        evidenceReferenceId: 'epoch-first',
        bindingKey: 'DIMO:device:epoch-first',
        observedAt: firstPostRestart,
        evidenceObservedAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    });

    await prisma.deviceConnectionPhysicalStateShadowObservation.create({
      data: {
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        classification: 'MATCH',
        correctnessBlocking: false,
        authorityMode: 'LEGACY',
        legacyDecision: 'accept',
        physicalDecision: 'accept',
        evidenceReferenceId: 'epoch-last',
        bindingKey: 'DIMO:device:epoch-last',
        observedAt: lastPostRestart,
        evidenceObservedAt: new Date('2026-09-10T12:00:00.000Z'),
      },
    });

    const coverage = await observationRepository.getOperationalCoverage({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: pilotRestartT0,
    });

    expect(coverage.comparisonCount).toBe(2);
    expect(coverage.actualObservedSpanMs).toBeGreaterThanOrEqual(
      CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS,
    );
    expect(coverage.sevenDayOperationalWindowProven).toBe(true);
  });

  it('PSG-TIME-1 historical evidence cannot backdate operational seven-day proof', async () => {
    const comparisonNow = new Date('2026-09-16T12:00:00.000Z');
    const oldEvidence = new Date('2026-09-08T10:00:00.000Z');
    setShadowComparisonClockForTests(() => comparisonNow);

    for (let i = 0; i < 3; i += 1) {
      await writer.writeWebhookEvidence({
        organizationId: pilotFixture.org.id,
        vehicleId: pilotFixture.vehicle.id,
        provider: 'DIMO',
        tokenId: pilotFixture.tokenId,
        pluggedIn: true,
        observedAt: oldEvidence,
        rawPayload: { pluggedIn: true },
        evidenceReferenceId: `wh-time1-${i}`,
        legacyShadow: {
          ...legacyShadow,
          evidenceObservedAt: oldEvidence,
        },
      });
    }

    const coverage = await observationRepository.getOperationalCoverage({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: new Date('2026-09-16T00:00:00.000Z'),
    });

    expect(coverage.comparisonCount).toBeGreaterThanOrEqual(3);
    expect(coverage.actualObservedSpanMs).toBeLessThan(
      CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS,
    );
    expect(coverage.sevenDayOperationalWindowProven).toBe(false);
  });

  it('PSG-TIME-2 actual runtime comparison span can prove seven-day operational window', async () => {
    const firstComparison = new Date('2026-09-01T00:00:00.000Z');
    const lastComparison = new Date('2026-09-08T12:00:00.000Z');

    setShadowComparisonClockForTests(() => firstComparison);
    await writer.writeWebhookEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: pilotFixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-08-20T10:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-time2-first',
      legacyShadow: {
        ...legacyShadow,
        evidenceObservedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
    });

    setShadowComparisonClockForTests(() => lastComparison);
    await writer.writeWebhookEvidence({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      tokenId: pilotFixture.tokenId,
      pluggedIn: true,
      observedAt: new Date('2026-08-25T10:00:00.000Z'),
      rawPayload: { pluggedIn: true },
      evidenceReferenceId: 'wh-time2-last',
      legacyShadow: {
        ...legacyShadow,
        evidenceObservedAt: new Date('2026-08-25T10:00:00.000Z'),
      },
    });

    const coverage = await observationRepository.getOperationalCoverage({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: firstComparison,
    });

    expect(coverage.actualObservedSpanMs).toBeGreaterThanOrEqual(
      CONNECTIVITY_PHYSICAL_STATE_SHADOW_MIN_OPERATIONAL_OBSERVATION_MS,
    );
    expect(coverage.sevenDayOperationalWindowProven).toBe(true);
  });

  it('PSG-TIME invalid operational window fails closed', async () => {
    const coverage = await observationRepository.getOperationalCoverage({
      organizationId: pilotFixture.org.id,
      vehicleId: pilotFixture.vehicle.id,
      provider: 'DIMO',
      windowStart: new Date('invalid'),
    });

    expect(coverage.comparisonCount).toBe(0);
    expect(coverage.sevenDayOperationalWindowProven).toBe(false);
  });
});
