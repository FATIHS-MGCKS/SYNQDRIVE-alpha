/**
 * P5B.1 offline replay (disposable PostgreSQL) — read-only batch correlation.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5b1OfflineReplayService } from './vsi-apds-p5b1-offline-replay.service';
import { VsiApdsP5b1DecisionRepository } from './vsi-apds-p5b1-decision.repository';
import { VsiApdsP5b1EvidenceWriter } from './vsi-apds-p5b1-evidence.writer';
import { VsiApdsP5ReadonlyService } from './vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { VsiProfileRevisionHistoryRepository } from './vsi-profile-revision-history.repository';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiApdsShadowBindingStatus } from './vsi-apds-shadow-opportunity-binding';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p5b1' },
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

(LIVE ? describe : describe.skip)('VSI P5B.1 offline replay (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const profiles = new VsiCapabilityResolverRepository(prisma as never);
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared);
  const replay = new VsiApdsP5b1OfflineReplayService(
    new VsiApdsP5b1DecisionRepository(prisma as never),
    profiles,
    new VsiApdsP5ReadonlyService(profiles),
    new VsiApdsP5b1EvidenceWriter(prisma as never),
    new VsiProfileRevisionHistoryRepository(prisma as never),
  );

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('correlates B2 and B4 as separate rows for same opportunity', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date('2026-10-16T05:00:00.000Z');
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
    await prisma.vehicleDataSourceLink.update({
      where: { id: fixture.linkId },
      data: { activatedAt: new Date('2026-10-16T04:00:00.000Z') },
    });
    await materialization.materializeFromPersistedEvidence({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
    });

    const decisionAt = new Date('2026-10-16T06:00:00.000Z');
    const opportunityId = `opp-b2b4-${randomUUID()}`;
    for (const policyVersion of [P25_APD_B2_V1, P25_APD_B4_V1]) {
      await prisma.apdShadowReconciliationDecision.create({
        data: {
          organizationId,
          vehicleId: fixture.vehicleId,
          opportunityId,
          decisionAt,
          policyVersion,
          activationEpochId: null,
          profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
          profileClass: 'SPARSE_IRREGULAR',
          decision: 'HOLD',
          reason: `policy-${policyVersion}`,
          shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
          reconciliation: false,
        },
      });
    }

    const result = await replay.runOfflineReplayBatch({
      filter: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAtFrom: new Date('2026-10-16T00:00:00.000Z'),
        decisionAtTo: new Date('2026-10-17T00:00:00.000Z'),
      },
      pagination: { limit: 50 },
      maxTotalDecisions: 500,
      dryRun: true,
    });
    expect(result.rows).toHaveLength(2);
    const policies = result.rows.map((r) => r.decisionIdentity.policyVersion).sort();
    expect(policies).toEqual([P25_APD_B2_V1, P25_APD_B4_V1].sort());
    expect(result.rows.every((r) => r.sourceLinkAttribution.status === 'UNIQUE_ATTRIBUTED')).toBe(
      true,
    );
    expect(
      result.rows.some((r) => r.observation?.shadowBindingStatus === VsiApdsShadowBindingStatus.MATCHED),
    ).toBe(true);
    expect(result.evidenceStoreWriteAttempted).toBe(false);

    const shadowCount = await prisma.apdShadowReconciliationDecision.count({
      where: { organizationId },
    });
    expect(shadowCount).toBe(2);

    await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('cross-tenant filter returns zero rows without foreign leakage', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const otherOrg = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const decisionAt = new Date('2026-10-16T06:00:00.000Z');
    await prisma.apdShadowReconciliationDecision.create({
      data: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId: `opp-tenant-${randomUUID()}`,
        decisionAt,
        policyVersion: P25_APD_B4_V1,
        activationEpochId: null,
        profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
        profileClass: 'SPARSE_IRREGULAR',
        decision: 'HOLD',
        reason: 'tenant',
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
        reconciliation: false,
      },
    });

    const result = await replay.runOfflineReplayBatch({
      filter: {
        organizationId: otherOrg,
        decisionAtFrom: new Date('2026-10-16T00:00:00.000Z'),
        decisionAtTo: new Date('2026-10-17T00:00:00.000Z'),
      },
      pagination: { limit: 50 },
      maxTotalDecisions: 500,
      dryRun: true,
    });
    expect(result.rows).toHaveLength(0);

    await prisma.apdShadowReconciliationDecision.deleteMany({
      where: { organizationId: { in: [organizationId, otherOrg] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationId, otherOrg] } },
    });
  });
});
