import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  s4aConfigFor,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { API_SYNTHETIC_IDENTITY, signalsBody, staticTransport } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { DiV0S4ClaimLoop } from '../../s4b-orchestration/di-v0-s4b-claim-loop';
import { DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS } from '../../s4b-orchestration/di-v0-s4b-discovery-containment';
import { DiV0S4DiscoveryService } from '../../s4b-orchestration/di-v0-s4b-discovery.service';
import { DiV0S4ExecutorRegistry } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { registerDiV0S4cExecutor } from '../di-v0-s4c-register';

assertS4aPostgresCiEnv();

async function linkDimo(admin: PrismaClient, tenant: S4aTenant, rawJson: unknown, tokenId = 424242): Promise<string> {
  const id = randomUUID();
  await admin.$executeRaw`
    INSERT INTO dimo_vehicles (id, external_id, token_id, raw_json, connection_status, created_at, updated_at)
    VALUES (${id}, ${`s4c-${id}`}, ${tokenId}, ${JSON.stringify(rawJson)}::jsonb, 'CONNECTED', now(), now())`;
  await admin.$executeRaw`UPDATE vehicles SET dimo_vehicle_id = ${id}, hardware_type = 'LTE_R1'::"HardwareType" WHERE id = ${tenant.vehicleId}`;
  return id;
}

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 S4C executor (real PostgreSQL)', () => {
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

  it('C-API-08: API_SYNTHETIC completes T05+T06 via claim loop', async () => {
    const tenant = await seedS4aTenant(admin);
    dimoIds.push(await linkDimo(admin, tenant, API_SYNTHETIC_IDENTITY));
    const config = s4aConfigFor([tenant]);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const db = newS4aClient();
    clients.push(db);
    const repo = new DiV0S4WorkItemRepository(db, config);
    const discovery = new DiV0S4DiscoveryService(db, repo, config, pipeline, DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS);
    await expect(discovery.runDiscoveryPass()).resolves.toMatchObject({ created: 1 });
    const registry = new DiV0S4ExecutorRegistry();
    const fromLabel = tenant.startTime.toISOString().replace(/\.\d{3}Z$/, 'Z');
    registerDiV0S4cExecutor(registry, {
      prisma: db,
      controlPlane: config,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: staticTransport(
          signalsBody([{ timestamp: fromLabel, currentLocationCoordinates: { latitude: 52.1, longitude: 9.1 } }]),
        ),
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({ data: { signalsHistorical: [] } }) },
      },
    });
    const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, { leaseOwner: `s4c-${randomUUID().slice(0, 8)}` });
    await expect(loop.runOnce()).resolves.toMatchObject({ status: 'SETTLED' });
    const rows = await db.$queryRaw<
      Array<{ status: string; source_family: string }>
    >`SELECT status, source_family::text FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
    expect(rows[0]).toMatchObject({ status: 'COMPLETED', source_family: 'API_SYNTHETIC' });
    const snaps = await db.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM di_v0_s4_evidence_snapshots WHERE trip_id = ${tenant.tripId}`;
    expect(snaps[0]?.n).toBe(1);
    const runs = await db.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM di_v0_shadow_runs WHERE trip_id = ${tenant.tripId}`;
    expect(runs[0]?.n).toBe(1);
    await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${tenant.vehicleId}`;
    await cleanupS4aTenant(admin, tenant);
  });
});
