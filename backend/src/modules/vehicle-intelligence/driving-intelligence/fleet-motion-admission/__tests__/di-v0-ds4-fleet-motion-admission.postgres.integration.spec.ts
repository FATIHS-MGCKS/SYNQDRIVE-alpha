import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
  seedS4aTripDiBoundaryAdmission,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { parseDiV0Ds4FleetMotionAdmissionPolicyV1 } from '../di-v0-ds4-fleet-motion-admission-policy.v1';

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DS4 fleet motion admission (postgres)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    const { PrismaClient: Client } = await import('@prisma/client');
    db = new Client();
    await db.$connect();
    await db.$executeRaw`INSERT INTO di_v0_s4_control (id, kill_state) VALUES ('GLOBAL', 'NOT_KILLED') ON CONFLICT (id) DO UPDATE SET kill_state = EXCLUDED.kill_state`;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('legacy gate OFF rejects discovery enablement with empty allowlists', async () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({});
    const repo = new DiV0S4WorkItemRepository(db, config, policy);
    const tenant: S4aTenant = await seedS4aTenant(db);
    await seedS4aTripDiBoundaryAdmission(db, tenant);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    await expect(
      repo.createWorkItem({
        tripId: tenant.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'PRIMARY',
        pipelineManifest: pipeline.manifest,
      }),
    ).rejects.toMatchObject({ code: 'CONTROL_PLANE_DISABLED' });
    await db.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE trip_id = ${tenant.tripId}`;
  });

  it('global rollout ON admits onboarded vehicle without legacy allowlist UUIDs', async () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED: 'true',
    });
    const repo = new DiV0S4WorkItemRepository(db, config, policy);
    const tenant: S4aTenant = await seedS4aTenant(db);
    await seedS4aTripDiBoundaryAdmission(db, tenant);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    const created = await repo.createWorkItem({
      tripId: tenant.tripId,
      sourceFamily: 'API_SYNTHETIC',
      runPurpose: 'PRIMARY',
      pipelineManifest: pipeline.manifest,
    });
    expect(created.organizationId).toBe(tenant.organizationId);
    expect(created.vehicleId).toBe(tenant.vehicleId);
    await db.$executeRaw`DELETE FROM di_v0_s4_work_items WHERE id = ${created.workItemId}`;
  });

  it('global rollout ON still fails closed on caller scope mismatch', async () => {
    const config = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED: 'true',
    });
    const repo = new DiV0S4WorkItemRepository(db, config, policy);
    const tenant: S4aTenant = await seedS4aTenant(db);
    await seedS4aTripDiBoundaryAdmission(db, tenant);
    const pipeline = buildDiV0S4RuntimePipelineManifest(config);
    await expect(
      repo.createWorkItem({
        tripId: tenant.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'PRIMARY',
        pipelineManifest: pipeline.manifest,
        expectedOrganizationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_INVALID' });
  });
});
