/**
 * VSI P4 capability resolver (disposable PostgreSQL).
 */
import { PrismaClient, DrivingCapabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiCapabilityResolverService } from './vsi-capability-resolver.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { VsiConsumerModuleId } from './vsi-consumer-requirements.types';
import { VsiCapabilityResolutionStatus } from './vsi-capability-resolver.types';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { VO_PG_DIMO_SOFTWARE_RAW_JSON } from '../../vehicle-onboarding/testing/dimo-mirror-postgres.fixture';
import { DRIVING_CAPABILITY_PROVIDER } from '../driving-capability/vehicle-driving-capability.types';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p4-resolver' },
  syntheticDevice: null,
};

async function upsertVls(
  prisma: PrismaClient,
  input: {
    vehicleId: string;
    linkId: string;
    sourceTimestamp: Date;
    providerFetchedAt: Date;
    lv?: number | null;
    evSoc?: number | null;
    rawPayloadJson: object;
  },
) {
  const id = randomUUID();
  const raw = JSON.stringify(input.rawPayloadJson);
  await prisma.$executeRaw`
    INSERT INTO vehicle_latest_states (
      id, vehicle_id, online, lv_battery_voltage, ev_soc, source_timestamp,
      provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
    ) VALUES (
      ${id}::uuid,
      ${input.vehicleId},
      true,
      ${input.lv ?? null},
      ${input.evSoc ?? null},
      ${input.sourceTimestamp},
      ${input.providerFetchedAt},
      ${input.linkId},
      'DIMO',
      ${raw}::jsonb,
      ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      lv_battery_voltage = EXCLUDED.lv_battery_voltage,
      ev_soc = EXCLUDED.ev_soc,
      source_timestamp = EXCLUDED.source_timestamp,
      provider_fetched_at = EXCLUDED.provider_fetched_at,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json,
      updated_at = EXCLUDED.updated_at
  `;
}

(LIVE ? describe : describe.skip)('VSI P4 capability resolver (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared);
  const resolver = new VsiCapabilityResolverService(
    new VsiCapabilityResolverRepository(prisma as never),
  );

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupOrg(organizationId: string) {
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const ids = vehicles.map((v) => v.id);
    if (ids.length) {
      await prisma.vehicleLatestState.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDataSourceLink.deleteMany({ where: { vehicleId: { in: ids } } });
      await prisma.vehicleDrivingCapability.deleteMany({ where: { organizationId } });
      await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }

  it('Ruptela: materialized v2 profile resolves battery LV requirement (domain pending)', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date('2026-10-16T10:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      lv: 12.3,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.3, timestamp: ts.toISOString() },
      },
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const result = await resolver.resolve({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      consumerModule: VsiConsumerModuleId.BATTERY_V2,
      featureId: 'lv_measurement_gate',
      evaluationTime: new Date('2026-10-16T10:05:00.000Z'),
    });
    expect(result.profileContractVersion).toBe('vsi-signal-profile-v2');
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.NOT_ASSESSABLE);

    await cleanupOrg(organizationId);
  });

  it('Tesla software: HV observed profile', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: VO_PG_DIMO_SOFTWARE_RAW_JSON,
      metadata: {
        connectionIdentity: {
          version: 'vo-source-link-connection-identity-v1',
          verifiedModality: 'SOFTWARE_INTEGRATION',
          telemetrySourceFamily: 'DIMO_SOFTWARE',
        },
      },
    });
    const ts = new Date('2026-10-16T11:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      evSoc: 70,
      rawPayloadJson: {
        powertrainTractionBatteryStateOfChargeCurrent: { value: 70, timestamp: ts.toISOString() },
      },
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const result = await resolver.resolve({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      consumerModule: VsiConsumerModuleId.BATTERY_V2,
      featureId: 'hv_soc_readiness',
      evaluationTime: ts,
    });
    expect(result.profileContractVersion).toBe('vsi-signal-profile-v2');

    await cleanupOrg(organizationId);
  });

  it('accelerator pedal zero observed in profile', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date('2026-10-16T12:00:00.000Z');
    await upsertVls(prisma, {
      vehicleId: fixture.vehicleId,
      linkId: fixture.linkId,
      sourceTimestamp: ts,
      providerFetchedAt: ts,
      lv: 12,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12, timestamp: ts.toISOString() },
        powertrainCombustionEngineAcceleratorPedalPosition: { value: 0, timestamp: ts.toISOString() },
      },
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });
    const row = await prisma.vehicleSignalCapabilityProfile.findFirstOrThrow({
      where: {
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
      },
    });
    const snap = row.signalsSnapshot as { canonicalSignalKey: string; empiricalObservation: string }[];
    const pedal = snap.find((s) => s.canonicalSignalKey === 'accelerator_pedal_position');
    expect(pedal?.empiricalObservation).toBe('OBSERVED');

    await cleanupOrg(organizationId);
  });

  it('cross-tenant access yields UNKNOWN', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const otherOrg = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const result = await resolver.resolve({
      organizationId: otherOrg,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      consumerModule: VsiConsumerModuleId.APDS,
      featureId: 'shadow_demand_profile_read',
    });
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.UNKNOWN);
    await cleanupOrg(organizationId);
    await cleanupOrg(otherOrg);
  });

  it('missing profile INSUFFICIENT_EVIDENCE', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const result = await resolver.resolve({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      consumerModule: VsiConsumerModuleId.APDS,
      featureId: 'shadow_demand_profile_read',
    });
    expect(result.resolutionStatus).toBe(VsiCapabilityResolutionStatus.INSUFFICIENT_EVIDENCE);
    await cleanupOrg(organizationId);
  });
});
