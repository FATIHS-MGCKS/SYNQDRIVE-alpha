/**
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
 * VSI P5 APDS opportunity binding gate (disposable PostgreSQL).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5ReadonlyService } from './vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { correlateApdsShadowWithVsiCapability } from './vsi-apds-shadow-correlation.engine';
import { VsiApdsShadowBindingStatus } from './vsi-apds-shadow-opportunity-binding';
import { VsiApdsProfileEvidenceInterpretation } from './vsi-apds-profile-evidence-time';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import { P25_APD_B4_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p5-bind' },
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

async function insertShadowDecision(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    opportunityId: string;
    decisionAt: Date;
    policyVersion: string;
    activationEpochId: string | null;
    decision: string;
  },
) {
  await prisma.apdShadowReconciliationDecision.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      opportunityId: input.opportunityId,
      decisionAt: input.decisionAt,
      policyVersion: input.policyVersion,
      activationEpochId: input.activationEpochId,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: input.decision,
      reason: 'vsi-p5-binding-pg',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
      reconciliation: false,
    },
  });
}

(LIVE ? describe : describe.skip)('VSI P5 APDS binding gate (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const declared = new VsiDeclaredCatalogResolver(prisma as never);
  const materialization = new VsiSignalProfileMaterializationService(prisma as never, declared, createNoopVsiProfileCadenceEvidenceLoader());
  const service = new VsiApdsP5ReadonlyService(
    new VsiCapabilityResolverRepository(prisma as never),
  );

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('missing APDS row → MISSING_PERSISTED_DECISION, not verified profile correlation', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date(Date.now() - 60 * 60 * 1000);
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

    const shadowDecisionAt = new Date();
    const obs = await service.buildObservation({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      shadowOpportunityId: 'opp-missing',
      shadowDecisionAt,
      policyVersion: P25_APD_B4_V1,
    });
    expect(obs.shadowBindingStatus).toBe(
      VsiApdsShadowBindingStatus.MISSING_PERSISTED_DECISION,
    );
    const corr = correlateApdsShadowWithVsiCapability({
      decision: {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId: 'opp-missing',
        decisionAt: shadowDecisionAt.toISOString(),
        policyVersion: P25_APD_B4_V1,
        baselineDecision: 'HOLD',
      },
      observation: obs,
    });
    expect(corr.matchedVehicleLink).toBe(false);

    await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  it('persisted legacy-null-epoch row with exact identity → binding MATCHED when link historical', async () => {
    const organizationId = await createLegacyReconcileOrg(prisma);
    const fixture = await createLegacyDimoLinkFixture(prisma, {
      organizationId,
      externalId: `0x${randomUUID().replace(/-/g, '')}`,
      rawJson: RUPTELA_RAW,
    });
    const ts = new Date(Date.now() - 2 * 60 * 60 * 1000);
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

    const shadowDecisionAt = new Date();
    const opportunityId = `opp-p5-${randomUUID()}`;
    await insertShadowDecision(prisma, {
      organizationId,
      vehicleId: fixture.vehicleId,
      opportunityId,
      decisionAt: shadowDecisionAt,
      policyVersion: P25_APD_B4_V1,
      activationEpochId: null,
      decision: 'HOLD',
    });

    const obs = await service.buildObservation({
      organizationId,
      vehicleId: fixture.vehicleId,
      providerSourceLinkId: fixture.linkId,
      shadowOpportunityId: opportunityId,
      shadowDecisionAt,
      policyVersion: P25_APD_B4_V1,
    });
    expect(obs.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.MATCHED);
    expect(obs.profileEvidenceInterpretation).toBe(
      VsiApdsProfileEvidenceInterpretation.VERIFIED_DECISION_TIME_SNAPSHOT,
    );

    await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
    await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });
});
