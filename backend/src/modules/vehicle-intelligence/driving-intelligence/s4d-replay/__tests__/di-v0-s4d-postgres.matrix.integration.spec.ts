import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  s4aConfigFor,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { API_SYNTHETIC_IDENTITY, signalsBody, staticTransport } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { DiV0S4ClaimLoop } from '../../s4b-orchestration/di-v0-s4b-claim-loop';
import { DiV0S4DiscoveryService } from '../../s4b-orchestration/di-v0-s4b-discovery.service';
import { DiV0S4ExecutorRegistry, type DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { DiV0S4cExecutor, DI_V0_S4C_EXECUTOR_ID } from '../../s4c-executor/di-v0-s4c-executor';
import type { DiV0S4cExecutorDeps } from '../../s4c-executor/di-v0-s4c-types';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4D postgres matrix', () => {
  let admin: PrismaClient;
  const clients: PrismaClient[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    await admin.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    for (const c of clients) await c.$disconnect().catch(() => undefined);
    await admin.$disconnect().catch(() => undefined);
  });

  async function linkDimo(tenant: { vehicleId: string }, rawJson: unknown) {
    const id = randomUUID();
    await admin.$executeRaw`
      INSERT INTO dimo_vehicles (id, external_id, token_id, raw_json, connection_status, created_at, updated_at)
      VALUES (${id}, ${`s4d-${id}`}, ${Math.floor(Math.random() * 1_000_000_000) + 1}, ${JSON.stringify(rawJson)}::jsonb, 'CONNECTED', now(), now())`;
    await admin.$executeRaw`UPDATE vehicles SET dimo_vehicle_id = ${id} WHERE id = ${tenant.vehicleId}`;
  }

  it('D-01 PRIMARY crash-after-pin → retry completes from pin with zero provider calls on retry', async () => {
    const tenant = await seedS4aTenant(admin);
    await linkDimo(tenant, API_SYNTHETIC_IDENTITY);
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    await new DiV0S4DiscoveryService(db, repo, config, pipeline).runDiscoveryPass();
    const ts = new Date(tenant.startTime.getTime() + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    let positionCalls = 0;
    const deps: DiV0S4cExecutorDeps = {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: {
          async executeHistoricalPositionQuery() {
            positionCalls += 1;
            return signalsBody([{ timestamp: ts, currentLocationCoordinates: { latitude: 52, longitude: 9 } }]);
          },
        },
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({ data: { signalsHistorical: [] } }) },
      },
    };
    const inner = new DiV0S4cExecutor(deps);
    const registry = new DiV0S4ExecutorRegistry();
    registry.register({
      executorId: DI_V0_S4C_EXECUTOR_ID,
      isReady: () => true,
      async execute(ctx: DiV0S4ExecutionContext) {
        const proxy = Object.assign(Object.create(Object.getPrototypeOf(ctx.repository)), ctx.repository, {
          completeWithS2: async () => {
            throw new Error('SIMULATED_CRASH_BEFORE_T06');
          },
        });
        return inner.execute({ ...ctx, repository: proxy });
      },
    });
    const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, { leaseOwner: `s4d-d01-${randomUUID().slice(0, 6)}` });
    const first = await loop.runOnce();
    expect(first.status).toMatch(/SETTLED|RELEASE/);
    const callsAfterFirst = positionCalls;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
    const second = await loop.runOnce();
    expect(second.status).toBe('SETTLED');
    expect(positionCalls).toBe(callsAfterFirst);
    const wi = await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(wi[0]?.status).toBe('COMPLETED');
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });
});
