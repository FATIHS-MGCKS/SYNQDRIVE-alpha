import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  newS4aClient,
  s4aManifestFor,
  S4A_POSTGRES_LIVE,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-work-item.repository';
import { parseDiV0S4ControlPlaneConfig } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { buildDiV0S4PipelineVersionKey } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import {
  applyHistoricalBacklogQuarantine,
  DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK,
  DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER,
  loadAllWorkItemSnapshots,
  type HistoricalBacklogManifest,
} from './di-v0-s4-historical-backlog-quarantine-production.lib';

const describePg =
  S4A_POSTGRES_LIVE && process.env.DATABASE_URL ? describe : describe.skip;

describePg('S4P9B historical backlog quarantine (postgres)', () => {
  let prisma: PrismaClient;
  const testOrganizationIds: string[] = [];

  beforeAll(() => {
    assertS4aPostgresCiEnv();
    prisma = newS4aClient();
  });

  afterEach(async () => {
    for (const orgId of testOrganizationIds) {
      await prisma.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE organization_id = ${orgId}`;
      await prisma.$executeRaw`
        DELETE FROM vehicle_trips
        WHERE vehicle_id IN (SELECT id FROM vehicles WHERE organization_id = ${orgId})`;
      await prisma.$executeRaw`DELETE FROM vehicles WHERE organization_id = ${orgId}`;
      await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${orgId}`;
    }
    testOrganizationIds.length = 0;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function seedGlobalKilled(): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO di_v0_s4_control (id, kill_state, reason, actor, updated_at)
      VALUES ('GLOBAL', 'KILLED', 'test', 'test', now())
      ON CONFLICT (id) DO UPDATE SET kill_state = 'KILLED', updated_at = now()`;
  }

  it('rolls back partial supersession on late failure', async () => {
    await seedGlobalKilled();
    const org = randomUUID();
    testOrganizationIds.push(org);
    const vehicle = randomUUID();
    const trip = randomUUID();
    const id1 = randomUUID();
    const id2 = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
       VALUES ($1, 'q', 'RENTAL', 'ACTIVE', now(), now())`,
      org,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'PLATE', 'T', 'T', 2024, 'GASOLINE', 'AVAILABLE', now(), now())`,
      vehicle,
      org,
      `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO vehicle_trips (
         id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
         start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score
       ) VALUES (
         $1, $2, 'COMPLETED', now() - interval '1 day', now() - interval '23 hours', $3,
         now() - interval '23 hours', 52, 9, 12, 77, 45, 2, 88
       )`,
      trip,
      vehicle,
      `seg-${randomUUID()}`,
    );
    const pipelineKey = `DI_V0_S4_PIPELINE_V1:test:${randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
      VALUES (${pipelineKey}, '{}'::jsonb, 'ACTIVE')`;
    for (const id of [id1, id2]) {
      await prisma.$executeRaw`
        INSERT INTO di_v0_s4_work_items (
          id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
          boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status, lease_epoch,
          attempt_count, next_attempt_at, settlement_anchor_at, eligible_at
        ) VALUES (
          ${id}, ${org}, ${vehicle}, ${trip}, 'RUPTELA_R1', 'PRIMARY', 'PRIMARY',
          'fp', 1, ${pipelineKey}, '{}'::jsonb, 'PENDING', 0, 0, now(), now(), now()
        )`;
    }

    const manifest: HistoricalBacklogManifest = {
      quarantineWorkItemIds: [id1, id2],
      preserveCompletedWorkItemIds: [],
      expectedTotalWorkItems: 3,
      organizationId: org,
      allowedVehicleIds: [vehicle],
    };

    const result = await applyHistoricalBacklogQuarantine(
      prisma,
      manifest,
      { actor: 'op', reason: 'late-fail' },
      { ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK },
    );
    expect(result.outcome).toBe('REFUSED');

    const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM di_v0_s4_work_items WHERE id = ANY(${[id1, id2]}::text[]) ORDER BY id`;
    expect(rows.every((r) => r.status === 'PENDING')).toBe(true);
  });

  it('concurrent claim loses race to quarantine transaction', async () => {
    await seedGlobalKilled();
    const org = randomUUID();
    testOrganizationIds.push(org);
    const vehicle = randomUUID();
    const trip = randomUUID();
    const workId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
       VALUES ($1, 'q2', 'RENTAL', 'ACTIVE', now(), now())`,
      org,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'PLATE2', 'T', 'T', 2024, 'GASOLINE', 'AVAILABLE', now(), now())`,
      vehicle,
      org,
      `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO vehicle_trips (
         id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
         start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score
       ) VALUES (
         $1, $2, 'COMPLETED', now() - interval '1 day', now() - interval '23 hours', $3,
         now() - interval '23 hours', 52, 9, 12, 77, 45, 2, 88
       )`,
      trip,
      vehicle,
      `seg-${randomUUID()}`,
    );
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: org,
      DI_V0_S4_VEHICLE_ALLOWLIST: vehicle,
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: new Date().toISOString(),
    });
    const manifestJson = s4aManifestFor(config);
    const pipelineKey = buildDiV0S4PipelineVersionKey(manifestJson);
    await prisma.$executeRaw`
      INSERT INTO di_v0_s4_pipeline_versions (pipeline_version_key, manifest, status)
      VALUES (${pipelineKey}, ${JSON.stringify(manifestJson)}::jsonb, 'ACTIVE')`;
    await prisma.$executeRaw`
      INSERT INTO di_v0_s4_work_items (
        id, organization_id, vehicle_id, trip_id, source_family, run_purpose, purpose_discriminator,
        boundary_fingerprint, boundary_occurrence, pipeline_version_key, pipeline_version_manifest, status, lease_epoch,
        attempt_count, next_attempt_at, settlement_anchor_at, eligible_at
      ) VALUES (
        ${workId}, ${org}, ${vehicle}, ${trip}, 'RUPTELA_R1', 'PRIMARY', 'PRIMARY',
        'fp', 1, ${pipelineKey}, ${JSON.stringify(manifestJson)}::jsonb, 'PENDING', 0, 0, now(), now(), now()
      )`;

    const repo = new DiV0S4WorkItemRepository(prisma, config);

    const manifest: HistoricalBacklogManifest = {
      quarantineWorkItemIds: [workId],
      preserveCompletedWorkItemIds: [],
      expectedTotalWorkItems: 1,
      organizationId: org,
      allowedVehicleIds: [vehicle],
    };

    await expect(
      repo.claim({ leaseOwner: 'worker-race-1', pipelineManifest: manifestJson }),
    ).rejects.toThrow();

    const quarantineResult = await applyHistoricalBacklogQuarantine(
      prisma,
      manifest,
      { actor: 'op', reason: 'race' },
      { ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK },
    );
    expect(quarantineResult.outcome).toBe('QUARANTINED');

    const snapshots = await loadAllWorkItemSnapshots(prisma);
    const row = snapshots.find((r) => r.id === workId);
    expect(row?.status).toBe('SUPERSEDED');
    expect(row?.failureReason?.startsWith(DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER)).toBe(true);
  });
});
