import { CustomerEligibilityService } from './customer-eligibility.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { mapEligibilityToRentalClearance } from './rental-clearance.util';

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

  const defaultPolicy = {
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
  };

  const activeCustomer = {
    id: 'c1',
    organizationId: 'org1',
    status: 'ACTIVE',
    archivedAt: null,
    riskLevel: 'LOW',
    idVerificationStatus: 'VERIFIED',
    licenseVerificationStatus: 'NOT_SUBMITTED',
    licenseExpiry: new Date('2027-01-01'),
    idExpiry: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue(
      defaultPolicy,
    );
    (prisma.orgInvoice.count as jest.Mock).mockResolvedValue(0);
    (prisma.fine.count as jest.Mock).mockResolvedValue(0);
    (prisma.orgTask.count as jest.Mock).mockResolvedValue(0);
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue(activeCustomer);
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'verified',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: true,
      confirmBlockingReasons: [],
      pickupBlockingReasons: [],
      blockingReasons: [],
      warnings: [],
    });
  });

  it('blocks BLOCKED customer from pending booking', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      ...activeCustomer,
      status: 'BLOCKED',
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'PENDING',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(false);
    expect(result.globalBlockingReasons).toContain('Customer is blocked');
    expect(result.stages.createBooking.status).toBe('BLOCKED');
  });

  it('allows UNDER_REVIEW for pending but not confirmed', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      ...activeCustomer,
      status: 'UNDER_REVIEW',
      riskLevel: 'NOT_ASSESSED',
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

  it('blocks expired license for confirmed booking via confirm stage', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      ...activeCustomer,
      licenseExpiry: new Date('2025-01-01'),
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'CONFIRMED',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canConfirmBooking).toBe(false);
    expect(result.canCreatePendingBooking).toBe(true);
    expect(result.stages.confirmBooking.blockingReasons.some((r) =>
      r.includes('license expired'),
    )).toBe(true);
    expect(result.globalBlockingReasons).toHaveLength(0);
  });

  it('ID verified + missing license for pickup only does not globally block', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'verified',
      drivingLicense: 'missing',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: false,
      confirmBlockingReasons: [],
      pickupBlockingReasons: ['Führerscheinprüfung für Pickup erforderlich'],
      blockingReasons: [],
      warnings: [],
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(true);
    expect(result.canConfirmBooking).toBe(true);
    expect(result.canStartRental).toBe(false);
    expect(result.globalBlockingReasons).toHaveLength(0);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.stages.createBooking.status).toBe('CLEARED');
    expect(result.stages.confirmBooking.status).toBe('CLEARED');
    expect(result.stages.startPickup.status).toBe('BLOCKED');
    expect(result.stages.startPickup.blockingReasons).toContain(
      'Führerscheinprüfung für Pickup erforderlich',
    );

    const clearance = mapEligibilityToRentalClearance(result);
    expect(clearance.label).toBe('Pickup-Prüfung erforderlich');
    expect(clearance.label).not.toBe('Nicht freigegeben');
    expect(clearance.status).toBe('REVIEW_REQUIRED');
  });

  it('blocks confirm when ID missing and required for confirm', async () => {
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue({
      ...defaultPolicy,
      requireVerifiedIdForConfirmedBooking: true,
    });
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'missing',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: false,
      canStartPickup: false,
      confirmBlockingReasons: [
        'Ausweisprüfung für Buchungsbestätigung erforderlich',
      ],
      pickupBlockingReasons: ['Ausweisprüfung für Pickup erforderlich'],
      blockingReasons: ['Ausweisprüfung für Buchungsbestätigung erforderlich'],
      warnings: [],
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(true);
    expect(result.canConfirmBooking).toBe(false);
    expect(result.canStartRental).toBe(false);
    expect(result.stages.confirmBooking.blockingReasons).toContain(
      'Ausweisprüfung für Buchungsbestätigung erforderlich',
    );
  });

  it('warns on high risk without global block when policy allows', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      ...activeCustomer,
      riskLevel: 'HIGH',
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(true);
    expect(result.globalBlockingReasons).toHaveLength(0);
    expect(result.warnings).toContain('Customer has high risk rating');
  });

  it('blocks high risk globally when policy requires', async () => {
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue({
      ...defaultPolicy,
      blockHighRiskCustomer: true,
    });
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      ...activeCustomer,
      riskLevel: 'HIGH',
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(false);
    expect(result.globalBlockingReasons).toContain(
      'High-risk customer blocked by policy',
    );
  });

  it('blocks confirm and pickup when license required for confirm', async () => {
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue({
      ...defaultPolicy,
      requireVerifiedLicenseForConfirmedBooking: true,
    });
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'verified',
      drivingLicense: 'missing',
      proofOfAddress: 'not_required',
      canConfirmBooking: false,
      canStartPickup: false,
      confirmBlockingReasons: [
        'Führerscheinprüfung für Buchungsbestätigung erforderlich',
      ],
      pickupBlockingReasons: ['Führerscheinprüfung für Pickup erforderlich'],
      blockingReasons: [
        'Führerscheinprüfung für Buchungsbestätigung erforderlich',
      ],
      warnings: [],
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      startDate: new Date('2026-07-01'),
    });

    expect(result.canConfirmBooking).toBe(false);
    expect(result.canStartRental).toBe(false);
    expect(result.stages.confirmBooking.blockingReasons).toContain(
      'Führerscheinprüfung für Buchungsbestätigung erforderlich',
    );
  });

  it('pickup_required adds required action without blocking pending booking', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId: 'c1',
      idDocument: 'pickup_required',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: true,
      canStartPickup: false,
      confirmBlockingReasons: [],
      pickupBlockingReasons: ['Ausweisprüfung für Pickup erforderlich'],
      blockingReasons: [],
      warnings: [],
    });
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      ...activeCustomer,
      idVerificationStatus: 'PENDING_REVIEW',
    });

    const result = await service.evaluateForBooking('org1', 'c1', {
      requestedStatus: 'CONFIRMED',
      startDate: new Date('2026-07-01'),
    });

    expect(result.canCreatePendingBooking).toBe(true);
    expect(result.canConfirmBooking).toBe(true);
    expect(result.canStartRental).toBe(false);
    expect(result.requiredActions.some((a) => a.includes('beim Pickup'))).toBe(
      true,
    );
    expect(result.globalBlockingReasons).not.toContain(
      'Ausweisprüfung für Pickup erforderlich',
    );
    expect(result.stages.startPickup.blockingReasons).toContain(
      'Ausweisprüfung für Pickup erforderlich',
    );
  });
});
