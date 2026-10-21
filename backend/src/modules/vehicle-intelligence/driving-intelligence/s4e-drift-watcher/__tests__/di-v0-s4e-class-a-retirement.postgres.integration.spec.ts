import type { PrismaClient } from '@prisma/client';
import { DI_V0_S4_LIMITS } from '../../s4a-foundation/di-v0-s4a-contract';
import { DiV0S4TransitionRejectedError } from '../../s4a-foundation/di-v0-s4a-errors';
import { buildDiV0S4PipelineVersionKey } from '../../s4a-foundation/di-v0-s4a-identity';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import {
  advanceS4aClock,
  assertS4aPostgresCiEnv,
  changeTripBoundary,
  cleanupS4aTenant,
  newS4aClient,
  retireRegistry,
  S4A_POSTGRES_LIVE,
  s4aChannels,
  s4aConfigFor,
  s4aIntervals,
  s4aManifestFor,
  seedS4aTenant,
  settle,
  setKillState,
  waitForControlRowLockWaiter,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4MaintenanceService } from '../di-v0-s4e-maintenance.service';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4E CLASS A retirement hardening (real PostgreSQL)', () => {
  let admin: PrismaClient;
  const tenants: S4aTenant[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await admin?.$disconnect().catch(() => undefined);
  });

  beforeEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    tenants.length = 0;
  });

  afterEach(async () => {
    await setKillState(admin, 'NOT_KILLED');
    for (const t of tenants) {
      await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`;
      await cleanupS4aTenant(admin, t);
    }
  });

  async function tenant(): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin);
    tenants.push(t);
    return t;
  }

  function repo(config = s4aConfigFor(tenants)): DiV0S4WorkItemRepository {
    return new DiV0S4WorkItemRepository(admin, config);
  }

  function maintenance(config = s4aConfigFor(tenants)): DiV0S4MaintenanceService {
    return new DiV0S4MaintenanceService(admin, repo(config), config);
  }

  async function primary(t: S4aTenant, config = s4aConfigFor(tenants)) {
    const manifest = s4aManifestFor(config);
    const r = repo(config);
    const created = await r.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
    });
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    return { r, manifest, created, pvk };
  }

  async function pendingPrimaryCount(pvk: string): Promise<number> {
    const rows = await admin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_work_items
      WHERE pipeline_version_key = ${pvk} AND status = 'PENDING' AND run_purpose = 'PRIMARY'`;
    return Number(rows[0]?.n ?? 0);
  }

  async function registryStatus(pvk: string): Promise<string> {
    const rows = await admin.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM di_v0_s4_pipeline_versions WHERE pipeline_version_key = ${pvk}`;
    return rows[0]?.status ?? 'MISSING';
  }

  async function assertClassA(pvk: string): Promise<void> {
    expect(await registryStatus(pvk)).toBe('RETIRED');
    expect(await pendingPrimaryCount(pvk)).toBe(0);
  }

  it('S4E2-A1 T11 wins registry lock first — retirement waits, no durable PENDING successor', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { created, pvk } = await primary(t, config);
    await changeTripBoundary(admin, t.tripId);

    const connectionA = newS4aClient();
    const connectionB = newS4aClient();
    const observer = newS4aClient();
    const repoA = new DiV0S4WorkItemRepository(connectionA, config);
    const repoB = new DiV0S4WorkItemRepository(connectionB, config);

    let retireOutcome!: ReturnType<typeof settle<{ supersededWorkItemIds: string[] }>>;
    try {
      await connectionA.$transaction(
        async (txA) => {
          // Match repository lock order: control row, then pipeline registry (T11/T12).
          await txA.$queryRaw`SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE`;
          await txA.$queryRaw`
            SELECT status FROM di_v0_s4_pipeline_versions
            WHERE pipeline_version_key = ${pvk} FOR UPDATE`;

          retireOutcome = settle(
            connectionB.$transaction((txB) =>
              repoB.retirePipelineVersion(
                { pipelineVersionKey: pvk, retiredBy: 'S4E2_A1', retiredReason: 'TEST' },
                txB,
              ),
            ),
          );

          await waitForControlRowLockWaiter(observer);

          const preT11 = await txA.$queryRaw<Array<{ status: string }>>`
            SELECT status::text AS status FROM di_v0_s4_work_items WHERE id = ${created.workItemId}`;
          expect(preT11[0]?.status).toBe('PENDING');

          const t11 = await repoA.supersedeOnDrift(
            { workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' },
            txA,
          );
          expect(t11.successorWorkItemId).toBeTruthy();
          expect(await registryStatus(pvk)).toBe('ACTIVE');
        },
        { timeout: 60_000, maxWait: 15_000 },
      );

      const retired = await retireOutcome;
      if (!retired.ok) {
        const detail = retired.error instanceof DiV0S4TransitionRejectedError
          ? `${retired.error.code}:${retired.error.message}`
          : String(retired.error);
        throw new Error(`retirePipelineVersion failed after T11-first interleave: ${detail}`);
      }

      await assertClassA(pvk);
    } finally {
      await connectionA.$disconnect().catch(() => undefined);
      await connectionB.$disconnect().catch(() => undefined);
      await observer.$disconnect().catch(() => undefined);
    }
  }, 90_000);

  it('S4E2-A2 retirement wins first — T11 rejected fail-closed', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, created, pvk } = await primary(t, config);
    await changeTripBoundary(admin, t.tripId);
    await r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A2', retiredReason: 'TEST' });
    await expect(
      r.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' }),
    ).rejects.toMatchObject({
      name: 'DiV0S4TransitionRejectedError',
      code: 'ILLEGAL_SOURCE_STATE',
    } satisfies Partial<DiV0S4TransitionRejectedError>);
    await assertClassA(pvk);
  }, 60_000);

  it('S4E2-A3 former RACE-A interleaving — PENDING PRIMARY under RETIRED = 0', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, created, pvk } = await primary(t, config);
    await changeTripBoundary(admin, t.tripId);
    for (let i = 0; i < 25; i++) {
      await Promise.all([
        r.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' }).catch(() => undefined),
        r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A3', retiredReason: 'TEST' }).catch(() => undefined),
      ]);
      if ((await registryStatus(pvk)) === 'RETIRED') {
        expect(await pendingPrimaryCount(pvk)).toBe(0);
      }
    }
    await assertClassA(pvk);
  }, 120_000);

  it('S4E2-A4 late T11 after maintenance T12 discovery path', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, created, pvk } = await primary(t, config);
    await changeTripBoundary(admin, t.tripId);
    await retireRegistry(admin, pvk, config);
    await maintenance(config).runMaintenancePass();
    await expect(
      r.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' }),
    ).rejects.toThrow(DiV0S4TransitionRejectedError);
    await assertClassA(pvk);
  }, 60_000);

  it('S4E2-A5 over batch limit — authoritative retirement clears all retirable rows', async () => {
    const tripIds: string[] = [];
    for (let i = 0; i < 60; i++) {
      const t = await tenant();
      tripIds.push(t.tripId);
    }
    const config = s4aConfigFor(tenants);
    const manifest = s4aManifestFor(config);
    const pvk = buildDiV0S4PipelineVersionKey(manifest);
    const r = repo(config);
    for (const tripId of tripIds) {
      await r.createWorkItem({
        tripId,
        sourceFamily: 'RUPTELA_R1',
        runPurpose: 'PRIMARY',
        pipelineManifest: manifest,
      });
    }
    const { supersededWorkItemIds } = await r.retirePipelineVersion({
      pipelineVersionKey: pvk,
      retiredBy: 'S4E2_A5',
      retiredReason: 'TEST',
    });
    expect(supersededWorkItemIds.length).toBe(60);
    await assertClassA(pvk);
  }, 120_000);

  it('S4E2-A6 retirement vs claim — claim rejected after RETIRED', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, manifest, created, pvk } = await primary(t, config);
    await r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A6', retiredReason: 'TEST' });
    await expect(r.claim({ leaseOwner: 'a6', pipelineManifest: manifest, workItemId: created.workItemId })).rejects.toThrow(
      DiV0S4TransitionRejectedError,
    );
    await assertClassA(pvk);
  }, 60_000);

  it('S4E2-A7 retirement vs T10 exhaustion — no deadlock', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, manifest, created, pvk } = await primary(t, config);
    for (let i = 0; i < 4; i++) {
      await r.claim({ leaseOwner: `a7-${i}`, pipelineManifest: manifest, workItemId: created.workItemId });
      await advanceS4aClock(admin, t.tripId, DI_V0_S4_LIMITS.leaseDurationSeconds + 60);
    }
    await advanceS4aClock(admin, t.tripId, 400);
    const [reap, retire] = await Promise.allSettled([
      r.reapExhausted({ workItemId: created.workItemId }),
      r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A7', retiredReason: 'TEST' }),
    ]);
    expect(reap.status === 'fulfilled' || retire.status === 'fulfilled').toBe(true);
    expect(await registryStatus(pvk)).toBe('RETIRED');
    expect(await pendingPrimaryCount(pvk)).toBe(0);
  }, 60_000);

  it('S4E2-A8 three-way stress — T11, retire, T12 maintenance', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, created, pvk } = await primary(t, config);
    await changeTripBoundary(admin, t.tripId);
    const m = maintenance(config);
    for (let i = 0; i < 15; i++) {
      await Promise.all([
        r.supersedeOnDrift({ workItemId: created.workItemId, reason: 'BOUNDARY_CHANGED' }).catch(() => undefined),
        r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A8', retiredReason: 'TEST' }).catch(() => undefined),
        m.runMaintenancePass().catch(() => undefined),
      ]);
    }
    if ((await registryStatus(pvk)) === 'RETIRED') {
      await assertClassA(pvk);
    }
  }, 120_000);

  it('S4E2-A9 kill switch blocks authoritative retirement', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, pvk } = await primary(t, config);
    await setKillState(admin, 'KILLED');
    await expect(
      r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A9', retiredReason: 'TEST' }),
    ).rejects.toThrow(/DB_KILL/);
    expect(await registryStatus(pvk)).toBe('ACTIVE');
  }, 60_000);

  it('S4E2-A10 historical evidence preserved across authoritative retirement', async () => {
    const t = await tenant();
    const config = s4aConfigFor(tenants);
    const { r, manifest, created, pvk } = await primary(t, config);
    const lease = await r.claim({ leaseOwner: 'a10', pipelineManifest: manifest, workItemId: created.workItemId });
    await r.pinEvidence(lease, { windowStart: t.startTime, windowEnd: t.endTime, channels: s4aChannels('ev') });
    await r.completeWithS2(lease, { pipelineManifest: manifest, intervals: s4aIntervals() });
    const runsBefore = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    const snapBefore = await admin.$queryRaw<Array<{ snapshot_hash: string }>>`
      SELECT snapshot_hash FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}`;
    await r.retirePipelineVersion({ pipelineVersionKey: pvk, retiredBy: 'S4E2_A10', retiredReason: 'TEST' });
    const runsAfter = await admin.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    const snapAfter = await admin.$queryRaw<Array<{ snapshot_hash: string }>>`
      SELECT snapshot_hash FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}`;
    expect(runsAfter.map((x) => x.id).sort()).toEqual(runsBefore.map((x) => x.id).sort());
    expect(snapAfter.map((x) => x.snapshot_hash).sort()).toEqual(snapBefore.map((x) => x.snapshot_hash).sort());
  }, 90_000);
});
