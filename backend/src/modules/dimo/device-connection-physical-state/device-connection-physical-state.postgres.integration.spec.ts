import { PrismaClient, DeviceConnectionPhysicalEvidenceSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalStateRepository } from './device-connection-physical-state.repository';
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

describePg('DeviceConnectionPhysicalStateRepository (postgres)', () => {
  let prisma: PrismaClient;
  let repository: DeviceConnectionPhysicalStateRepository;
  let fixture: PhysicalStatePostgresFixture;
  let binding: ReturnType<typeof buildBindingScopeFromToken>;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
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

  function evidence(
    at: string,
    state: 'PLUGGED' | 'UNPLUGGED',
    ref: string,
    source: DeviceConnectionPhysicalEvidenceSource = DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
  ) {
    return {
      candidateState: state,
      evidenceObservedAt: new Date(at),
      evidenceSource: source,
      evidenceReferenceId: ref,
    };
  }

  function webhookEvidence(at: string, state: 'PLUGGED' | 'UNPLUGGED', ref: string) {
    return evidence(at, state, ref, DeviceConnectionPhysicalEvidenceSource.WEBHOOK);
  }

  function baseInput(
    ev: ReturnType<typeof evidence>,
    overrides: Partial<Parameters<DeviceConnectionPhysicalStateRepository['reconcileEvidence']>[0]> = {},
  ) {
    return {
      organizationId: fixture.org.id,
      vehicleId: fixture.vehicle.id,
      tokenId: fixture.tokenId,
      binding,
      evidence: ev,
      ...overrides,
    };
  }

  it('1. creates first authority row (ESTABLISHED baseline)', async () => {
    const result = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'wh-1')),
    );
    expect(result.decision).toBe('ESTABLISHED');
    expect(result.projection?.stateVersion).toBe(1);
    expect(result.episodeAction).toBe('none');
    expect(result.context.previousState).toBeNull();
    expect(result.context.resultingState).toBe('UNPLUGGED');
  });

  it('2. duplicate concurrent first writers — one row, one DUPLICATE', async () => {
    const input = baseInput(webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'wh-dup'));
    const [a, b] = await Promise.all([
      repository.reconcileEvidence(input),
      repository.reconcileEvidence(input),
    ]);
    const decisions = [a.decision, b.decision].sort();
    expect(decisions).toEqual(['DUPLICATE', 'ESTABLISHED']);
    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('3. different concurrent first writers — newest physical-time evidence wins', async () => {
    const t1 = '2026-09-12T14:27:51.000Z';
    const t2 = '2026-09-12T14:27:52.000Z';
    const unplug = baseInput(webhookEvidence(t1, 'UNPLUGGED', 'wh-a'));
    const plug = baseInput(webhookEvidence(t2, 'PLUGGED', 'wh-b'));
    const [a, b] = await Promise.all([
      repository.reconcileEvidence(unplug),
      repository.reconcileEvidence(plug),
    ]);
    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.effectiveState).toBe('PLUGGED');
    expect(rows[0]?.evidenceReferenceId).toBe('wh-b');
    expect(rows[0]?.evidenceObservedAt.toISOString()).toBe(new Date(t2).toISOString());
    expect(rows[0]?.stateVersion).toBeGreaterThanOrEqual(1);
    const decisions = new Set([a.decision, b.decision]);
    expect(decisions.has('ESTABLISHED') || decisions.has('APPLIED')).toBe(true);
  });

  it('4. concurrent opposing-state updates on existing projection — T2 PLUG wins', async () => {
    const tBase = '2026-09-12T14:00:00.000Z';
    const t1 = '2026-09-12T15:00:00.000Z';
    const t2 = '2026-09-12T15:00:01.000Z';
    await repository.reconcileEvidence(
      baseInput(webhookEvidence(tBase, 'PLUGGED', 'wh-base')),
    );
    const baseVersion = (
      await prisma.deviceConnectionPhysicalState.findFirst({
        where: { vehicleId: fixture.vehicle.id },
      })
    )?.stateVersion;
    expect(baseVersion).toBe(1);

    const [toUnplug, toPlug] = await Promise.all([
      repository.reconcileEvidence(
        baseInput(webhookEvidence(t1, 'UNPLUGGED', 'wh-unplug')),
      ),
      repository.reconcileEvidence(
        baseInput(webhookEvidence(t2, 'PLUGGED', 'wh-plug')),
      ),
    ]);
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(row).toBeTruthy();
    expect(row!.effectiveState).toBe('PLUGGED');
    expect(row!.evidenceReferenceId).toBe('wh-plug');
    expect(row!.evidenceObservedAt.toISOString()).toBe(new Date(t2).toISOString());
    expect(row!.stateVersion).toBeGreaterThan(baseVersion!);
    const authorityRows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(authorityRows).toHaveLength(1);
  });

  it('5-6. loser re-evaluated after winner commits', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T16:00:00.000Z', 'PLUGGED', 'wh-new')),
    );
    const stale = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T14:00:00.000Z', 'UNPLUGGED', 'wh-old')),
    );
    expect(stale.decision).toBe('STALE');
    expect(stale.context.resultingState).toBe('PLUGGED');
  });

  it('7. stateVersion monotonic across applied transitions', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T14:00:00.000Z', 'UNPLUGGED', 'v1')),
    );
    const second = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T15:00:00.000Z', 'PLUGGED', 'v2')),
    );
    const third = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T16:00:00.000Z', 'UNPLUGGED', 'v3')),
    );
    expect(second.projection?.stateVersion).toBe(2);
    expect(third.projection?.stateVersion).toBe(3);
  });

  it('9. equal timestamp opposing states -> CONFLICT', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T15:00:00.000Z', 'PLUGGED', 'snap',), {
        evidence: {
          candidateState: 'PLUGGED',
          evidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'snap',
        },
      }),
    );
    const conflict = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T15:00:00.000Z', 'UNPLUGGED', 'wh'), {
        evidence: {
          candidateState: 'UNPLUGGED',
          evidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
          evidenceReferenceId: 'wh',
        },
      }),
    );
    expect(conflict.decision).toBe('CONFLICT');
    expect(conflict.context.resultingState).toBe('PLUGGED');
  });

  it('10. transaction rollback leaves no projection when tenant mismatches', async () => {
    await expect(
      repository.reconcileEvidence({
        organizationId: '00000000-0000-0000-0000-000000000099',
        vehicleId: fixture.vehicle.id,
        tokenId: fixture.tokenId,
        binding,
        evidence: webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'bad-org'),
      }),
    ).rejects.toThrow('physical_state_vehicle_tenant_mismatch');

    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(rows).toHaveLength(0);
    const audits = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(audits).toHaveLength(0);
  });

  it('11. idempotent audit insertion under concurrency', async () => {
    const input = baseInput(webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'audit-dup'));
    await Promise.all([repository.reconcileEvidence(input), repository.reconcileEvidence(input)]);
    const audits = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('12. binding identity convergence — deviceBindingId enrichment does not split rows', async () => {
    const withoutLink = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId,
    });
    await repository.reconcileEvidence({
      ...baseInput(webhookEvidence('2026-09-12T14:00:00.000Z', 'PLUGGED', 'bind-1')),
      binding: withoutLink,
    });
    const withLink = buildBindingScopeFromToken({
      provider: 'dimo',
      tokenId: fixture.tokenId,
      deviceBindingId: 'data-source-link-uuid',
    });
    await repository.reconcileEvidence({
      ...baseInput(webhookEvidence('2026-09-12T15:00:00.000Z', 'UNPLUGGED', 'bind-2')),
      binding: withLink,
    });
    const rows = await prisma.deviceConnectionPhysicalState.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceBindingId).toBe('data-source-link-uuid');
    expect(rows[0]?.bindingKey).toBe(withoutLink.bindingKey);
  });

  it('13. GT-R1 regression path', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-08-01T10:00:00.000Z', 'UNPLUGGED', 'wh-hist')),
    );
    const selfHeal = await repository.reconcileEvidence({
      ...baseInput({
        candidateState: 'PLUGGED',
        evidenceObservedAt: new Date('2026-09-12T15:02:29.000Z'),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-plug-gt-r1',
      }),
      selfHeal: true,
    });
    expect(selfHeal.decision).toBe('APPLIED');
    expect(selfHeal.episodeAction).toBe('none');
    expect(selfHeal.context.selfHeal).toBe(true);

    const unplug = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T16:27:51.000Z', 'UNPLUGGED', 'wh-gt-r1')),
    );
    expect(unplug.decision).toBe('APPLIED');
    expect(unplug.episodeAction).toBe('open_unplug');

    const duplicate = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T16:27:51.000Z', 'UNPLUGGED', 'wh-gt-r1')),
    );
    expect(duplicate.decision).toBe('DUPLICATE');
    expect(duplicate.episodeAction).toBe('none');
  });

  it('14. repeated identical evidence returns DUPLICATE', async () => {
    const input = baseInput(webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'same'));
    const first = await repository.reconcileEvidence(input);
    const second = await repository.reconcileEvidence(input);
    expect(first.decision).toBe('ESTABLISHED');
    expect(second.decision).toBe('DUPLICATE');
  });

  it('15. side-effect intents survive retry without execution (Phase 1 projection-only)', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T15:02:29.000Z', 'PLUGGED', 'snap'), {
        evidence: {
          candidateState: 'PLUGGED',
          evidenceObservedAt: new Date('2026-09-12T15:02:29.000Z'),
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'snap',
        },
        selfHeal: true,
      }),
    );
    const first = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T16:27:51.000Z', 'UNPLUGGED', 'wh-retry')),
    );
    const retry = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T16:27:51.000Z', 'UNPLUGGED', 'wh-retry')),
    );
    expect(first.episodeAction).toBe('open_unplug');
    expect(retry.decision).toBe('DUPLICATE');
    expect(retry.episodeAction).toBe('none');
    const episodes = await prisma.deviceConnectionEpisode.findMany({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(episodes).toHaveLength(0);
  });

  it('16. TEXT organization/vehicle identifiers work without UUID casts', async () => {
    const textOrgId = `org-text-${fixture.suffix}`;
    const textVehicleId = `veh-text-${fixture.suffix}`;
    const textOrg = await prisma.organization.create({
      data: {
        id: textOrgId,
        companyName: `TEXT ID org ${fixture.suffix}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const textVehicle = await prisma.vehicle.create({
      data: {
        id: textVehicleId,
        organizationId: textOrg.id,
        vin: `TXT${fixture.suffix}`.slice(0, 17).padEnd(17, '1'),
        licensePlate: `TX-${fixture.suffix}`.slice(0, 12),
        make: 'Test',
        model: 'TextId',
        year: 2024,
        fuelType: 'GASOLINE',
        status: 'AVAILABLE',
        hardwareType: 'LTE_R1',
      },
      select: { id: true },
    });
    const textBinding = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId + 1,
    });
    const result = await repository.reconcileEvidence({
      organizationId: textOrg.id,
      vehicleId: textVehicle.id,
      tokenId: fixture.tokenId + 1,
      binding: textBinding,
      evidence: webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'text-id-wh'),
    });
    expect(result.decision).toBe('ESTABLISHED');
    const row = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: textVehicle.id, organizationId: textOrg.id },
    });
    expect(row?.organizationId).toBe(textOrgId);
    expect(row?.vehicleId).toBe(textVehicleId);

    await prisma.deviceConnectionPhysicalStateTransition.deleteMany({
      where: { vehicleId: textVehicle.id },
    });
    await prisma.deviceConnectionPhysicalState.deleteMany({
      where: { vehicleId: textVehicle.id },
    });
    await prisma.vehicle.delete({ where: { id: textVehicle.id } });
    await prisma.organization.delete({ where: { id: textOrg.id } });
  });

  it('17. STALE/CONFLICT audit rows persist candidate_state', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T15:00:00.000Z', 'PLUGGED', 'snap'), {
        evidence: {
          candidateState: 'PLUGGED',
          evidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
          evidenceReferenceId: 'snap',
        },
      }),
    );
    const stale = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T14:00:00.000Z', 'UNPLUGGED', 'wh-old')),
    );
    expect(stale.decision).toBe('STALE');
    const staleAudit = await prisma.deviceConnectionPhysicalStateTransition.findFirst({
      where: { vehicleId: fixture.vehicle.id, decision: 'STALE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(staleAudit?.candidateState).toBe('UNPLUGGED');
    expect(staleAudit?.effectiveState).toBeNull();

    const conflict = await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T15:00:00.000Z', 'UNPLUGGED', 'wh-conflict'), {
        evidence: {
          candidateState: 'UNPLUGGED',
          evidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
          evidenceSource: DeviceConnectionPhysicalEvidenceSource.WEBHOOK,
          evidenceReferenceId: 'wh-conflict',
        },
      }),
    );
    expect(conflict.decision).toBe('CONFLICT');
    const conflictAudit = await prisma.deviceConnectionPhysicalStateTransition.findFirst({
      where: { vehicleId: fixture.vehicle.id, decision: 'CONFLICT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(conflictAudit?.candidateState).toBe('UNPLUGGED');
    expect(conflictAudit?.effectiveState).toBeNull();
  });

  it('18. exact-retry evidence collapses to one audit row (idempotent ledger)', async () => {
    const input = baseInput(webhookEvidence('2026-09-12T14:27:51.000Z', 'UNPLUGGED', 'ledger-dup'));
    await repository.reconcileEvidence(input);
    await repository.reconcileEvidence(input);
    await repository.reconcileEvidence(input);
    const audits = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: {
        vehicleId: fixture.vehicle.id,
        evidenceReferenceId: 'ledger-dup',
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.candidateState).toBe('UNPLUGGED');
  });

  it('snapshot-only UNPLUG does not emit episode intent (phase 1 deferred)', async () => {
    await repository.reconcileEvidence(
      baseInput(webhookEvidence('2026-09-12T14:00:00.000Z', 'PLUGGED', 'wh-plug')),
    );
    const snapshotUnplug = await repository.reconcileEvidence({
      ...baseInput({
        candidateState: 'UNPLUGGED',
        evidenceObservedAt: new Date('2026-09-12T15:00:00.000Z'),
        evidenceSource: DeviceConnectionPhysicalEvidenceSource.SNAPSHOT_OBD,
        evidenceReferenceId: 'snap-unplug',
      }),
    });
    expect(snapshotUnplug.decision).toBe('APPLIED');
    expect(snapshotUnplug.episodeAction).toBe('none');
  });
});
