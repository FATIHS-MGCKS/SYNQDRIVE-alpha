/**
 * VSI-03 P1 read-only composer PostgreSQL integration.
 * Run:
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/vsi03_test_ci?schema=public \
 *   VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-readonly-composer.postgres.integration --runInBand
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import { VsiReadonlySignalComposerService } from './vsi-readonly-composer.service';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import {
  B1_TESLA_RAW,
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

function connectionIdentityMetadata(linkId: string, org: string, veh: string, modality: string) {
  return {
    connectionIdentity: {
      version: VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION,
      contractVersion: 'vo-connection-identity-v1',
      origin: 'LEGACY_RECONCILIATION',
      providerSourceLinkId: linkId,
      provider: 'DIMO',
      verifiedModality: modality,
      physicalDeviceReference:
        modality === VehicleConnectionModality.SOFTWARE_INTEGRATION
          ? 'NOT_APPLICABLE'
          : 'R1-test-serial',
      verificationEvidence:
        modality === VehicleConnectionModality.SOFTWARE_INTEGRATION
          ? ['DIMO_RAW_JSON:API_SYNTHETIC']
          : ['DIMO_RAW_JSON:RUPTELA_R1'],
      organizationId: org,
      vehicleId: veh,
    },
  };
}

async function cleanupOrg(prisma: PrismaClient, organizationId: string): Promise<void> {
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId },
    select: { id: true, dimoVehicleId: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);
  const dimoIds = vehicles.map((v) => v.dimoVehicleId).filter((id): id is string => Boolean(id));
  if (vehicleIds.length > 0) {
    await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.dimoPollLog.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleProviderConsent.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
  if (dimoIds.length > 0) {
    await prisma.dimoVehicle.deleteMany({ where: { id: { in: dimoIds } } });
  }
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

(LIVE ? describe : describe.skip)('VsiReadonlySignalComposerService (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const service = new VsiReadonlySignalComposerService(
    prisma as unknown as PrismaService,
    {
      evaluateForLink: async () => ({
        classification: 'UNKNOWN',
        strictSourceAdvanced: 'UNKNOWN',
        reasons: ['TEST_STUB'],
        advanceEvidenceScope: 'NONE',
      }),
    } as never,
  );
  const orgIdsToCleanup: string[] = [];

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterEach(async () => {
    while (orgIdsToCleanup.length > 0) {
      const orgId = orgIdsToCleanup.pop();
      if (orgId) {
        await cleanupOrg(prisma, orgId);
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('composes tenant-scoped signals with zero writes', async () => {
    const orgA = await createLegacyReconcileOrg(prisma);
    const orgB = await createLegacyReconcileOrg(prisma);
    orgIdsToCleanup.push(orgA, orgB);

    const fixtureA = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgA,
      externalId: `0x${randomUUID().replace(/-/g, '').slice(0, 40)}`,
      rawJson: B1_TESLA_RAW,
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixtureA.linkId },
      data: {
        metadata: connectionIdentityMetadata(
          fixtureA.linkId,
          orgA,
          fixtureA.vehicleId,
          VehicleConnectionModality.SOFTWARE_INTEGRATION,
        ),
      },
    });

    const now = new Date();
    const latestStateId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO vehicle_latest_states (
        id, vehicle_id, online, lv_battery_voltage, ev_soc, source_timestamp,
        provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
      ) VALUES (
        ${latestStateId},
        ${fixtureA.vehicleId},
        true,
        NULL,
        72,
        ${now},
        ${now},
        ${fixtureA.linkId},
        'DIMO',
        '{}'::jsonb,
        ${now}
      )
    `;

    const beforeLinks = await prisma.vehicleDataSourceLink.count();
    const beforeStates = await prisma.vehicleLatestState.count();

    const result = await service.composeVehicleSignals({
      organizationId: orgA,
      vehicleId: fixtureA.vehicleId,
    });

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.identityProjections[0].treatsAsPhysicalHardwareDevice).toBe(false);
    expect(
      result.signals.some(
        (s) =>
          s.identity.canonicalSignalKey === 'provider_source_timestamp' &&
          s.capability.empiricalObservation === 'OBSERVED',
      ),
    ).toBe(true);

    await expect(
      service.composeVehicleSignals({ organizationId: orgB, vehicleId: fixtureA.vehicleId }),
    ).rejects.toThrow();

    const afterLinks = await prisma.vehicleDataSourceLink.count();
    const afterStates = await prisma.vehicleLatestState.count();
    expect(afterLinks).toBe(beforeLinks);
    expect(afterStates).toBe(beforeStates);
  });

  it('Ruptela hardware link projects physical hardware identity', async () => {
    const org = await createLegacyReconcileOrg(prisma);
    orgIdsToCleanup.push(org);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId: org,
      externalId: `0x${randomUUID().replace(/-/g, '').slice(0, 40)}`,
      rawJson: B1_TESLA_RAW,
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: {
        metadata: connectionIdentityMetadata(
          fixture.linkId,
          org,
          fixture.vehicleId,
          VehicleConnectionModality.HARDWARE_DEVICE,
        ),
      },
    });

    const result = await service.composeVehicleSignals({
      organizationId: org,
      vehicleId: fixture.vehicleId,
    });
    expect(result.identityProjections[0].treatsAsPhysicalHardwareDevice).toBe(true);
    expect(result.identityProjections[0].telemetrySourceFamily).toBe('RUPTELA_R1');
  });
});
