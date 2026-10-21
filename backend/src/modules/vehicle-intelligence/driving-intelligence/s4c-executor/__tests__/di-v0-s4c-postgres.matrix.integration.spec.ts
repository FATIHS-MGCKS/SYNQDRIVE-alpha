import { createHash, randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  advanceS4aClock,
  changeTripBoundary,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  s4aConfigFor,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { API_SYNTHETIC_IDENTITY, R1_IDENTITY, signalsBody, staticTransport } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { acquireDiV0HistoricalPositions } from '../../position-acquisition/di-v0-position-acquisition';
import { buildDiV0CombinedInputIdentityV03, pinsFromDiV0S4ChannelManifest } from '../../s4a-foundation/di-v0-s4a-identity';
import { buildDiV0S4cPositionPresentChannel } from '../di-v0-s4c-evidence-channels';
import { DiV0S4ClaimLoop } from '../../s4b-orchestration/di-v0-s4b-claim-loop';
import { DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS } from '../../s4b-orchestration/di-v0-s4b-discovery-containment';
import { DiV0S4DiscoveryService } from '../../s4b-orchestration/di-v0-s4b-discovery.service';
import { DiV0S4ExecutorRegistry, type DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { DiV0S4cExecutor, DI_V0_S4C_EXECUTOR_ID } from '../di-v0-s4c-executor';
import { registerDiV0S4cExecutor } from '../di-v0-s4c-register';
import type { DiV0S4cExecutorDeps } from '../di-v0-s4c-types';
import { RUPTELA_DEVICE_IDENTITY } from '../../r1-obd-acquisition/__tests__/fixtures/s3b-r1-fixtures';

assertS4aPostgresCiEnv();

async function linkDimo(admin: PrismaClient, tenant: S4aTenant, rawJson: unknown, tokenId = Math.floor(Math.random() * 1_000_000_000) + 1): Promise<string> {
  const id = randomUUID();
  await admin.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, token_id, raw_json, connection_status, created_at, updated_at)
    VALUES (${id}, ${`s4c-${id}`}, ${tokenId}, ${JSON.stringify(rawJson)}::jsonb, 'CONNECTED', now(), now())`;
  await admin.$executeRaw`UPDATE vehicles SET dimo_vehicle_id = ${id}, hardware_type = 'LTE_R1'::"HardwareType" WHERE id = ${tenant.vehicleId}`;
  return id;
}

function r1Transport(rows: Record<string, unknown>[]) {
  return {
    async executeHistoricalR1ObdQuery() {
      return { data: { signalsHistorical: rows } };
    },
  };
}

function failingR1Transport() {
  return {
    async executeHistoricalR1ObdQuery() {
      throw new Error('R1_PROVIDER_FAIL');
    },
  };
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4C postgres matrix', () => {
  let admin: PrismaClient;
  const clients: PrismaClient[] = [];
  const dimoIds: string[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients) await c.$disconnect().catch(() => undefined);
    await admin.$disconnect().catch(() => undefined);
  });

  afterEach(async () => {
    for (const id of dimoIds.splice(0)) await admin.$executeRaw`DELETE FROM dimo_vehicles WHERE id = ${id}`;
  });

  async function runS4c(
    tenant: S4aTenant,
    rawJson: unknown,
    ports: {
      positionTransport: ReturnType<typeof staticTransport>;
      r1Transport: { executeHistoricalR1ObdQuery: () => Promise<unknown> };
    },
    configEnv: Record<string, string> = {},
    executorFactory?: (registry: DiV0S4ExecutorRegistry, deps: DiV0S4cExecutorDeps) => void,
  ) {
    dimoIds.push(await linkDimo(admin, tenant, rawJson));
    const config = s4aConfigFor([tenant], configEnv);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    const discovery = new DiV0S4DiscoveryService(db, repo, config, pipeline, DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS);
    await discovery.runDiscoveryPass();
    const registry = new DiV0S4ExecutorRegistry();
    const deps: DiV0S4cExecutorDeps = {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: ports.positionTransport,
        r1Transport: ports.r1Transport as DiV0S4cExecutorDeps['ports']['r1Transport'],
      },
    };
    if (executorFactory) executorFactory(registry, deps);
    else registerDiV0S4cExecutor(registry, deps);
    const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, { leaseOwner: `s4c-${randomUUID().slice(0, 8)}` });
    const result = await loop.runOnce();
    return { result, db, tenant, config };
  }

  it('PG-02 RUPTELA_R1 E2E COMPLETED with R1 PRESENT', async () => {
    const tenant = await seedS4aTenant(admin);
    const from = tenant.startTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const { result, db, tenant: t } = await runS4c(
      tenant,
      RUPTELA_DEVICE_IDENTITY,
      {
        positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52.1, longitude: 9.1 } }])),
        r1Transport: r1Transport([{ timestamp: ts, speed: 50, powertrainCombustionEngineSpeed: 2000 }]),
      },
    );
    expect(result).toMatchObject({ status: 'SETTLED' });
    const wi = await db.$queryRaw<Array<{ status: string; source_family: string }>>`
      SELECT status, source_family::text FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`;
    expect(wi[0]).toMatchObject({ status: 'COMPLETED', source_family: 'RUPTELA_R1' });
    const snaps = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}`;
    expect(snaps[0]?.n).toBe(1);
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    expect(runs[0]?.n).toBe(1);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
    await cleanupS4aTenant(admin, t);
  });

  it('PG-03 R1 degraded: POSITION ok, R1 fail → COMPLETED', async () => {
    const tenant = await seedS4aTenant(admin);
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const { result, db, tenant: t } = await runS4c(tenant, R1_IDENTITY, {
      positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }])),
      r1Transport: failingR1Transport(),
    });
    expect(result).toMatchObject({ status: 'SETTLED' });
    expect((await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`)[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
    await cleanupS4aTenant(admin, t);
  });

  it('PG-04 crash after pin: snapshot remains, no S2', async () => {
    const tenant = await seedS4aTenant(admin);
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const { result, db, tenant: t } = await runS4c(
      tenant,
      API_SYNTHETIC_IDENTITY,
      {
        positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }])),
        r1Transport: r1Transport([]),
      },
      {},
      (registry, deps) => {
        const inner = new DiV0S4cExecutor(deps);
        registry.register({
          executorId: DI_V0_S4C_EXECUTOR_ID,
          isReady: () => true,
          async execute(ctx: DiV0S4ExecutionContext) {
            const repo = ctx.repository;
            const proxy = Object.assign(Object.create(Object.getPrototypeOf(repo)), repo, {
              completeWithS2: async () => {
                throw new Error('SIMULATED_CRASH_AFTER_PIN');
              },
            }) as DiV0S4WorkItemRepository;
            return inner.execute({ ...ctx, repository: proxy });
          },
        });
      },
    );
    expect(result.status).toMatch(/RELEASE|SETTLED/);
    const wi = await db.$queryRaw<Array<{ status: string; pinned_snapshot_hash: string | null }>>`
      SELECT status, pinned_snapshot_hash FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`;
    expect(wi[0]?.pinned_snapshot_hash).not.toBeNull();
    expect(wi[0]?.status).not.toBe('COMPLETED');
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    expect(runs[0]?.n).toBe(0);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
    await cleanupS4aTenant(admin, t);
  });

  it('PG-05 boundary drift before provider → SUPERSEDED, no S2', async () => {
    const tenant = await seedS4aTenant(admin);
    let releaseBlock!: () => void;
    const blockPromise = new Promise<void>((res) => {
      releaseBlock = res;
    });
    dimoIds.push(await linkDimo(admin, tenant, API_SYNTHETIC_IDENTITY));
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    await new DiV0S4DiscoveryService(db, repo, config, pipeline, DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS).runDiscoveryPass();
    const registry = new DiV0S4ExecutorRegistry();
    registerDiV0S4cExecutor(registry, {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: {
          async executeHistoricalPositionQuery() {
            await blockPromise;
            return signalsBody([]);
          },
        },
        r1Transport: r1Transport([]),
      },
    });
    const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, { leaseOwner: `s4c-pg05-${randomUUID().slice(0, 6)}` });
    const loopPromise = loop.runOnce();
    await changeTripBoundary(admin, tenant.tripId);
    releaseBlock();
    const result = await loopPromise;
    expect(['SETTLED', 'BOUNDARY_SUPERSEDED']).toContain(result.status);
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi.some((r) => r.status === 'SUPERSEDED')).toBe(true);
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(0);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('PG-12 conflicting duplicate postgres fidelity', async () => {
    const tenant = await seedS4aTenant(admin);
    const base = '2030-06-01T00:00:00Z';
    const label = '2030-06-01T00:00:01Z';
    const acquired = await acquireDiV0HistoricalPositions(
      {
        organizationId: tenant.organizationId,
        vehicleId: tenant.vehicleId,
        tripId: tenant.tripId,
        dimoTokenId: 1,
        dimoDeviceIdentity: API_SYNTHETIC_IDENTITY,
        fromUtc: base,
        toUtc: '2030-06-01T00:00:04Z',
      },
      staticTransport(
        signalsBody([
          { timestamp: label, currentLocationCoordinates: { latitude: 52, longitude: 9 } },
          { timestamp: label, currentLocationCoordinates: { latitude: 53, longitude: 9 } },
        ]),
      ),
      {},
    );
    if (acquired.status !== 'ACQUIRED') throw new Error('acquire failed');
    const pin = buildDiV0S4cPositionPresentChannel(acquired.result);
    expect(pin.payload).toBe(acquired.result.canonicalSnapshotPayload);
    expect(createHash('sha256').update(pin.payload!, 'utf8').digest('hex')).toBe(acquired.result.snapshotIdentity.digest);
    await cleanupS4aTenant(admin, tenant);
  });

  it('PG-06 boundary mutation during acquisition → no S2 completion', async () => {
    const tenant = await seedS4aTenant(admin);
    let releaseBlock!: () => void;
    const blockPromise = new Promise<void>((res) => {
      releaseBlock = res;
    });
    dimoIds.push(await linkDimo(admin, tenant, API_SYNTHETIC_IDENTITY));
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    await new DiV0S4DiscoveryService(db, repo, config, pipeline, DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS).runDiscoveryPass();
    const registry = new DiV0S4ExecutorRegistry();
    registerDiV0S4cExecutor(registry, {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: {
          async executeHistoricalPositionQuery() {
            await blockPromise;
            const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
            return signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }]);
          },
        },
        r1Transport: r1Transport([]),
      },
    });
    const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, { leaseOwner: `s4c-pg06-${randomUUID().slice(0, 6)}` });
    const loopPromise = loop.runOnce();
    await changeTripBoundary(admin, tenant.tripId);
    releaseBlock();
    await loopPromise;
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(0);
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi.some((r) => r.status === 'SUPERSEDED' || r.status === 'PENDING')).toBe(true);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('PG-09 idempotency: one S2 run per completed execution', async () => {
    const tenant = await seedS4aTenant(admin);
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const { db, tenant: t } = await runS4c(tenant, API_SYNTHETIC_IDENTITY, {
      positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }])),
      r1Transport: r1Transport([]),
    });
    const runs1 = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    expect(runs1[0]?.n).toBe(1);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const repo = new DiV0S4WorkItemRepository(db, config);
    const registry = new DiV0S4ExecutorRegistry();
    registerDiV0S4cExecutor(registry, {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }])),
        r1Transport: r1Transport([]),
      },
    });
    const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, { leaseOwner: `s4c-pg09-${randomUUID().slice(0, 6)}` });
    await expect(loop.runOnce()).resolves.toMatchObject({ status: 'IDLE' });
    const runs2 = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${t.tripId}`;
    expect(runs2[0]?.n).toBe(1);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
    await cleanupS4aTenant(admin, t);
  });

  it('PG-11 combined identity determinism matches pinned snapshot manifest', async () => {
    const tenant = await seedS4aTenant(admin);
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const { db, tenant: t } = await runS4c(tenant, API_SYNTHETIC_IDENTITY, {
      positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52.2, longitude: 9.2 } }])),
      r1Transport: r1Transport([]),
    });
    const [wi] = await db.$queryRaw<Array<{ combined_input_identity: string; pinned_snapshot_hash: string }>>`
      SELECT combined_input_identity, pinned_snapshot_hash FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId} AND status = 'COMPLETED'`;
    const [snap] = await db.$queryRaw<Array<{ channel_manifest: unknown; snapshot_hash: string }>>`
      SELECT channel_manifest, snapshot_hash FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${t.tripId}`;
    const recomputed = buildDiV0CombinedInputIdentityV03(pinsFromDiV0S4ChannelManifest(snap.channel_manifest));
    expect(wi.combined_input_identity).toBe(recomputed);
    expect(snap.snapshot_hash).toBe(wi.pinned_snapshot_hash);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
    await cleanupS4aTenant(admin, t);
  });

  it('PG-08 abort before provider: no S2 completion', async () => {
    const tenant = await seedS4aTenant(admin);
    dimoIds.push(await linkDimo(admin, tenant, API_SYNTHETIC_IDENTITY));
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    await new DiV0S4DiscoveryService(db, repo, config, pipeline, DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS).runDiscoveryPass();
    const lease = await repo.claim({ leaseOwner: 'pg08', pipelineManifest: pipeline.manifest });
    const controller = new AbortController();
    controller.abort();
    const executor = new DiV0S4cExecutor({
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: staticTransport(signalsBody([])),
        r1Transport: r1Transport([]),
      },
    });
    await expect(
      executor.execute({ lease, pipelineManifest: pipeline.manifest, repository: repo, signal: controller.signal }),
    ).rejects.toThrow('DI_V0_S4C_ABORTED');
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE id = ${lease.workItemId}`;
    expect(wi[0]?.status).not.toBe('COMPLETED');
    const runs = await db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(0);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });

  it('PG-10 tenant scope: work item organization matches vehicle trip scope', async () => {
    const tenant = await seedS4aTenant(admin);
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const { db, tenant: t } = await runS4c(tenant, API_SYNTHETIC_IDENTITY, {
      positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }])),
      r1Transport: r1Transport([]),
    });
    const [row] = await db.$queryRaw<Array<{ organization_id: string; vehicle_id: string }>>`
      SELECT organization_id, vehicle_id FROM di_v0_s4_work_items WHERE trip_id = ${t.tripId}`;
    expect(row).toMatchObject({ organization_id: t.organizationId, vehicle_id: t.vehicleId });
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
    await cleanupS4aTenant(admin, t);
  });

  it('PG-07 stale lease: old holder cannot complete after expiry', async () => {
    const tenant = await seedS4aTenant(admin);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    dimoIds.push(await linkDimo(admin, tenant, API_SYNTHETIC_IDENTITY));
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    await new DiV0S4DiscoveryService(db, repo, config, pipeline, DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS).runDiscoveryPass();
    const lease = await repo.claim({ leaseOwner: 'stale-a', pipelineManifest: pipeline.manifest });
    await advanceS4aClock(admin, tenant.tripId, 400);
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const executor = new DiV0S4cExecutor({
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: staticTransport(signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }])),
        r1Transport: r1Transport([]),
      },
    });
    const outcome = await executor.execute({
      lease,
      pipelineManifest: pipeline.manifest,
      repository: repo,
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ kind: 'RELEASE' });
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE id = ${lease.workItemId}`;
    expect(wi[0]?.status).not.toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });
});
