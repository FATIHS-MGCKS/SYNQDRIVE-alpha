/**
 * DIMO handoff vs execution progress concurrency (disposable PostgreSQL).
 */
import { OrganizationOffboardingJobStatus, OrganizationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { persistJobUnderActiveLease } from './organization-offboarding-execution.lease-persist';
import { mintExecutionLease } from './organization-offboarding-execution.lease';
import {
  parseExecutionProgress,
  toProgressJson,
  type OrganizationOffboardingExecutionProgress,
} from './organization-offboarding-execution.progress';
import { persistDimoOwnerHandoffUnderLock, persistDimoPrivilegeVerificationUnderLock } from './organization-offboarding-dimo-progress-persist';

const ALLOWED_DB_TOKENS = ['synqdrive_org_offboarding_p6d4', 'synqdrive_org_offboarding_p6d2'];

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!ALLOWED_DB_TOKENS.some((t) => url.includes(t))) {
    throw new Error('DATABASE_URL must include synqdrive_org_offboarding_p6d4 or p6d2');
  }
}

const LIVE = process.env.ORGANIZATION_OFFBOARDING_DIMO_PROGRESS_CONCURRENCY_POSTGRES === '1';

(LIVE ? describe : describe.skip)('DIMO progress concurrency (postgres)', () => {
  let prisma: PrismaService;
  let organizationId: string;
  let jobId: string;
  let leaseToken: string;

  beforeAll(async () => {
    assertDisposableDb();
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        companyName: `DIMO Concurrency ${id.slice(0, 8)}`,
        shortCode: `dim${id.slice(0, 5)}`,
        businessType: 'RENTAL',
        status: OrganizationStatus.SUSPENDED,
        email: `${id}@example.test`,
      },
    });
    organizationId = id;

    const baseProgress = mintExecutionLease({ phasesCompleted: [] }, 'exec-concurrency-key');
    leaseToken = baseProgress.executionLease!.token;

    const job = await prisma.organizationOffboardingJob.create({
      data: {
        organizationId,
        idempotencyKey: `prep-${Date.now()}`,
        requestFingerprint: 'fp',
        status: OrganizationOffboardingJobStatus.RETRYABLE,
        phase: 'PROVIDER_QUIESCE',
        correlationId: `corr-${Date.now()}`,
        progressJson: toProgressJson(baseProgress),
        preflightSnapshot: {},
      },
    });
    jobId = job.id;
  });

  it('recheck vs execution — handoffs survive execution providerQuiesce update', async () => {
    const handoffResult = await prisma.$transaction(async (tx) => {
      return persistDimoOwnerHandoffUnderLock(tx, {
        organizationId,
        jobId,
        maxRecords: 50,
        onDuplicateIdempotency: () => undefined,
        appendHandoff: {
          handoffId: 'handoff-1',
          requestedAt: new Date().toISOString(),
          requestedByUserId: 'actor-1',
          organizationId,
          jobId,
          idempotencyKey: 'handoff-idem-1',
          affectedVehicleIds: ['v1'],
          verificationSnapshotReference: null,
          status: 'RECORDED',
        },
      });
    });
    expect(handoffResult.handoffs).toHaveLength(1);

    const executionProgress: OrganizationOffboardingExecutionProgress = {
      ...parseExecutionProgress(
        (await prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } })).progressJson,
      ),
      dimoOwnerHandoffs: [],
      providerQuiesce: {
        activeProviderConsentCount: 0,
        connectedDimoVehicleCount: 0,
        historicalProviderConsentCount: 1,
        everHadDimoVehicleLink: true,
        finalizationState: 'EXTERNAL_DISCONNECT_PENDING',
        providerEvidence: { dimo: {}, hm: {}, assessedAt: new Date().toISOString() },
      },
      phasesCompleted: ['PROVIDER_QUIESCE'],
    };

    await persistJobUnderActiveLease(prisma, {
      jobId,
      leaseToken,
      progress: executionProgress,
      phase: 'PROVIDER_QUIESCE',
      status: OrganizationOffboardingJobStatus.RETRYABLE,
      lastErrorCode: null,
    });

    const after = parseExecutionProgress(
      (await prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } })).progressJson,
    );
    expect(after.dimoOwnerHandoffs).toHaveLength(1);
    expect(after.providerQuiesce?.finalizationState).toBe('EXTERNAL_DISCONNECT_PENDING');
  });

  it('execution vs recheck — newer verification survives stale execution persist', async () => {
    await persistDimoPrivilegeVerificationUnderLock(prisma, {
      organizationId,
      jobId,
      verification: {
        lastVerifiedAt: '2026-03-01T12:00:00.000Z',
        providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE',
        detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
        verificationSnapshotReference: 'snap-recheck',
        privilegedStillActiveTokenIds: [99],
        providerEvidenceSummary: { privilegedStillActive: [99] },
      },
    });

    const staleExec: OrganizationOffboardingExecutionProgress = {
      phasesCompleted: ['SUSPEND'],
      dimoPrivilegeVerification: {
        lastVerifiedAt: '2026-01-01T00:00:00.000Z',
        providerCheckStatus: 'NOT_VERIFIED',
        detailCode: null,
        verificationSnapshotReference: 'snap-stale',
        privilegedStillActiveTokenIds: [],
        providerEvidenceSummary: {},
      },
    };

    await persistJobUnderActiveLease(prisma, {
      jobId,
      leaseToken,
      progress: staleExec,
      phase: 'SUSPEND',
      status: OrganizationOffboardingJobStatus.RETRYABLE,
      lastErrorCode: null,
    });

    const afterExec = parseExecutionProgress(
      (await prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } })).progressJson,
    );
    expect(afterExec.dimoPrivilegeVerification?.verificationSnapshotReference).toBe('snap-recheck');
  });

  it('parallel recheck — newer B survives when stale A finishes last', async () => {
    const newer = {
      lastVerifiedAt: '2026-04-02T12:00:00.000Z',
      providerCheckStatus: 'CONFIRMED_ABSENT',
      detailCode: null,
      verificationSnapshotReference: 'snap-parallel-b',
      privilegedStillActiveTokenIds: [] as number[],
      providerEvidenceSummary: {},
    };
    const older = {
      ...newer,
      lastVerifiedAt: '2026-04-01T08:00:00.000Z',
      providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE',
      detailCode: 'DIMO_PRIVILEGE_STILL_ACTIVE',
      verificationSnapshotReference: 'snap-parallel-a',
      privilegedStillActiveTokenIds: [7],
    };

    const startedEarlierFinishesLast = (async () => {
      await new Promise((r) => setImmediate(r));
      const bResult = await persistDimoPrivilegeVerificationUnderLock(prisma, {
        organizationId,
        jobId,
        verification: newer,
      });
      return persistDimoPrivilegeVerificationUnderLock(prisma, {
        organizationId,
        jobId,
        verification: older,
      }).then((aResult) => ({ aResult, bResult }));
    })();

    const { aResult, bResult } = await startedEarlierFinishesLast;
    expect(bResult.verificationApplied).toBe(true);
    expect(aResult.verificationApplied).toBe(false);
    expect(aResult.effectiveVerification.verificationSnapshotReference).toBe('snap-parallel-b');
    expect(aResult.effectiveVerification.providerCheckStatus).toBe('CONFIRMED_ABSENT');

    const after = parseExecutionProgress(
      (await prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } })).progressJson,
    );
    expect(after.dimoPrivilegeVerification?.verificationSnapshotReference).toBe('snap-parallel-b');
    expect(after.executionLease?.token).toBe(leaseToken);
  });

  it('duplicate concurrent handoff idempotency key yields single record', async () => {
    const append = {
      handoffId: 'h-dup',
      requestedAt: new Date().toISOString(),
      requestedByUserId: 'actor-1',
      organizationId,
      jobId,
      idempotencyKey: 'same-idem',
      affectedVehicleIds: ['v1'],
      verificationSnapshotReference: null,
      status: 'RECORDED' as const,
    };

    await Promise.all([
      prisma.$transaction((tx) =>
        persistDimoOwnerHandoffUnderLock(tx, {
          organizationId,
          jobId,
          maxRecords: 50,
          onDuplicateIdempotency: () => undefined,
          appendHandoff: append,
        }),
      ),
      prisma.$transaction(async (tx) => {
        await new Promise((r) => setTimeout(r, 5));
        return persistDimoOwnerHandoffUnderLock(tx, {
          organizationId,
          jobId,
          maxRecords: 50,
          onDuplicateIdempotency: () => undefined,
          appendHandoff: { ...append, handoffId: 'h-dup-2' },
        });
      }),
    ]);

    const after = parseExecutionProgress(
      (await prisma.organizationOffboardingJob.findUniqueOrThrow({ where: { id: jobId } })).progressJson,
    );
    expect(after.dimoOwnerHandoffs?.filter((h) => h.idempotencyKey === 'same-idem')).toHaveLength(1);
  });
});