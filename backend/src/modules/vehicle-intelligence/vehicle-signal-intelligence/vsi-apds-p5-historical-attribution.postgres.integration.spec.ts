/**
 * VSI P5A historical source-link attribution via VsiApdsP5ReadonlyService (disposable PostgreSQL).
 */
import { createNoopVsiProfileCadenceEvidenceLoader } from './vsi-profile-cadence-evidence.loader.stub';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5ReadonlyService } from './vsi-apds-p5.service';
import { VsiCapabilityResolverRepository } from './vsi-capability-resolver.repository';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import { VsiApdsShadowBindingStatus } from './vsi-apds-shadow-opportunity-binding';
import {
  createLegacyDimoLinkFixture,
  createLegacyReconcileOrg,
  insertDimoMirrorRaw,
} from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';
import { P25_APD_B4_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import { P25_APD_SHADOW_EXECUTION_VERSION_CURRENT } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

const RUPTELA_RAW = {
  aftermarketDevice: { id: 'R1-p5-hist' },
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
  },
) {
  await prisma.apdShadowReconciliationDecision.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      opportunityId: input.opportunityId,
      decisionAt: input.decisionAt,
      policyVersion: P25_APD_B4_V1,
      activationEpochId: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'SPARSE_IRREGULAR',
      decision: 'HOLD',
      reason: 'vsi-p5-historical-pg',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_VERSION_CURRENT,
      reconciliation: false,
    },
  });
}

async function createSecondDimoLink(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    activatedAt: Date;
    deactivatedAt: Date | null;
    isActive: boolean;
    supersededByLinkId?: string | null;
    sourceSubtype?: string;
  },
) {
  const secondDimoId = randomUUID();
  await insertDimoMirrorRaw(prisma, {
    id: secondDimoId,
    externalId: `0x${randomUUID().replace(/-/g, '')}`,
    rawJson: RUPTELA_RAW,
  });
  const consentId = randomUUID();
  await prisma.vehicleProviderConsent.create({
    data: {
      id: consentId,
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      provider: 'DIMO',
      grantType: 'DIMO_DIRECT',
      status: 'ACTIVE',
      scopes: [],
    },
  });
  const linkId = randomUUID();
  const sourceSubtype = input.sourceSubtype ?? `HIST_PG_${linkId.slice(0, 8)}`;
  await prisma.vehicleDataSourceLink.create({
    data: {
      id: linkId,
      vehicleId: input.vehicleId,
      provider: 'DIMO',
      sourceType: 'DIMO',
      sourceSubtype,
      dimoVehicleId: secondDimoId,
      consentId,
      isActive: input.isActive,
      activatedAt: input.activatedAt,
      deactivatedAt: input.deactivatedAt,
      supersededByLinkId: input.supersededByLinkId ?? null,
      metadata: { provenance: 'vsi-p5-historical-pg' },
    },
  });
  return linkId;
}

