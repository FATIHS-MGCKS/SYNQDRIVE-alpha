import { OrganizationOffboardingJobStatus } from '@prisma/client';
import { OrganizationOffboardingExecutionService } from './organization-offboarding-execution.service';
import { OFFBOARDING_EXECUTION_CONFIRM_VALUE } from './organization-offboarding-execution.policy';

describe('OrganizationOffboardingExecutionService — failed phase retry', () => {
  it('does not mark REVALIDATE complete when blocked', async () => {
    const preflightAssess = jest.fn().mockResolvedValue({
      hardBlockers: ['INVALID_ORGANIZATION_STATUS'],
      reviewRequired: [],
      warnings: [],
    });
    const masterAudit = { record: jest.fn().mockResolvedValue(undefined) };

    const jobRow = {
      id: 'job-1',
      organizationId: 'org-1',
      idempotencyKey: 'prepare-key',
      status: OrganizationOffboardingJobStatus.PREPARED,
      phase: 'PREPARE',
      correlationId: 'corr',
      requestedByUserId: 'ma-1',
      requestedAt: new Date(),
      completedAt: null,
      lastErrorCode: null,
      preflightSnapshot: {},
      progressJson: {},
    };

    const prisma = {
      $transaction: jest.fn(),
      organization: { findUnique: jest.fn(), update: jest.fn() },
      organizationMembership: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      vehicleProviderConsent: { count: jest.fn().mockResolvedValue(0) },
      organizationOffboardingJob: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };

    const service = new OrganizationOffboardingExecutionService(
      prisma as never,
      { assess: preflightAssess } as never,
      { revokeAllActiveForOrganization: jest.fn() } as never,
      { offboardVehicle: jest.fn() } as never,
      masterAudit as never,
    );

    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED = '1';
    process.env.NODE_ENV = 'test';

    const leaseProgress = {
      phasesCompleted: [] as string[],
      execution: { idempotencyKey: 'exec-x', claimedAt: new Date().toISOString(), actorUserId: 'ma-1' },
      executionLease: {
        token: 'tok',
        fence: 1,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        executionIdempotencyKey: 'exec-x',
      },
    };

    let latestProgress: typeof leaseProgress = leaseProgress;
    let latestRow = { ...jobRow };

    prisma.organization.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.organizationOffboardingJob.findFirst.mockResolvedValue(jobRow);
    const jobUpdateFromData = async (data: Record<string, unknown>) => {
      if (data.progressJson) {
        latestProgress = data.progressJson as typeof leaseProgress;
      }
      latestRow = { ...latestRow, ...data };
      return { ...latestRow };
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        organizationMembership: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        organizationOffboardingJob: {
          findFirst: jest.fn().mockResolvedValue(jobRow),
          findUniqueOrThrow: jest.fn().mockImplementation(async () => ({ ...latestRow, progressJson: latestProgress })),
          update: jest.fn().mockImplementation(async ({ data }) => jobUpdateFromData(data)),
        },
      };
      return fn(tx);
    });

    prisma.organizationOffboardingJob.update.mockImplementation(async ({ data }) => jobUpdateFromData(data));
    prisma.organizationOffboardingJob.findUnique.mockImplementation(async () => ({
      ...latestRow,
      progressJson: latestProgress,
    }));
    prisma.organizationOffboardingJob.findUniqueOrThrow.mockImplementation(async () => ({
      ...latestRow,
      progressJson: latestProgress,
    }));

    const result = await service.execute(
      'org-1',
      { idempotencyKey: 'exec-x', confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE },
      'ma-1',
    );
    expect(result.executionProgress.phasesCompleted).not.toContain('REVALIDATE');
    expect(result.phase).not.toBe('READY_FOR_ARCHIVE');
    expect(masterAudit.record).toHaveBeenCalled();
  });
});