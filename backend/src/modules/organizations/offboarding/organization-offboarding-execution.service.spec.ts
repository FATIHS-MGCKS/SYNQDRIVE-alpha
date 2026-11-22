import { OrganizationOffboardingJobStatus, OrganizationStatus } from '@prisma/client';
import { OrganizationOffboardingExecutionService } from './organization-offboarding-execution.service';
import { OFFBOARDING_EXECUTION_CONFIRM_VALUE } from './organization-offboarding-execution.policy';

describe('OrganizationOffboardingExecutionService', () => {
  const preflightAssess = jest.fn();
  const preflight = { assess: preflightAssess };
  const refreshTokens = { revokeAllActiveForOrganization: jest.fn().mockResolvedValue(3) };
  const vehicleOffboard = { offboardVehicle: jest.fn() };
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
    organizationMembership: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    vehicle: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    vehicleProviderConsent: { count: jest.fn().mockResolvedValue(0) },
    organizationOffboardingJob: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new OrganizationOffboardingExecutionService(
    prisma as never,
    preflight as never,
    refreshTokens as never,
    vehicleOffboard as never,
    masterAudit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED = '1';
    process.env.NODE_ENV = 'test';
    preflightAssess.mockResolvedValue({
      hardBlockers: [],
      reviewRequired: [],
      warnings: [],
      signals: {},
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        organizationOffboardingJob: {
          findFirst: jest.fn().mockResolvedValue(jobRow),
          update: jest.fn().mockImplementation(async ({ data }) => ({ ...jobRow, ...data })),
        },
      };
      return fn(tx);
    });
    prisma.organization.findUnique.mockResolvedValue({ status: OrganizationStatus.ACTIVE });
    prisma.organization.update.mockResolvedValue({ status: OrganizationStatus.SUSPENDED });
    prisma.organizationOffboardingJob.update.mockImplementation(async ({ data }) => ({
      ...jobRow,
      ...data,
    }));
    prisma.organizationMembership.findMany.mockResolvedValue([{ id: 'm1' }]);
    prisma.organizationMembership.update.mockResolvedValue({ id: 'm1' });
  });

  it('suspends organization idempotently through execution phases', async () => {
    const result = await service.execute(
      'org-1',
      { idempotencyKey: 'exec-1', confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE },
      'ma-1',
    );
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    expect(refreshTokens.revokeAllActiveForOrganization).toHaveBeenCalledWith('org-1');
    expect(result.phase).toBe('READY_FOR_ARCHIVE');
    expect(result.executionProgress.phasesCompleted).toContain('SUSPEND');
  });

  it('revalidates with executing job self-exclusion', async () => {
    await service.execute(
      'org-1',
      { idempotencyKey: 'exec-2', confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE },
      'ma-1',
    );
    expect(preflightAssess).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ excludeOffboardingJobId: 'job-1', suspendAdmissionOnly: true }),
    );
  });

  it('fails closed in production without execution flag', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED;
    await expect(
      service.execute(
        'org-1',
        { idempotencyKey: 'exec-3', confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE },
        'ma-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'ORGANIZATION_OFFBOARDING_EXECUTION_DISABLED' } });
  });
});