(LIVE ? describe : describe.skip)(
  'VSI P5 historical attribution service (PostgreSQL)',
  () => {
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

    async function materializeLink(
      organizationId: string,
      vehicleId: string,
      linkId: string,
      ts: Date,
    ) {
      await upsertVls(prisma, {
        vehicleId,
        linkId,
        sourceTimestamp: ts,
        providerFetchedAt: ts,
        lv: 12.4,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.4, timestamp: ts.toISOString() },
        },
      });
      await materialization.materializeFromPersistedEvidence({
        organizationId,
        vehicleId,
        providerSourceLinkId: linkId,
      });
    }

    it('two historical active links, one active today → UNKNOWN', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW,
        linkActive: false,
      });
      const activatedAt = new Date('2026-10-16T04:00:00.000Z');
      const shadowDecisionAt = new Date('2026-10-16T06:00:00.000Z');
      const link1End = new Date('2026-10-16T08:00:00.000Z');
      await prisma.vehicleDataSourceLink.update({
        where: { id: fixture.linkId },
        data: {
          activatedAt,
          deactivatedAt: link1End,
          isActive: false,
        },
      });
      const link2Id = await createSecondDimoLink(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        activatedAt,
        deactivatedAt: null,
        isActive: true,
      });
      const ts = new Date('2026-10-16T05:00:00.000Z');
      await materializeLink(organizationId, fixture.vehicleId, link2Id, ts);
      const opportunityId = `opp-hist-multi-${randomUUID()}`;
      await insertShadowDecision(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt: shadowDecisionAt,
      });
      const obs = await service.buildObservation({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: link2Id,
        shadowOpportunityId: opportunityId,
        shadowDecisionAt,
        policyVersion: P25_APD_B4_V1,
      });
      expect(obs.currentActiveSourceLinkCount).toBe(1);
      expect(obs.historicalActiveLinkCountAtDecision).toBe(2);
      expect(obs.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);

      await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('exactly one historical link → MATCHED when gates pass', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW,
      });
      const activatedAt = new Date('2026-10-16T04:00:00.000Z');
      const shadowDecisionAt = new Date('2026-10-16T06:00:00.000Z');
      await prisma.vehicleDataSourceLink.update({
        where: { id: fixture.linkId },
        data: { activatedAt, deactivatedAt: null },
      });
      const inactiveLinkId = await createSecondDimoLink(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        activatedAt,
        deactivatedAt: new Date('2026-10-16T05:00:00.000Z'),
        isActive: false,
      });
      const ts = new Date('2026-10-16T05:30:00.000Z');
      await materializeLink(organizationId, fixture.vehicleId, fixture.linkId, ts);
      const opportunityId = `opp-hist-single-${randomUUID()}`;
      await insertShadowDecision(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt: shadowDecisionAt,
      });
      const obs = await service.buildObservation({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        shadowOpportunityId: opportunityId,
        shadowDecisionAt,
        policyVersion: P25_APD_B4_V1,
      });
      expect(obs.historicalActiveLinkCountAtDecision).toBe(1);
      expect(obs.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.MATCHED);
      expect(inactiveLinkId).not.toBe(fixture.linkId);

      await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('selected link differs from sole historical link → not MATCHED', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW,
        linkActive: false,
      });
      const activatedAt = new Date('2026-10-16T04:00:00.000Z');
      const shadowDecisionAt = new Date('2026-10-16T06:00:00.000Z');
      await prisma.vehicleDataSourceLink.update({
        where: { id: fixture.linkId },
        data: {
          activatedAt,
          deactivatedAt: new Date('2026-10-16T05:00:00.000Z'),
          isActive: false,
        },
      });
      const activeLinkId = await createSecondDimoLink(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        activatedAt,
        deactivatedAt: null,
        isActive: true,
      });
      const ts = new Date('2026-10-16T05:30:00.000Z');
      await materializeLink(organizationId, fixture.vehicleId, activeLinkId, ts);
      const opportunityId = `opp-hist-wrong-${randomUUID()}`;
      await insertShadowDecision(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt: shadowDecisionAt,
      });
      const obs = await service.buildObservation({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        shadowOpportunityId: opportunityId,
        shadowDecisionAt,
        policyVersion: P25_APD_B4_V1,
      });
      expect(obs.historicalActiveLinkCountAtDecision).toBe(1);
      expect(obs.shadowBindingStatus).not.toBe(VsiApdsShadowBindingStatus.MATCHED);

      await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('missing supersession lifecycle evidence → UNKNOWN', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW,
      });
      const shadowDecisionAt = new Date('2026-10-16T06:00:00.000Z');
      const successorId = await createSecondDimoLink(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        activatedAt: new Date('2026-10-16T04:00:00.000Z'),
        deactivatedAt: null,
        isActive: true,
      });
      await prisma.vehicleDataSourceLink.update({
        where: { id: fixture.linkId },
        data: {
          activatedAt: new Date('2026-10-16T04:00:00.000Z'),
          supersededByLinkId: successorId,
          deactivatedAt: null,
          isActive: false,
        },
      });
      const ts = new Date('2026-10-16T05:00:00.000Z');
      await materializeLink(organizationId, fixture.vehicleId, fixture.linkId, ts);
      const opportunityId = `opp-hist-incomplete-${randomUUID()}`;
      await insertShadowDecision(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt: shadowDecisionAt,
      });
      const obs = await service.buildObservation({
        organizationId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        shadowOpportunityId: opportunityId,
        shadowDecisionAt,
        policyVersion: P25_APD_B4_V1,
      });
      expect(obs.historicalLinkUniquenessEvidenceComplete).toBe(false);
      expect(obs.shadowBindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);

      await prisma.apdShadowReconciliationDecision.deleteMany({ where: { organizationId } });
      await prisma.vehicleSignalCapabilityProfile.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('cross-tenant organizationId → no profile correlation leakage', async () => {
      const organizationId = await createLegacyReconcileOrg(prisma);
      const otherOrgId = await createLegacyReconcileOrg(prisma);
      const fixture = await createLegacyDimoLinkFixture(prisma, {
        organizationId,
        externalId: `0x${randomUUID().replace(/-/g, '')}`,
        rawJson: RUPTELA_RAW,
      });
      const shadowDecisionAt = new Date('2026-10-16T06:00:00.000Z');
      const ts = new Date('2026-10-16T05:00:00.000Z');
      await materializeLink(organizationId, fixture.vehicleId, fixture.linkId, ts);
      const opportunityId = `opp-hist-tenant-${randomUUID()}`;
      await insertShadowDecision(prisma, {
        organizationId,
        vehicleId: fixture.vehicleId,
        opportunityId,
        decisionAt: shadowDecisionAt,
      });
      const obs = await service.buildObservation({
        organizationId: otherOrgId,
        vehicleId: fixture.vehicleId,
        providerSourceLinkId: fixture.linkId,
        shadowOpportunityId: opportunityId,
        shadowDecisionAt,
        policyVersion: P25_APD_B4_V1,
      });
      expect(obs.signals).toHaveLength(0);
      expect(obs.shadowBindingStatus).not.toBe(VsiApdsShadowBindingStatus.MATCHED);
      expect(
        obs.evidenceLimitations.some((l: string) => l.includes('TENANT_SCOPE_MISMATCH')),
      ).toBe(true);

      await prisma.apdShadowReconciliationDecision.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrgId] } },
      });
      await prisma.vehicleSignalCapabilityProfile.deleteMany({
        where: { organizationId: { in: [organizationId, otherOrgId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationId, otherOrgId] } },
      });
    });
  },
);
