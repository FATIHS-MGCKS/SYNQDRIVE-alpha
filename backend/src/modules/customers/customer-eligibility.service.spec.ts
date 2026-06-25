import { CustomerEligibilityService } from './customer-eligibility.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';

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

  const verificationService = {
    getEligibilityStatus: jest.fn(),
  } as unknown as CustomerVerificationService;

  const service = new CustomerEligibilityService(prisma, verificationService);

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
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'verified',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: true,
      blockingReasons: [],
      warnings: [],
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

  it('blocks pickup when verification reports rejected ID', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'rejected',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: false,
      canStartPickup: false,
      blockingReasons: ['Ausweisprüfung abgelehnt'],
      warnings: [],
    });
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      status: 'ACTIVE',
      archivedAt: null,
      riskLevel: 'LOW',
      idVerificationStatus: 'REJECTED',
      licenseVerificationStatus: 'VERIFIED',
      licenseExpiry: new Date('2027-01-01'),
      idExpiry: null,
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'ACTIVE',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canStartRental).toBe(false);
    expect(result.blockingReasons).toContain('Ausweisprüfung abgelehnt');
  });

  it('pickup_required adds required action without blocking pending booking', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'pickup_required',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: false,
      blockingReasons: ['Ausweisprüfung für Pickup erforderlich'],
      warnings: [],
    });
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      status: 'ACTIVE',
      archivedAt: null,
      riskLevel: 'LOW',
      idVerificationStatus: 'PENDING_REVIEW',
      licenseVerificationStatus: 'VERIFIED',
      licenseExpiry: new Date('2027-01-01'),
      idExpiry: null,
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'CONFIRMED',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canStartRental).toBe(false);
    expect(result.requiredActions.some((a) => a.includes('beim Pickup'))).toBe(true);
    expect(result.blockingReasons).toContain('Ausweisprüfung für Pickup erforderlich');
  });
});
