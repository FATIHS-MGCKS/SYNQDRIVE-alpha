import {
  ProcessingActivityDeletionDecisionType,
  ProcessingActivityDeletionJobStatus,
  ProcessingActivityDeletionMethod,
  ProcessingActivityDeletionStepTarget,
  ProcessingActivityRetentionClass,
  RetentionStartEvent,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DeletionClickHouseAdapter,
  DeletionDerivedDataAdapter,
  DeletionObjectStorageAdapter,
  DeletionPostgresAdapter,
  DeletionRedisAdapter,
  DeletionStoreRegistry,
} from './deletion-store.adapters';
import { RetentionDeletionAuditService } from './retention-deletion-audit.service';
import { RetentionDeletionExecutorService } from './retention-deletion-executor.service';
import { RetentionActivationGateService } from './retention-activation-gate.service';
import { RetentionPolicyService, RetentionRevocationAssessmentService } from './retention-policy.service';
import { POLICY_LIFECYCLE_ERROR_CODES } from '../privacy-domain/policy-lifecycle/policy-lifecycle.constants';

describe('Retention deletion integration (in-memory harness)', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';
  const activityId = 'pa-1';

  function buildHarness(options?: {
    clickHouse?: { configured: boolean; available: boolean };
    redisInvalidate?: (orgId: string) => number;
    postgresExports?: number;
    derivedFails?: boolean;
  }) {
    const policies: Array<Record<string, unknown>> = [];
    const exceptions: Array<Record<string, unknown>> = [];
    const jobs: Array<Record<string, unknown>> = [];
    const steps: Array<Record<string, unknown>> = [];
    const evidence: Array<Record<string, unknown>> = [];
    const decisions: Array<Record<string, unknown>> = [];
    const registerExports = options?.postgresExports ?? 2;

    const activity = {
      id: activityId,
      organizationId: orgId,
      dataCategories: [{ dataCategory: 'GPS_LOCATION' }],
    };

    const prisma = {
      processingActivity: {
        findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) => {
          if (where.id === activityId && where.organizationId === orgId) return { ...activity };
          return null;
        }),
      },
      processingActivityRetentionPolicy: {
        findMany: jest.fn(async ({ where, include }: { where: Record<string, unknown>; include?: { exceptions?: boolean } }) =>
          policies
            .filter((p) => {
              if (where.organizationId && p.organizationId !== where.organizationId) return false;
              if (where.processingActivityId && p.processingActivityId !== where.processingActivityId) return false;
              if (where.isConfigured !== undefined && p.isConfigured !== where.isConfigured) return false;
              if (where.legalHold !== undefined && p.legalHold !== where.legalHold) return false;
              return true;
            })
            .map((p) => ({
              ...p,
              exceptions: include?.exceptions
                ? exceptions.filter((e) => e.retentionPolicyId === p.id)
                : p.exceptions ?? [],
            })),
        ),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const row = policies.find((p) => {
            if (where.id && p.id !== where.id) return false;
            if (where.organizationId && p.organizationId !== where.organizationId) return false;
            if (where.processingActivityId && p.processingActivityId !== where.processingActivityId) return false;
            if (where.dataCategory === null && p.dataCategory !== null) return false;
            if (where.dataCategory && p.dataCategory !== where.dataCategory) return false;
            if (where.retentionClass && p.retentionClass !== where.retentionClass) return false;
            if (where.isConfigured !== undefined && p.isConfigured !== where.isConfigured) return false;
            return true;
          });
          return row ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `pol-${policies.length + 1}`, ...data };
          policies.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = policies.find((p) => p.id === where.id);
          Object.assign(row!, data);
          return row;
        }),
      },
      processingActivityRetentionException: {
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
          exceptions.find((e) => e.retentionPolicyId === where.retentionPolicyId) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `ex-${exceptions.length + 1}`, ...data };
          exceptions.push(row);
          return row;
        }),
      },
      processingActivityRegisterExport: {
        count: jest.fn(async () => registerExports),
        deleteMany: jest.fn(async () => ({ count: registerExports })),
      },
      processingActivityDeletionJob: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey?: string } }) =>
          jobs.find((j) => j.idempotencyKey === where.idempotencyKey) ?? null,
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `job-${jobs.length + 1}`, steps: [], evidence: [], ...data };
          jobs.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = jobs.find((j) => j.id === where.id);
          Object.assign(row!, data);
          return { ...row, steps, evidence: evidence.filter((e) => e.jobId === row!.id) };
        }),
      },
      processingActivityDeletionJobStep: {
        findMany: jest.fn(async ({ where }: { where: { jobId: string } }) =>
          steps.filter((s) => s.jobId === where.jobId),
        ),
        upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = steps.find(
            (s) =>
              s.jobId === create.jobId &&
              s.target === create.target &&
              s.stepKey === create.stepKey,
          );
          if (existing) {
            Object.assign(existing, update);
            return existing;
          }
          const row = { ...create };
          steps.push(row);
          return row;
        }),
      },
      processingActivityDeletionEvidence: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          evidence.push(data);
          return data;
        }),
      },
      processingActivityDeletionDecision: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          decisions.push(data);
          return data;
        }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    prisma.processingActivityDeletionJob.findUnique.mockImplementation(
      async ({ where, include }: { where: { idempotencyKey?: string }; include?: { steps?: boolean; evidence?: boolean } }) => {
        const row = jobs.find((j) => j.idempotencyKey === where.idempotencyKey);
        if (!row) return null;
        return {
          ...row,
          steps: include?.steps ? steps.filter((s) => s.jobId === row.id) : undefined,
          evidence: include?.evidence ? evidence.filter((e) => e.jobId === row.id) : undefined,
        };
      },
    );

    const audit = new RetentionDeletionAuditService(prisma as never);
    const policyService = new RetentionPolicyService(prisma as never, audit);
    const revocation = new RetentionRevocationAssessmentService(prisma as never, audit);
    const activationGate = new RetentionActivationGateService(prisma as never);

    const clickHouseStatus = options?.clickHouse ?? { configured: true, available: true };
    const clickHouse = { getStatus: () => ({ ...clickHouseStatus, status: 'available', appliedMigrationCount: 5 }) };
    const authDecision = {
      invalidateOrganizationCache: jest.fn((id: string) => options?.redisInvalidate?.(id) ?? 3),
    };

    const postgres = new DeletionPostgresAdapter(prisma as never);
    const clickhouse = new DeletionClickHouseAdapter(clickHouse as never);
    const objectStorage = new DeletionObjectStorageAdapter();
    const redis = new DeletionRedisAdapter(authDecision as never);
    const derived = new DeletionDerivedDataAdapter();

    if (options?.derivedFails) {
      derived.execute = jest.fn(async (ctx) => ({
        target: ProcessingActivityDeletionStepTarget.DERIVED_DATA,
        status: 'FAILED' as const,
        errorCode: 'DERIVED_SIMULATED_FAILURE',
        errorMessage: 'simulated',
        metadata: { dryRun: ctx.dryRun },
      }));
    }

    const stores = new DeletionStoreRegistry(postgres, clickhouse, objectStorage, redis, derived);
    const executor = new RetentionDeletionExecutorService(prisma as never, stores, audit);

    return {
      prisma,
      policies,
      jobs,
      steps,
      evidence,
      decisions,
      policyService,
      revocation,
      activationGate,
      executor,
      authDecision,
      stores,
    };
  }

  async function seedPolicy(
    h: ReturnType<typeof buildHarness>,
    overrides?: Partial<Record<string, unknown>>,
  ) {
    return h.policyService.upsert(
      orgId,
      activityId,
      {
        retentionClass: ProcessingActivityRetentionClass.TELEMETRY,
        retentionStartEvent: RetentionStartEvent.LAST_ACTIVITY,
        deletionMethod: ProcessingActivityDeletionMethod.HARD_DELETE,
        retentionDurationDays: 365,
        anonymizationAllowed: false,
        ...overrides,
      } as never,
      'user-1',
    );
  }

  it('blocks activation when retention is not configured', async () => {
    const h = buildHarness();
    await expect(h.activationGate.assertActivationAllowed(orgId, activityId)).rejects.toMatchObject({
      response: { code: POLICY_LIFECYCLE_ERROR_CODES.RETENTION_NOT_CONFIGURED },
    });
  });

  it('allows activation after retention policy is configured', async () => {
    const h = buildHarness();
    await seedPolicy(h, { dataCategory: 'GPS_LOCATION' });
    await expect(h.activationGate.assertActivationAllowed(orgId, activityId)).resolves.toBeUndefined();
  });

  it('blocks activation when legal hold is active', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h, { dataCategory: 'GPS_LOCATION' });
    await h.policyService.setLegalHold(orgId, policy.id, true, 'Litigation', 'legal-1');
    await expect(h.activationGate.assertActivationAllowed(orgId, activityId)).rejects.toMatchObject({
      response: { code: POLICY_LIFECYCLE_ERROR_CODES.RETENTION_LEGAL_HOLD_ACTIVE },
    });
  });

  it('assesses revocation without blind deletion', async () => {
    const h = buildHarness();
    await seedPolicy(h);
    const result = await h.revocation.assess(orgId, activityId, 'consent withdrawn', 'user-1');
    expect(result.blindDeleteForbidden).toBe(true);
    expect(h.decisions.some((d) => d.decisionType === ProcessingActivityDeletionDecisionType.REVOCATION_ASSESSED)).toBe(
      true,
    );
    expect(h.jobs).toHaveLength(0);
  });

  it('runs dry-run deletion job without mutating stores', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h);
    const job = await h.executor.runJob(orgId, activityId, { dryRun: true, retentionPolicyId: policy.id }, 'user-1');

    expect(job.status).toBe(ProcessingActivityDeletionJobStatus.DRY_RUN_COMPLETED);
    expect(h.prisma.processingActivityRegisterExport.deleteMany).not.toHaveBeenCalled();
    expect(h.authDecision.invalidateOrganizationCache).not.toHaveBeenCalled();
    expect(h.evidence.some((e) => e.evidenceType === 'register_export_count')).toBe(true);
    expect(h.decisions.some((d) => d.decisionType === ProcessingActivityDeletionDecisionType.DRY_RUN_COMPLETED)).toBe(
      true,
    );
  });

  it('executes normal hard-delete across PostgreSQL, ClickHouse, Object Storage, and Redis', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h);
    const job = await h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1');

    expect(job.status).toBe(ProcessingActivityDeletionJobStatus.COMPLETED);
    expect(h.prisma.processingActivityRegisterExport.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: orgId, processingActivityId: activityId },
    });
    expect(h.authDecision.invalidateOrganizationCache).toHaveBeenCalledWith(orgId);
    expect(h.steps.some((s) => s.target === 'CLICKHOUSE' && s.status === 'COMPLETED')).toBe(true);
    expect(h.steps.some((s) => s.target === 'OBJECT_STORAGE' && s.status === 'COMPLETED')).toBe(true);
    expect(h.steps.some((s) => s.target === 'DERIVED_DATA' && s.status === 'SKIPPED')).toBe(true);
    expect(h.evidence.every((e) => !String(e.evidenceValue).includes('@'))).toBe(true);
  });

  it('applies anonymization path when configured', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h, {
      deletionMethod: ProcessingActivityDeletionMethod.ANONYMIZE,
      anonymizationAllowed: true,
    });
    const job = await h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1');

    expect(h.prisma.processingActivityRegisterExport.deleteMany).not.toHaveBeenCalled();
    expect(h.steps.some((s) => s.target === 'POSTGRESQL' && s.status === 'COMPLETED')).toBe(true);
    expect(h.evidence.some((e) => e.evidenceType === 'postgres_anonymization_applied')).toBe(true);
    expect(job.status).toBe(ProcessingActivityDeletionJobStatus.COMPLETED);
  });

  it('blocks deletion when legal hold is active', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h);
    await h.policyService.setLegalHold(orgId, policy.id, true, 'Hold', 'legal-1');
    await expect(
      h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.jobs).toHaveLength(0);
  });

  it('handles ClickHouse not configured without Docker assumption', async () => {
    const h = buildHarness({ clickHouse: { configured: false, available: false } });
    const policy = await seedPolicy(h);
    await h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1');
    expect(h.steps.some((s) => s.target === 'CLICKHOUSE' && s.status === 'NOT_APPLICABLE')).toBe(true);
  });

  it('skips ClickHouse when runtime unavailable', async () => {
    const h = buildHarness({ clickHouse: { configured: true, available: false } });
    const policy = await seedPolicy(h);
    await h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1');
    expect(h.steps.some((s) => s.target === 'CLICKHOUSE' && s.status === 'SKIPPED')).toBe(true);
  });

  it('records partial failure when a store step fails', async () => {
    const h = buildHarness({ derivedFails: true });
    const policy = await seedPolicy(h);
    const job = await h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1');
    expect(job.status).toBe(ProcessingActivityDeletionJobStatus.PARTIAL_FAILURE);
    expect(h.steps.some((s) => s.target === 'DERIVED_DATA' && s.status === 'FAILED')).toBe(true);
    expect(h.decisions.some((d) => d.decisionType === ProcessingActivityDeletionDecisionType.DELETION_DEFERRED)).toBe(
      true,
    );
  });

  it('replays completed jobs idempotently without error', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h);
    const first = await h.executor.runJob(orgId, activityId, { dryRun: true, retentionPolicyId: policy.id }, 'user-1');
    const second = (await h.executor.runJob(orgId, activityId, { dryRun: true, retentionPolicyId: policy.id }, 'user-1')) as {
      idempotentReplay?: boolean;
      id: string;
    };
    expect(second.idempotentReplay).toBe(true);
    expect(second.id).toBe(first.id);
    expect(h.jobs).toHaveLength(1);
  });

  it('rejects wrong-tenant policy lookup', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h);
    await expect(
      h.executor.runJob(otherOrgId, activityId, { dryRun: true, retentionPolicyId: policy.id }, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never touches foreign tenant data in PostgreSQL adapter scope', async () => {
    const h = buildHarness();
    const postgres = new DeletionPostgresAdapter(h.prisma as never);
    await postgres.execute({
      organizationId: otherOrgId,
      processingActivityId: activityId,
      dryRun: false,
      deletionMethod: 'HARD_DELETE',
      anonymizationAllowed: false,
    });
    expect(h.prisma.processingActivityRegisterExport.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: otherOrgId, processingActivityId: activityId },
    });
    expect(h.prisma.processingActivityRegisterExport.deleteMany).not.toHaveBeenCalledWith({
      where: { organizationId: orgId, processingActivityId: activityId },
    });
  });

  it('separates governance decisions from technical deletion steps', async () => {
    const h = buildHarness();
    const policy = await seedPolicy(h);
    await h.executor.runJob(orgId, activityId, { dryRun: false, retentionPolicyId: policy.id }, 'user-1');
    expect(h.decisions.length).toBeGreaterThan(0);
    expect(h.steps.length).toBeGreaterThan(0);
    expect(h.decisions[0]).not.toHaveProperty('target');
    expect(h.steps[0]).toHaveProperty('target');
  });

  it('documents that cache invalidation is not full deletion', async () => {
    const h = buildHarness();
    const redis = new DeletionRedisAdapter(h.authDecision as never);
    const result = await redis.execute({
      organizationId: orgId,
      processingActivityId: activityId,
      dryRun: false,
      deletionMethod: 'HARD_DELETE',
      anonymizationAllowed: false,
    });
    expect(result.metadata?.notFullDeletion).toBe(true);
  });
});
