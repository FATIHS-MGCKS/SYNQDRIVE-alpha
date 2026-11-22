import { OrganizationStatus } from '@prisma/client';
import { OrganizationOffboardPreflightService } from './organization-offboard-preflight.service';

describe('OrganizationOffboardPreflightService — lifecycle admission', () => {
  const legalHold = { isBlocked: jest.fn().mockResolvedValue(false) };
  const vehiclePreflight = { assess: jest.fn().mockResolvedValue({ allowed: true, blockingReasons: [], warnings: [] }) };

  function build(status: OrganizationStatus) {
    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-1', status }),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      organizationOffboardingJob: { findFirst: jest.fn().mockResolvedValue(null) },
      billingSubscription: { count: jest.fn().mockResolvedValue(0) },
      vehicleProviderConsent: { count: jest.fn().mockResolvedValue(0) },
      booking: { count: jest.fn().mockResolvedValue(0) },
    };
    return new OrganizationOffboardPreflightService(
      prisma as never,
      legalHold as never,
      vehiclePreflight as never,
    );
  }

  it('allows ACTIVE without INVALID_ORGANIZATION_STATUS blocker', async () => {
    const snap = await build(OrganizationStatus.ACTIVE).assess('org-1');
    expect(snap.hardBlockers).not.toContain('INVALID_ORGANIZATION_STATUS');
  });

  it('allows SUSPENDED without INVALID_ORGANIZATION_STATUS blocker', async () => {
    const snap = await build(OrganizationStatus.SUSPENDED).assess('org-1');
    expect(snap.hardBlockers).not.toContain('INVALID_ORGANIZATION_STATUS');
  });

  it('blocks PENDING with INVALID_ORGANIZATION_STATUS', async () => {
    const snap = await build(OrganizationStatus.PENDING).assess('org-1');
    expect(snap.hardBlockers).toContain('INVALID_ORGANIZATION_STATUS');
  });

  it('blocks ARCHIVED with ORGANIZATION_ALREADY_ARCHIVED', async () => {
    const snap = await build(OrganizationStatus.ARCHIVED).assess('org-1');
    expect(snap.hardBlockers).toContain('ORGANIZATION_ALREADY_ARCHIVED');
  });
});