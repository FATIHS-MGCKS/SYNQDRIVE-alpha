import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4TransitionRejectedError } from '../../s4a-foundation/di-v0-s4a-errors';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  deferred,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aSnapshot,
  seedS4aTenant,
  settle,
  setKillState,
  waitForVehicleRowLockWaiter,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4DiscoveryService } from '../di-v0-s4b-discovery.service';
import { DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS } from '../di-v0-s4b-discovery-containment';
import { buildDiV0S4RuntimePipelineManifest } from '../di-v0-s4b-pipeline-manifest';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)(
  'DI V0 S4B registry lifecycle guards (PostgreSQL)',
  () => {
    let admin: PrismaClient;
    const clients: PrismaClient[] = [];
    let tenants: S4aTenant[] = [];

    const client = (): PrismaClient => {
      const c = newS4aClient();
      clients.push(c);
      return c;
    };

    beforeAll(async () => {
      admin = newS4aClient();
      await admin.$queryRaw`SELECT 1`;
    }, 60_000);

    afterAll(async () => {
      for (const c of clients) await c.$disconnect().catch(() => undefined);
      await admin?.$disconnect().catch(() => undefined);
    });

    beforeEach(async () => {
      await setKillState(admin, 'NOT_KILLED');
      tenants = [];
    });

    afterEach(async () => {
      await setKillState(admin, 'NOT_KILLED');
      for (const t of tenants) {
        await admin.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
        await cleanupS4aTenant(admin, t);
      }
    });

    async function tenant(ageSeconds = 3 * 86_400): Promise<S4aTenant> {
      const t = await seedS4aTenant(admin, ageSeconds);
      tenants.push(t);
      return t;
    }

    async function setRegistryLifecycle(vehicleId: string, lifecycle: 'ACTIVE' | 'OFFBOARDED' | 'ARCHIVED') {
      await admin.$executeRawUnsafe(
        `UPDATE vehicles SET registry_lifecycle = $1::"VehicleRegistryLifecycle", updated_at = now() WHERE id = $2`,
        lifecycle,
        vehicleId,
      );
    }

    async function insertCompletedTrip(vehicleId: string): Promise<string> {
      const tripId = randomUUID();
      const start = new Date(Date.now() - 4 * 86_400_000);
      const end = new Date(start.getTime() + 20 * 60_000);
      await admin.$executeRawUnsafe(
        `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
           start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score)
         VALUES ($1, $2, 'COMPLETED', ($3::timestamptz AT TIME ZONE 'UTC'), ($4::timestamptz AT TIME ZONE 'UTC'), $5,
           ($4::timestamptz AT TIME ZONE 'UTC'), 52, 9, 12, 77, 45, 2, 88)`,
        tripId,
        vehicleId,
        start.toISOString(),
        end.toISOString(),
        `seg-${randomUUID()}`,
      );
      return tripId;
    }

    function stack(t: S4aTenant) {
      const config = parseDiV0S4ControlPlaneConfig({
        DI_V0_S4_MASTER_ENABLED: 'true',
        DI_V0_S4_DISCOVERY_ENABLED: 'true',
        DI_V0_S4_WORKER_ENABLED: 'true',
        DI_V0_S4_POSITION_ENABLED: 'true',
        DI_V0_S4_R1_ENABLED: 'true',
        DI_V0_S4_NATIVE_ENABLED: 'false',
        DI_V0_S4_ORGANIZATION_ALLOWLIST: t.organizationId,
        DI_V0_S4_VEHICLE_ALLOWLIST: t.vehicleId,
      });
      const pipeline = buildDiV0S4RuntimePipelineManifest(config);
      const db = client();
      const repository = new DiV0S4WorkItemRepository(db, config);
      const discovery = new DiV0S4DiscoveryService(
        db,
        repository,
        config,
        pipeline,
        DI_V0_S4_DISCOVERY_CONTAINMENT_PERMISSIVE_FOR_TESTS,
      );
      return { config, pipeline, repository, discovery };
    }

    it('ACTIVE: discovery creates PRIMARY work item', async () => {
      const t = await tenant();
      const { discovery, pipeline } = stack(t);
      const pass = await discovery.runDiscoveryPass({ limit: 5 });
      expect(pass.created).toBe(1);
      const rows = await admin.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*)::bigint AS c FROM di_v0_s4_work_items WHERE vehicle_id = ${t.vehicleId}`;
      expect(Number(rows[0]?.c ?? 0)).toBe(1);
      expect(pipeline.manifest).toBeDefined();
    });

    it('OFFBOARDED: discovery excludes vehicle even when vehicle.status stays AVAILABLE', async () => {
      const t = await tenant();
      await setRegistryLifecycle(t.vehicleId, 'OFFBOARDED');
      const { discovery } = stack(t);
      const pass = await discovery.runDiscoveryPass({ limit: 5 });
      expect(pass.candidates).toBe(0);
      expect(pass.created).toBe(0);
    });

    it('ARCHIVED: discovery excludes vehicle', async () => {
      const t = await tenant();
      await setRegistryLifecycle(t.vehicleId, 'ARCHIVED');
      const { discovery } = stack(t);
      const pass = await discovery.runDiscoveryPass({ limit: 5 });
      expect(pass.created).toBe(0);
    });

    it('T01 race: OFFBOARDED after trip exists rejects PRIMARY createWorkItem', async () => {
      const t = await tenant();
      const { repository, pipeline } = stack(t);
      await setRegistryLifecycle(t.vehicleId, 'OFFBOARDED');
      await expect(
        repository.createWorkItem({
          tripId: t.tripId,
          sourceFamily: 'API_SYNTHETIC',
          runPurpose: 'PRIMARY',
          pipelineManifest: pipeline.manifest,
          expectedOrganizationId: t.organizationId,
          expectedVehicleId: t.vehicleId,
        }),
      ).rejects.toMatchObject({ code: 'TENANT_SCOPE_INVALID' });
    });

    it('RECALIBRATION_REPLAY: OFFBOARDED vehicle still admitted (historical replay unchanged)', async () => {
      const t = await tenant();
      const { repository, pipeline } = stack(t);
      const snapshotHash = await seedS4aSnapshot(admin, t, 'vo5c-d2b-replay');
      await setRegistryLifecycle(t.vehicleId, 'OFFBOARDED');
      const created = await repository.createWorkItem({
        tripId: t.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'RECALIBRATION_REPLAY',
        replaySourceSnapshotHash: snapshotHash,
        pipelineManifest: pipeline.manifest,
      });
      expect(created.workItemId).toBeTruthy();
    });

    it('offboard race: discovery pass then OFFBOARDED then manual createWorkItem is rejected', async () => {
      const t = await tenant();
      const { repository, pipeline, discovery } = stack(t);
      const first = await discovery.runDiscoveryPass({ limit: 5 });
      expect(first.created).toBe(1);
      await setRegistryLifecycle(t.vehicleId, 'OFFBOARDED');
      const trip2 = await insertCompletedTrip(t.vehicleId);
      await expect(
        repository.createWorkItem({
          tripId: trip2,
          sourceFamily: 'API_SYNTHETIC',
          runPurpose: 'PRIMARY',
          pipelineManifest: pipeline.manifest,
          expectedOrganizationId: t.organizationId,
          expectedVehicleId: t.vehicleId,
        }),
      ).rejects.toBeInstanceOf(DiV0S4TransitionRejectedError);
      const second = await discovery.runDiscoveryPass({ limit: 5 });
      expect(second.created).toBe(0);
    });

    it('concurrent order A: offboard holds vehicles FOR UPDATE then T01 PRIMARY cannot commit', async () => {
      const t = await tenant();
      const trip2 = await insertCompletedTrip(t.vehicleId);
      const { repository, pipeline } = stack(t);
      const offboardConn = client();
      const observer = client();
      const offboardHoldingVehicle = deferred();
      const offboardMayCommit = deferred();
      const offboardTx = offboardConn.$transaction(
        async (tx) => {
          await tx.$queryRaw`
            SELECT registry_lifecycle FROM vehicles WHERE id = ${t.vehicleId} AND organization_id = ${t.organizationId}
            FOR UPDATE`;
          offboardHoldingVehicle.resolve();
          await offboardMayCommit.promise;
          await tx.$executeRaw`
            UPDATE vehicles SET registry_lifecycle = 'OFFBOARDED'::"VehicleRegistryLifecycle", updated_at = now()
            WHERE id = ${t.vehicleId} AND organization_id = ${t.organizationId}`;
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
      await offboardHoldingVehicle.promise;
      const t01 = settle(
        repository.createWorkItem({
          tripId: trip2,
          sourceFamily: 'API_SYNTHETIC',
          runPurpose: 'PRIMARY',
          pipelineManifest: pipeline.manifest,
          expectedOrganizationId: t.organizationId,
          expectedVehicleId: t.vehicleId,
        }),
      );
      await waitForVehicleRowLockWaiter(observer);
      offboardMayCommit.resolve();
      await offboardTx;
      const t01Result = await t01;
      expect(t01Result.ok).toBe(false);
      if (!t01Result.ok) {
        expect(t01Result.error).toMatchObject({ code: 'TENANT_SCOPE_INVALID' });
      }
      const rows = await admin.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*)::bigint AS c FROM di_v0_s4_work_items WHERE trip_id = ${trip2}`;
      expect(Number(rows[0]?.c ?? 0)).toBe(0);
    });

    it(
      'concurrent order B: T01 acquires vehicles row lock while ACTIVE then offboard follows',
      async () => {
        const t = await tenant();
        const trip2 = await insertCompletedTrip(t.vehicleId);
        const { repository, pipeline } = stack(t);
        const gateConn = client();
        const observer = client();
        const offboardConn = client();
        const gateHoldingVehicle = deferred();
        const releaseGate = deferred();
        const gateTx = gateConn.$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT registry_lifecycle FROM vehicles WHERE id = ${t.vehicleId} AND organization_id = ${t.organizationId}
              FOR UPDATE`;
            gateHoldingVehicle.resolve();
            await releaseGate.promise;
          },
          { timeout: 60_000, maxWait: 10_000 },
        );
        await gateHoldingVehicle.promise;
        const t01 = settle(
          repository.createWorkItem({
            tripId: trip2,
            sourceFamily: 'API_SYNTHETIC',
            runPurpose: 'PRIMARY',
            pipelineManifest: pipeline.manifest,
            expectedOrganizationId: t.organizationId,
            expectedVehicleId: t.vehicleId,
          }),
        );
        await waitForVehicleRowLockWaiter(observer);
        releaseGate.resolve();
        await gateTx;
        const t01Result = await t01;
        expect(t01Result.ok).toBe(true);
        await offboardConn.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT registry_lifecycle FROM vehicles WHERE id = ${t.vehicleId} AND organization_id = ${t.organizationId}
            FOR UPDATE`;
          await tx.$executeRaw`
            UPDATE vehicles SET registry_lifecycle = 'OFFBOARDED'::"VehicleRegistryLifecycle", updated_at = now()
            WHERE id = ${t.vehicleId} AND organization_id = ${t.organizationId}`;
        });
        const rows = await admin.$queryRaw<Array<{ c: bigint }>>`
          SELECT COUNT(*)::bigint AS c FROM di_v0_s4_work_items WHERE trip_id = ${trip2}`;
        expect(Number(rows[0]?.c ?? 0)).toBe(1);
        const lifecycle = await admin.$queryRaw<Array<{ registry_lifecycle: string }>>`
          SELECT registry_lifecycle::text AS registry_lifecycle FROM vehicles WHERE id = ${t.vehicleId}`;
        expect(lifecycle[0]?.registry_lifecycle).toBe('OFFBOARDED');
      },
      60_000,
    );
  },
);
