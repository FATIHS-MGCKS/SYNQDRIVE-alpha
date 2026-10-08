import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  computeApdShadowCohortFingerprintSha256,
  type ApdShadowCohortConfig,
} from './adaptive-polling-shadow-cohort.config';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { enableApdShadowEpochOpsAuthorityForTests } from './apd-shadow-activation-operator.authority';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import {
  ApdShadowDecisionEpochConflictError,
  ApdShadowDecisionProvenanceImmutableError,
} from './apd-shadow-decision-epoch.errors';
import { P25_APD_SHADOW_EXECUTION_V2 } from './p25-apd-shadow-execution-versions';
import { buildApdShadowOpportunityId } from './apd-shadow-opportunity.util';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('APD shadow decision epoch immutability (APDS-9.3A)', () => {
  const prisma = new PrismaClient();
  const repository = new AdaptivePollingShadowRepository(prisma as never);
  const epochService = new ApdShadowActivationEpochService(prisma as never);

  let organizationId = '';
  let vehicleId = '';
  let fingerprint = '';
  let epochAId = '';
  let epochBId = '';

  beforeAll(async () => {
    enableApdShadowEpochOpsAuthorityForTests();
    const org = await prisma.organization.create({
      data: { companyName: `APD_IMMUT_ORG_${Date.now()}`, businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Imm',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `imm-${Date.now()}`,
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
    const config: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    };
    fingerprint = computeApdShadowCohortFingerprintSha256(config);

    const preparedA = await epochService.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
    });
    const activeA = await epochService.activateEpoch({
      epochId: preparedA.id,
      activationRequestKey: `imm-a-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration',
      operatorReason: 'imm-a',
    });
    epochAId = activeA.id;

    const preparedB = await epochService.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
    });
    await epochService.closeEpoch(epochAId);
    const activeB = await epochService.activateEpoch({
      epochId: preparedB.id,
      activationRequestKey: `imm-b-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration',
      operatorReason: 'imm-b',
    });
    epochBId = activeB.id;
  });

  afterAll(async () => {
    await prisma.apdShadowReconciliationDecision.deleteMany({
      where: { organizationId, vehicleId },
    });
    await prisma.apdShadowActivationEpoch.deleteMany({ where: { organizationId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  function baseRow(opportunityId: string, epochId: string, decisionAt: Date) {
    return {
      organizationId,
      vehicleId,
      opportunityId,
      decisionAt,
      activationEpochId: epochId,
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      profileClass: 'STABLE_PERIODIC',
      decision: 'WOULD_POLL',
      reason: 'TEST',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: true,
    };
  }

  it('legacy NULL epoch row cannot adopt activationEpochId', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: 1_700_000_000_000,
      origin: 'LEGACY_NULL',
    });
    const decisionAt = new Date(1_700_000_000_000);
    await prisma.apdShadowReconciliationDecision.create({
      data: {
        organizationId,
        vehicleId,
        opportunityId,
        decisionAt,
        policyVersion: P25_APD_B2_V1,
        profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
        profileClass: 'STABLE_PERIODIC',
        decision: 'WOULD_POLL',
        reason: 'LEGACY',
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
        activationEpochId: null,
      },
    });

    await expect(
      repository.upsertPrePollDecision(baseRow(opportunityId, epochBId, decisionAt)),
    ).rejects.toBeInstanceOf(ApdShadowDecisionEpochConflictError);
  });

  it('same-epoch replay is idempotent', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: 1_700_000_100_000,
      origin: 'SAME_EPOCH',
    });
    const decisionAt = new Date(1_700_000_100_000);
    await repository.upsertPrePollDecision(baseRow(opportunityId, epochBId, decisionAt));
    await repository.upsertPrePollDecision({
      ...baseRow(opportunityId, epochBId, decisionAt),
      reason: 'SAME_EPOCH_REPLAY',
    });
    const row = await prisma.apdShadowReconciliationDecision.findUnique({
      where: {
        organizationId_vehicleId_opportunityId_policyVersion: {
          organizationId,
          vehicleId,
          opportunityId,
          policyVersion: P25_APD_B2_V1,
        },
      },
    });
    expect(row?.activationEpochId).toBe(epochBId);
    expect(row?.reason).toBe('SAME_EPOCH_REPLAY');
  });

  it('cross-epoch replay fails closed', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: 1_700_000_200_000,
      origin: 'CROSS_EPOCH',
    });
    const decisionAt = new Date(1_700_000_200_000);
    await prisma.apdShadowReconciliationDecision.create({
      data: {
        organizationId,
        vehicleId,
        opportunityId,
        decisionAt,
        activationEpochId: epochAId,
        policyVersion: P25_APD_B2_V1,
        profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
        profileClass: 'STABLE_PERIODIC',
        decision: 'WOULD_POLL',
        reason: 'EPOCH_A_HISTORICAL',
        shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
        reconciliation: true,
      },
    });
    await expect(
      repository.upsertPrePollDecision(baseRow(opportunityId, epochBId, decisionAt)),
    ).rejects.toBeInstanceOf(ApdShadowDecisionEpochConflictError);
  });

  it('decisionAt is immutable on replay', async () => {
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId,
      decisionAtMs: 1_700_000_300_000,
      origin: 'IMMUTABLE_AT',
    });
    const decisionAt = new Date(1_700_000_300_000);
    await repository.upsertPrePollDecision(baseRow(opportunityId, epochBId, decisionAt));
    await expect(
      repository.upsertPrePollDecision(
        baseRow(opportunityId, epochBId, new Date(1_700_000_300_001)),
      ),
    ).rejects.toBeInstanceOf(ApdShadowDecisionProvenanceImmutableError);
  });

  it('epoch delete is blocked while decisions reference it (ON DELETE RESTRICT)', async () => {
    const vehicle2 = await prisma.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Fk',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `fk-${Date.now()}`,
      },
      select: { id: true },
    });
    const config2: ApdShadowCohortConfig = {
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId: vehicle2.id }],
    };
    const fp2 = computeApdShadowCohortFingerprintSha256(config2);
    const prepared = await epochService.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fp2,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
    });
    const active = await epochService.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `fk-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fp2,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration',
      operatorReason: 'fk',
    });
    const opportunityId = buildApdShadowOpportunityId({
      organizationId,
      vehicleId: vehicle2.id,
      decisionAtMs: 1_700_000_400_000,
      origin: 'FK_RESTRICT',
    });
    await repository.upsertPrePollDecision({
      ...baseRow(opportunityId, active.id, new Date(1_700_000_400_000)),
      vehicleId: vehicle2.id,
    });
    await expect(
      prisma.apdShadowActivationEpoch.delete({ where: { id: active.id } }),
    ).rejects.toThrow();
    await prisma.apdShadowReconciliationDecision.deleteMany({
      where: { vehicleId: vehicle2.id },
    });
    await prisma.apdShadowActivationEpoch.delete({ where: { id: active.id } });
    await prisma.vehicle.deleteMany({ where: { id: vehicle2.id, organizationId } });
  });
});
