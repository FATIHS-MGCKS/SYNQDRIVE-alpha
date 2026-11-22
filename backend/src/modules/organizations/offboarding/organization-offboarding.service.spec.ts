import { ConflictException } from '@nestjs/common';
import { OrganizationOffboardingJobStatus } from '@prisma/client';
import { OrganizationOffboardingService } from './organization-offboarding.service';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';
import { fingerprintOffboardingPrepareRequest } from './organization-offboarding.fingerprint';

describe('OrganizationOffboardingService', () => {
  const preflightAssess = jest.fn();
  const preflight = {
    assess: preflightAssess,
  } as unknown as OrganizationOffboardPreflightService;

  const prisma = {
    organization: { findUnique: jest.fn() },
    organizationOffboardingJob: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const service = new OrganizationOffboardingService(prisma as never, preflight);

  beforeEach(() => {
    jest.resetAllMocks();
    preflightAssess.mockResolvedValue({
      assessedAt: new Date().toISOString(),
      organizationId: 'org-1',
      organizationStatus: 'ACTIVE',
      activeRegistryVehicleCount: 0,
      hardBlockers: [],
      reviewRequired: [],
      warnings: [],
      signals: {
        ongoingTripCount: 0,
        activeBookingCount: 0,
        futureCommittedBookingCount: 0,
        vehiclesWithVehiclePreflightBlockCount: 0,
        activeProviderConsentCount: 0,
        connectedDimoVehicleCount: 0,
        activeBillingSubscriptionCount: 0,
        activeOffboardingJobId: null,
        organizationLegalHoldActive: false,
      },
    });
  });

  it('returns same job for identical idempotency key replay', async () => {
    const req = { idempotencyKey: 'key-a' };
    const fp = fingerprintOffboardingPrepareRequest(req);
    const row = {
      id: 'job-1',
      organizationId: 'org-1',
      idempotencyKey: 'key-a',
      requestFingerprint: fp,
      status: OrganizationOffboardingJobStatus.PREPARED,
      phase: 'PREPARE',
      correlationId: 'corr',
      requestedByUserId: 'ma-1',
      requestedAt: new Date(),
      completedAt: null,
      lastErrorCode: null,
      preflightSnapshot: {},
    };
    prisma.organizationOffboardingJob.findUnique.mockResolvedValue(row);

    const result = await service.prepare('org-1', req, 'ma-1');
    expect(result.idempotentReplay).toBe(true);
    expect(result.jobId).toBe('job-1');
  });

  it('conflicts when idempotency key reused with different fingerprint', async () => {
    prisma.organizationOffboardingJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestFingerprint: 'other-fp',
    });
    await expect(
      service.prepare('org-1', { idempotencyKey: 'key-a', note: 'x' }, 'ma-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks prepare when hard blockers present', async () => {
    prisma.organizationOffboardingJob.findUnique.mockResolvedValue(null);
    preflightAssess.mockResolvedValue({
      hardBlockers: ['ONGOING_TRIP'],
      reviewRequired: [],
      warnings: [],
      signals: {},
      organizationId: 'org-1',
      organizationStatus: 'ACTIVE',
      activeRegistryVehicleCount: 1,
      assessedAt: new Date().toISOString(),
    });
    await expect(
      service.prepare('org-1', { idempotencyKey: 'key-b' }, 'ma-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED',
      }),
    });
  });
});