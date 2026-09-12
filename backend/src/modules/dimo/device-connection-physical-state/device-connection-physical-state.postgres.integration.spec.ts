import { PrismaClient, DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  type PhysicalStatePostgresFixture,
} from './testing/physical-state-postgres.integration.harness';

const describePg = process.env.DATABASE_URL ? describe : describe.skip;

describePg('DeviceConnectionPhysicalStateRepository (postgres)', () => {
  let prisma: PrismaClient;
  let repository: DeviceConnectionPhysicalStateRepository;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    repository = new DeviceConnectionPhysicalStateRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
    binding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId,
    });
  });

  afterEach(async () => {
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function webhookEvidence(at: string, state: 'PLUGGED' | 'UNPLUGGED', ref: string) {
    return {
      candidateState: state,
      evidenceObservedAt: new Date(at),
      evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
      evidenceReferenceId: ref,
    };
  }

  it('creates authority row and monotonic stateVersion', async () => {
    const result = await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'wh-1'),
    });

    expect(result.decision).toBe('ESTABLISHED');
    expect(result.projection?.stateVersion).toBe(1);
    expect(result.projection?.effectiveState).toBe('UNPLUGGED');
  });

  it('accepts exactly one concurrent transition and suppresses duplicate', async () => {
    const input = {
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'wh-dup'),
    };

    const [first, second] = await Promise.all([
      repository.reconcileEvidence(input),
      repository.reconcileEvidence(input),
    ]);

    const decisions = [first.decision, second.decision].sort();
    expect(decisions).toContain('ESTABLISHED');
    expect(decisions).toContain('DUPLICATE');

    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stateVersion).toBe(1);
  });

  it('applies newer webhook after snapshot self-heal (GT-R1 regression)', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-08-01T10:00:00.000Z', 'UNPLUGGED', 'wh-hist'),
    });

    const selfHeal = await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date('2026-09-12T15:02:29.000Z'),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-plug-gt-r1',
      },
      selfHeal: true,
    });
    expect(selfHeal.decision).toBe('APPLIED');
    expect(selfHeal.episodeAction).toBe('none');

    const unplug = await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T16:27:51.000Z', 'UNPLUGGED', 'wh-gt-r1'),
    });
    expect(unplug.decision).toBe('APPLIED');
    expect(unplug.episodeAction).toBe('open_unplug');

    const duplicate = await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T16:27:51.000Z', 'UNPLUGGED', 'wh-gt-r1'),
    });
    expect(duplicate.decision).toBe('DUPLICATE');
    expect(duplicate.episodeAction).toBe('none');

    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('UNPLUGGED');
    expect(row?.stateVersion).toBe(3);
  });

  it('does not open snapshot-only unplug episodes (phase 1 deferred)', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T14:00:00.000Z', 'PLUGGED', 'wh-plug'),
    });

    const snapshotUnplug = await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: {
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-unplug',
      },
    });

    expect(snapshotUnplug.decision).toBe('APPLIED');
    expect(snapshotUnplug.episodeAction).toBe('none');
  });

  it('rejects stale writer after newer writer committed', async () => {
    await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T16:00:00.000Z', 'PLUGGED', 'wh-new'),
    });

    const stale = await repository.reconcileEvidence({
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: webhookEvidence('2026-09-12T14:00:00.000Z', 'UNPLUGGED', 'wh-old'),
    });

    expect(stale.decision).toBe('STALE');
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row?.effectiveState).toBe('PLUGGED');
    expect(row?.stateVersion).toBe(1);
  });
});
