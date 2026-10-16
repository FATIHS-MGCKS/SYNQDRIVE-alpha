/**
 * VSI P5 APDS read-only adapter (disposable PostgreSQL).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5ReadonlyService } from './vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p5-apds' },
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
    rawPayloadJson: object;
  },
) {
  const id = randomUUID();
  const raw = JSON.stringify(input.rawPayloadJson);
  await prisma.$executeRaw`
    INSERT INTO vehicle_latest_states (
      id, vehicle_id, online, lv_battery_voltage, source_timestamp,
      provider_fetched_at, provider_binding_id, provider_source, raw_payload_json, updated_at
    ) VALUES (
      ${id}::uuid, ${input.vehicleId}, true, ${input.lv ?? null}, ${input.sourceTimestamp},
      ${input.providerFetchedAt}, ${input.linkId}, 'DIMO', ${raw}::jsonb, ${input.providerFetchedAt}
    )
    ON CONFLICT (vehicle_id) DO UPDATE SET
      lv_battery_voltage = EXCLUDED.lv_battery_voltage,
      source_timestamp = EXCLUDED.source_timestamp,
      provider_binding_id = EXCLUDED.provider_binding_id,
      raw_payload_json = EXCLUDED.raw_payload_json
  `;
}

(LIVE ? describe : describe.skip)('VSI P5 APDS read-only (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared);
  const service = new VsiApdsP5ReadonlyService(
    new VsiCapabilityResolverRepository(prisma as never),
  );

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('builds observation for materialized Ruptela profile', async () => {
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
      lv: 12.4,
      rawPayloadJson: {
        lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: ts.toISOString() },
      },
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    const obs = await service.buildObservation({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      shadowOpportunityId: 'opp-p5-test',
      shadowDecisionAt: ts,
    });
    expect(obs.profileContractVersion).toBe('vsi-signal-profile-v2');
    expect(obs.signals.some((s) => s.canonicalSignalKey === 'lv_voltage')).toBe(true);
    expect(obs.consumerDemand.length).toBeGreaterThan(0);

    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });
});
