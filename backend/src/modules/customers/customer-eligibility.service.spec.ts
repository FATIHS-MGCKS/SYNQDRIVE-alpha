import { CustomerEligibilityService } from './customer-eligibility.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('CustomerEligibilityService', () => {
  const prisma = {
    customer: { findFirst: jest.fn() },
    customerEligibilityPolicy: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    orgInvoice: { count: jest.fn() },
    fine: { count: jest.fn() },
    orgTask: { count: jest.fn() },
  } as unknown as PrismaService;

  const service = new CustomerEligibilityService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      organizationId: 'org1',
      requireVerifiedIdForConfirmedBooking: false,
      requireVerifiedLicenseForConfirmedBooking: false,
      requireVerifiedIdForPickup: true,
      requireVerifiedLicenseForPickup: true,
      blockExpiredLicense: true,
      blockExpiredId: true,
      warnLicenseExpiringWithinDays: 30,
      warnIdExpiringWithinDays: 30,
      blockHighRiskCustomer: false,
      blockOpenOverdueInvoices: false,
      blockOpenFines: false,
    });
    (prisma.orgInvoice.count as jest.Mock).mockResolvedValue(0);
    (prisma.fine.count as jest.Mock).mockResolvedValue(0);
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(0);
  });

  it('blocks BLOCKED customer from pending booking', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      status: 'BLOCKED',
      archivedAt: null,
      riskLevel: 'NOT_ASSESSED',
      idVerificationStatus: 'NOT_SUBMITTED',
      licenseVerificationStatus: 'NOT_SUBMITTED',
      licenseExpiry: null,
      idExpiry: null,
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'PENDING',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(false);
    expect(result.blockingReasons).toContain('Customer is blocked');
  });

  it('allows UNDER_REVIEW for pending but not confirmed', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      status: 'UNDER_REVIEW',
      archivedAt: null,
      riskLevel: 'NOT_ASSESSED',
      idVerificationStatus: 'NOT_SUBMITTED',
      licenseVerificationStatus: 'NOT_SUBMITTED',
      licenseExpiry: new Date('2027-01-01'),
      idExpiry: null,
    });

    const pending = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'PENDING',
      startDate: new Date('2026-07-01'),
    });
    expect(pending.canCreatePendingBooking).toBe(true);
    expect(pending.canConfirmBooking).toBe(false);

    const confirmed = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'CONFIRMED',
      startDate: new Date('2026-07-01'),
    });
    expect(confirmed.canConfirmBooking).toBe(false);
  });

  it('blocks expired license for confirmed booking', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      status: 'ACTIVE',
      archivedAt: null,
      riskLevel: 'LOW',
      idVerificationStatus: 'VERIFIED',
      licenseVerificationStatus: 'VERIFIED',
      licenseExpiry: new Date('2025-01-01'),
      idExpiry: null,
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'CONFIRMED',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canConfirmBooking).toBe(false);
    expect(result.blockingReasons.some((r) => r.includes('license expired'))).toBe(
      true,
    );
  });
});
