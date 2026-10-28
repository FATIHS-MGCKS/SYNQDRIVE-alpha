import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  S4A_POSTGRES_LIVE,
  cleanupS4aTenant,
  newS4aClient,
  s4aConfigFor,
  s4aManifestFor,
  seedS4aTenant,
  seedS4aTripDiBoundaryAdmission,
  setKillState,
  type S4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { parseDiV0Ds4FleetMotionAdmissionPolicyV1 } from '../di-v0-ds4-fleet-motion-admission-policy.v1';

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DS4 fleet motion admission (postgres)', () => {
  let admin: PrismaClient;
  const tenants: S4aTenant[] = [];

  beforeAll(async () => {
    admin = newS4aClient();
    await setKillState(admin, 'NOT_KILLED');
  });

  afterAll(async () => {
    for (const t of tenants.splice(0)) {
      await cleanupS4aTenant(admin, t);
    }
    await admin.$disconnect();
  });

  async function tenant(): Promise<S4aTenant> {
    const t = await seedS4aTenant(admin);
    tenants.push(t);
    return t;
  }

  it('legacy gate OFF rejects discovery enablement with empty allowlists', async () => {
    const t = await tenant();
    await seedS4aTripDiBoundaryAdmission(admin, t);
    const config = s4aConfigFor([], {
      DI_V0_S4_ORGANIZATION_ALLOWLIST: '',
      DI_V0_S4_VEHICLE_ALLOWLIST: '',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({});
    const repo = new DiV0S4WorkItemRepository(admin, config, policy);
    const manifest = s4aManifestFor(config);
    await expect(
      repo.createWorkItem({
        tripId: t.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'PRIMARY',
        pipelineManifest: manifest,
      }),
    ).rejects.toMatchObject({ code: 'CONTROL_PLANE_DISABLED' });
  });

  it('global rollout ON admits onboarded vehicle without legacy allowlist UUIDs', async () => {
    const t = await tenant();
    await seedS4aTripDiBoundaryAdmission(admin, t);
    const config = s4aConfigFor([], {
      DI_V0_S4_ORGANIZATION_ALLOWLIST: '',
      DI_V0_S4_VEHICLE_ALLOWLIST: '',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED: 'true',
    });
    const repo = new DiV0S4WorkItemRepository(admin, config, policy);
    const manifest = s4aManifestFor(config);
    const created = await repo.createWorkItem({
      tripId: t.tripId,
      sourceFamily: 'API_SYNTHETIC',
      runPurpose: 'PRIMARY',
      pipelineManifest: manifest,
      expectedOrganizationId: t.organizationId,
      expectedVehicleId: t.vehicleId,
    });
    expect(created.organizationId).toBe(t.organizationId);
    expect(created.vehicleId).toBe(t.vehicleId);
  });

  it('global rollout ON rejects trip without DI boundary admission revision', async () => {
    const t = await tenant();
    await admin.$executeRawUnsafe(
      `UPDATE vehicle_trips SET raw_detection_meta = (raw_detection_meta - 'diV0BoundaryAdmissionV1') WHERE id = $1`,
      t.tripId,
    );
    const config = s4aConfigFor([], {
      DI_V0_S4_ORGANIZATION_ALLOWLIST: '',
      DI_V0_S4_VEHICLE_ALLOWLIST: '',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED: 'true',
    });
    const repo = new DiV0S4WorkItemRepository(admin, config, policy);
    const manifest = s4aManifestFor(config);
    await expect(
      repo.createWorkItem({
        tripId: t.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'PRIMARY',
        pipelineManifest: manifest,
      }),
    ).rejects.toMatchObject({ code: 'TRIP_BOUNDARY_NOT_RELEASED' });
  });

  it('global rollout ON still fails closed on caller scope mismatch', async () => {
    const t = await tenant();
    await seedS4aTripDiBoundaryAdmission(admin, t);
    const config = s4aConfigFor([], {
      DI_V0_S4_ORGANIZATION_ALLOWLIST: '',
      DI_V0_S4_VEHICLE_ALLOWLIST: '',
    });
    const policy = parseDiV0Ds4FleetMotionAdmissionPolicyV1({
      DI_V0_DS4_FLEET_MOTION_GLOBAL_ROLLOUT_AUTHORIZED: 'true',
    });
    const repo = new DiV0S4WorkItemRepository(admin, config, policy);
    const manifest = s4aManifestFor(config);
    await expect(
      repo.createWorkItem({
        tripId: t.tripId,
        sourceFamily: 'API_SYNTHETIC',
        runPurpose: 'PRIMARY',
        pipelineManifest: manifest,
        expectedOrganizationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'TENANT_SCOPE_INVALID' });
  });
});
