import { BusinessType, FuelType, PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  computeApdShadowCohortFingerprintSha256,
} from './adaptive-polling-shadow-cohort.config';
import { AdaptivePollingShadowRepository } from './adaptive-polling-shadow.repository';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import { enableApdShadowEpochOpsAuthorityForTests } from './apd-shadow-activation-operator.authority';
import { ApdShadowDecisionEpochInactiveError } from './apd-shadow-decision-epoch.errors';
import { acquireApdShadowEpochLifecycleXactLock } from './apd-shadow-epoch-lifecycle.lock';
import { P25_APD_SHADOW_EXECUTION_V2 } from './p25-apd-shadow-execution-versions';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describePg('APD shadow epoch lifecycle true concurrency (APDS-9.3C)', () => {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  let organizationId = '';
  let vehicleId = '';
  let epochId = '';
  const epochIds: string[] = [];

  beforeAll(async () => {
    enableApdShadowEpochOpsAuthorityForTests();
    const org = await prismaA.organization.create({
      data: { companyName: `APD_CONC_${Date.now()}`, businessType: BusinessType.RENTAL },
      select: { id: true },
    });
    organizationId = org.id;
    const vehicle = await prismaA.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Conc',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `conc-${Date.now()}`,
      },
      select: { id: true },
    });
    vehicleId = vehicle.id;
    const fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    });
    const service = new ApdShadowActivationEpochService(prismaA as never);
    const prepared = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'concurrency-setup',
      operatorRequestId: 'conc-prepare',
    });
    const active = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `conc-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'concurrency-activate',
      operatorRequestId: 'conc-activate',
    });
    epochId = active.id;
    epochIds.push(epochId);
  });

  afterAll(async () => {
    await prismaA.apdShadowReconciliationDecision.deleteMany({
      where: { activationEpochId: { in: epochIds } },
    });
    for (const id of epochIds) {
      await prismaA.apdShadowActivationEpoch.deleteMany({ where: { id } });
    }
    await prismaA.vehicle.deleteMany({ where: { organizationId } });
    await prismaA.organization.deleteMany({ where: { id: organizationId } });
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  });

  function row(opportunityId: string, targetEpochId = epochId) {
    return {
      organizationId,
      vehicleId,
      opportunityId,
      decisionAt: new Date(),
      activationEpochId: targetEpochId,
      policyVersion: P25_APD_B2_V1,
      profileVersion: 'test',
      profileClass: 'LTE_R1',
      decision: 'ALLOW',
      reason: 'conc',
      shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
      reconciliation: false,
    };
  }

  it('interleaving B: PAUSE holds lifecycle lock; writer rejected after pause commits', async () => {
    const repoA = new AdaptivePollingShadowRepository(prismaA as never);
    const serviceB = new ApdShadowActivationEpochService(prismaB as never);
    const opp = `conc-b-${Date.now()}`;
    const pauseHeld = prismaB.$transaction(async (tx) => {
      await acquireApdShadowEpochLifecycleXactLock(tx, epochId);
      await tx.apdShadowActivationEpoch.updateMany({
        where: { id: epochId, lifecycleState: 'ACTIVE' },
        data: { lifecycleState: 'PAUSED', pausedAt: new Date() },
      });
      await tx.$executeRaw`SELECT pg_sleep(0.4)`;
    });
    await sleep(30);
    const writeAttempt = repoA.upsertPrePollDecision(row(opp)).catch((e) => e);
    await pauseHeld;
    const writeResult = await writeAttempt;
    expect(writeResult).toBeInstanceOf(ApdShadowDecisionEpochInactiveError);
    const count = await prismaA.apdShadowReconciliationDecision.count({ where: { opportunityId: opp } });
    expect(count).toBe(0);
    await serviceB.closeEpoch(epochId, {
      operatorActor: 'integration-test',
      operationRequestId: 'conc-close-b',
      operationReason: 'reset-after-b',
      opsToken: 'test-token',
    });
  });

  it('interleaving B (CLOSE): lifecycle lock held; writer rejected after close commits', async () => {
    const closeVehicle = await prismaA.vehicle.create({
      data: {
        organizationId,
        make: 'Test',
        model: 'Close',
        year: 2026,
        fuelType: FuelType.ELECTRIC,
        vehicleName: `close-b-${Date.now()}`,
      },
      select: { id: true },
    });
    const fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId: closeVehicle.id }],
    });
    const serviceA = new ApdShadowActivationEpochService(prismaA as never);
    const prepared = await serviceA.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'close-b-prepare',
      operatorRequestId: 'close-b-prepare',
    });
    const active = await serviceA.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `close-b-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'close-b-activate',
      operatorRequestId: 'close-b-activate',
    });
    epochIds.push(active.id);
    const repoA = new AdaptivePollingShadowRepository(prismaA as never);
    const opp = `close-b-${Date.now()}`;
    const closeHeld = prismaB.$transaction(async (tx) => {
      await acquireApdShadowEpochLifecycleXactLock(tx, active.id);
      await tx.apdShadowActivationEpoch.updateMany({
        where: { id: active.id },
        data: { lifecycleState: 'CLOSED', closedAt: new Date() },
      });
      await tx.$executeRaw`SELECT pg_sleep(0.4)`;
    });
    await sleep(30);
    const writeAttempt = repoA.upsertPrePollDecision(row(opp, active.id)).catch((e) => e);
    await closeHeld;
    expect(writeAttempt).toBeInstanceOf(ApdShadowDecisionEpochInactiveError);
    expect(
      await prismaA.apdShadowReconciliationDecision.count({ where: { opportunityId: opp } }),
    ).toBe(0);
  });

  it('interleaving A: writer holds lifecycle lock; PAUSE waits then succeeds', async () => {
    const fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    });
    const serviceA = new ApdShadowActivationEpochService(prismaA as never);
    const prepared = await serviceA.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'conc-a-prepare',
      operatorRequestId: 'conc-a-prepare',
    });
    const active = await serviceA.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `conc-a-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'conc-a-activate',
      operatorRequestId: 'conc-a-activate',
    });
    const localEpochId = active.id;
    epochIds.push(localEpochId);
    const repoA = new AdaptivePollingShadowRepository(prismaA as never);
    const serviceB = new ApdShadowActivationEpochService(prismaB as never);
    const opp = `conc-a-${Date.now()}`;
    const writeHeld = prismaA.$transaction(async (tx) => {
      await acquireApdShadowEpochLifecycleXactLock(tx, localEpochId);
      await tx.$executeRaw`SELECT pg_sleep(0.4)`;
      await tx.apdShadowReconciliationDecision.create({
        data: {
          organizationId,
          vehicleId,
          opportunityId: opp,
          decisionAt: new Date(),
          activationEpochId: localEpochId,
          policyVersion: P25_APD_B2_V1,
          profileVersion: 'test',
          profileClass: 'LTE_R1',
          decision: 'ALLOW',
          reason: 'conc-a',
          shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
          reconciliation: false,
        },
      });
    });
    const pausePromise = serviceB.pauseEpoch(localEpochId, {
      operatorActor: 'integration-test',
      operationRequestId: 'conc-a-pause',
      operationReason: 'pause-after-write-hold',
      opsToken: 'test-token',
    });
    const t0 = Date.now();
    await writeHeld;
    await pausePromise;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
    const rowAfter = await prismaA.apdShadowReconciliationDecision.findFirst({
      where: { opportunityId: opp },
    });
    expect(rowAfter).not.toBeNull();
    const unauthorized = await repoA.upsertPrePollDecision(row(`conc-a-deny-${Date.now()}`, localEpochId)).catch(
      (e) => e,
    );
    expect(unauthorized).toBeInstanceOf(ApdShadowDecisionEpochInactiveError);
  });

  it('deadlock avoidance: independent epoch lifecycle locks do not block each other', async () => {
    const service = new ApdShadowActivationEpochService(prismaA as never);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const v = await prismaA.vehicle.create({
        data: {
          organizationId,
          make: 'Test',
          model: 'Dl',
          year: 2026,
          fuelType: FuelType.ELECTRIC,
          vehicleName: `dl-${i}-${Date.now()}`,
        },
        select: { id: true },
      });
      const fingerprint = computeApdShadowCohortFingerprintSha256({
        version: P25_APD_LTE_R1_COHORT_V1,
        members: [{ organizationId, vehicleId: v.id }],
      });
      const prepared = await service.prepareEpoch({
        organizationId,
        cohortOrganizationIds: [organizationId],
        cohortConfigFingerprintSha256: fingerprint,
        cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        operatorActor: 'integration-test',
        operatorReason: `deadlock-prepare-${i}`,
        operatorRequestId: `deadlock-prepare-${i}`,
      });
      const active = await service.activateEpoch({
        epochId: prepared.id,
        activationRequestKey: `deadlock-${i}-${Date.now()}`,
        cohortOrganizationIds: [organizationId],
        cohortConfigFingerprintSha256: fingerprint,
        b2PolicyVersion: P25_APD_B2_V1,
        b4PolicyVersion: P25_APD_B4_V1,
        operatorActor: 'integration-test',
        operatorReason: `deadlock-activate-${i}`,
        operatorRequestId: `deadlock-activate-${i}`,
      });
      ids.push(active.id);
      epochIds.push(active.id);
    }
    await Promise.all(
      ids.map((id) =>
        service.pauseEpoch(id, {
          operatorActor: 'integration-test',
          operationRequestId: `deadlock-pause-${id}`,
          operationReason: 'deadlock-test-pause',
          opsToken: 'test-token',
        }),
      ),
    );
  });

  it('same-epoch idempotent replay under concurrency', async () => {
    const fingerprint = computeApdShadowCohortFingerprintSha256({
      version: P25_APD_LTE_R1_COHORT_V1,
      members: [{ organizationId, vehicleId }],
    });
    const service = new ApdShadowActivationEpochService(prismaA as never);
    const prepared = await service.prepareEpoch({
      organizationId,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion: P25_APD_LTE_R1_COHORT_V1,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'idem-prepare',
      operatorRequestId: 'idem-prepare',
    });
    const active = await service.activateEpoch({
      epochId: prepared.id,
      activationRequestKey: `idem-${Date.now()}`,
      cohortOrganizationIds: [organizationId],
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: 'integration-test',
      operatorReason: 'idem-activate',
      operatorRequestId: 'idem-activate',
    });
    epochIds.push(active.id);
    const repo = new AdaptivePollingShadowRepository(prismaA as never);
    const opp = `idem-${Date.now()}`;
    const base = row(opp, active.id);
    await Promise.all([
      repo.upsertPrePollDecision(base),
      repo.upsertPrePollDecision({ ...base, reason: 'idem-2' }),
    ]);
    const count = await prismaA.apdShadowReconciliationDecision.count({
      where: { opportunityId: opp, policyVersion: P25_APD_B2_V1 },
    });
    expect(count).toBe(1);
  });
});
