import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  newS4aClient,
  s4aConfigFor,
  s4aManifestFor,
  seedS4aTenant,
  setKillState,
  type S4aTenant,
  S4A_POSTGRES_LIVE,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-work-item.repository';
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
  const tenants: S4aTenant[] = [];

  beforeAll(async () => {
    assertS4aPostgresCiEnv();
    prisma = newS4aClient();
    // Global manifest contract: every row in di_v0_s4_work_items must be listed. This spec runs last in CI.
    await prisma.$executeRaw`DELETE FROM di_v0_s4_work_items`;
  });

  afterEach(async () => {
    while (tenants.length > 0) {
      const tenant = tenants.pop();
      if (tenant) await cleanupS4aTenant(prisma, tenant);
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function registerTenant(): Promise<S4aTenant> {
    const tenant = await seedS4aTenant(prisma);
    tenants.push(tenant);
    return tenant;
  }

  async function addCompletedTripForVehicle(tenant: S4aTenant): Promise<string> {
    const tripId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO vehicle_trips (id, vehicle_id, trip_status, start_time, end_time, dimo_segment_id, created_at,
         start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh, harsh_brake_count, driving_score)
       VALUES ($1, $2, 'COMPLETED', ($3::timestamptz AT TIME ZONE 'UTC'), ($4::timestamptz AT TIME ZONE 'UTC'), $5,
         ($4::timestamptz AT TIME ZONE 'UTC'), 52, 9, 12, 77, 45, 2, 88)`,
      tripId,
      tenant.vehicleId,
      tenant.startTime.toISOString(),
      tenant.endTime.toISOString(),
      `seg-${randomUUID()}`,
    );
    return tripId;
  }

  async function createPrimaryWorkItem(tenant: S4aTenant, tripId: string): Promise<string> {
    await setKillState(prisma, 'NOT_KILLED');
    const config = s4aConfigFor([tenant], {
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: new Date(0).toISOString(),
    });
    const manifest = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(prisma, config);
    const created = await repo.createWorkItem({
      tripId,
      sourceFamily: 'RUPTELA_R1',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
      expectedOrganizationId: tenant.organizationId,
      expectedVehicleId: tenant.vehicleId,
    });
    return created.workItemId;
  }

  function orderedPair(a: string, b: string): { first: string; second: string } {
    return a.localeCompare(b) < 0 ? { first: a, second: b } : { first: b, second: a };
  }

  it('rolls back partial supersession on late failure', async () => {
    const tenant = await registerTenant();
    const tripA = tenant.tripId;
    const tripB = await addCompletedTripForVehicle(tenant);
    const idA = await createPrimaryWorkItem(tenant, tripA);
    const idB = await createPrimaryWorkItem(tenant, tripB);
    const { first, second } = orderedPair(idA, idB);

    await setKillState(prisma, 'KILLED');
    await prisma.$executeRaw`
      UPDATE di_v0_s4_work_items
      SET lease_owner = 'worker-late-fail',
          lease_expires_at = clock_timestamp() + interval '1 hour'
      WHERE id = ${second}`;

    const manifest: HistoricalBacklogManifest = {
      quarantineWorkItemIds: [idA, idB],
      preserveCompletedWorkItemIds: [],
      expectedTotalWorkItems: 2,
      organizationId: tenant.organizationId,
      allowedVehicleIds: [tenant.vehicleId],
    };

    const result = await applyHistoricalBacklogQuarantine(
      prisma,
      manifest,
      { actor: 'op', reason: 'late-fail' },
      { ack: DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK },
    );
    expect(result.outcome).toBe('REFUSED');
    if (result.outcome === 'REFUSED') {
      expect(result.failures).toContain('WORK_ITEM_LEASE_ACTIVE');
    }

    const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM di_v0_s4_work_items WHERE id = ANY(${[idA, idB]}::text[]) ORDER BY id`;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'PENDING')).toBe(true);

    const firstRow = rows.find((r) => r.id === first);
    expect(firstRow?.status).toBe('PENDING');
  });

  it('concurrent claim loses race to quarantine transaction', async () => {
    const tenant = await registerTenant();
    const workId = await createPrimaryWorkItem(tenant, tenant.tripId);
    const config = s4aConfigFor([tenant], {
      DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: new Date(0).toISOString(),
    });
    const manifestJson = s4aManifestFor(config);
    const repo = new DiV0S4WorkItemRepository(prisma, config);

    await setKillState(prisma, 'KILLED');

    const manifest: HistoricalBacklogManifest = {
      quarantineWorkItemIds: [workId],
      preserveCompletedWorkItemIds: [],
      expectedTotalWorkItems: 1,
      organizationId: tenant.organizationId,
      allowedVehicleIds: [tenant.vehicleId],
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
