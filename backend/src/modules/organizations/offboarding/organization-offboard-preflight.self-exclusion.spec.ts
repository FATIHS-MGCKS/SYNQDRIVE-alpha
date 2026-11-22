import { OrganizationOffboardingJobStatus } from '@prisma/client';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';

describe('OrganizationOffboardPreflightService — self-exclusion', () => {
  it('does not treat the executing job as conflicting when excluded', async () => {
    const jobId = 'job-running';
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status: 'ACTIVE' }) },
      vehicle: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      booking: { count: jest.fn().mockResolvedValue(0) },
      organizationOffboardingJob: {
        findFirst: jest.fn().mockResolvedValue({ id: jobId }),
      },
      billingSubscription: { count: jest.fn().mockResolvedValue(0) },
      vehicleProviderConsent: { count: jest.fn().mockResolvedValue(0) },
    };
    const legalHold = { isBlocked: jest.fn().mockResolvedValue(false) };
    const vehiclePreflight = { assess: jest.fn() };
    const service = new OrganizationOffboardPreflightService(
      prisma as never,
      legalHold as never,
      vehiclePreflight as never,
    );
    const snap = await service.assess('org-1', { excludeOffboardingJobId: jobId });
    expect(snap.hardBlockers).not.toContain('CONFLICTING_ACTIVE_OFFBOARDING_JOB');
  });
});