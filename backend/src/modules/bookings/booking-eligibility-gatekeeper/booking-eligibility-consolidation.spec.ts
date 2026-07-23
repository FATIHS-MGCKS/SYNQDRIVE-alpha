import { NotFoundException } from '@nestjs/common';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { BookingRentalEligibilityService } from '../booking-rental-eligibility.service';
import {
  assembleCustomerEligibilityResult,
  createEligibilityBuckets,
} from '@modules/customers/types/customer-eligibility.types';
import { BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE } from '../booking-rental-eligibility.types';
import { BOOKING_ELIGIBILITY_REASON_CODE } from './booking-eligibility-gatekeeper.constants';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';

describe('booking eligibility consolidation', () => {
  const orgId = 'org-1';
  const customerId = 'cust-1';
  const vehicleId = 'veh-1';
  const startDate = new Date('2026-07-01T10:00:00.000Z');

  const prisma = {
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const customerEligibility = {
    evaluateForBooking: jest.fn(),
  } as unknown as CustomerEligibilityService;

  const verificationService = {
    getEligibilityStatus: jest.fn(),
  } as unknown as CustomerVerificationService;

  const rentalEligibility = {
    check: jest.fn(),
  } as unknown as BookingRentalEligibilityService;

  const rentalHealth = {
    isRentalBlocked: jest.fn(),
  } as unknown as RentalHealthService;

  const service = new BookingEligibilityGatekeeperService(
    prisma,
    customerEligibility,
    verificationService,
    rentalEligibility,
    rentalHealth,
  );

  const clearedCustomer = assembleCustomerEligibilityResult(
    customerId,
    createEligibilityBuckets(),
    {
      canCreatePendingBooking: true,
      canConfirmBooking: true,
      canStartRental: true,
    },
  );

  const baseRentalResult = {
    status: 'ELIGIBLE' as const,
    blockingReasons: [],
    warningReasons: [],
    missingFields: [],
    manualApprovalReasons: [],
    effectiveRules: {
      organizationId: orgId,
      vehicleId,
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: true,
      activation: createActiveRentalRulesActivationSnapshot(),
      minimumAgeYears: { value: 21, source: 'ORGANIZATION_DEFAULT', sourceName: 'Org' },
      minimumLicenseHoldingMonths: { value: 12, source: 'ORGANIZATION_DEFAULT', sourceName: 'Org' },
      depositAmountCents: { value: null, source: null, sourceName: null },
      depositAmount: { value: null, source: null, sourceName: null },
      depositCurrency: { value: 'EUR', source: null, sourceName: null },
      creditCardRequired: { value: false, source: null, sourceName: null },
      foreignTravelPolicy: { value: 'ALLOWED', source: null, sourceName: null },
      additionalDriverPolicy: { value: 'ALLOWED', source: null, sourceName: null },
      youngDriverPolicy: { value: 'ALLOWED', source: null, sourceName: null },
      insuranceRequirement: { value: null, source: null, sourceName: null },
      manualApprovalRequired: { value: false, source: null, sourceName: null },
      notes: { value: null, source: null, sourceName: null },
      minimumLicenseHoldingYears: { value: 1, source: 'ORGANIZATION_DEFAULT', sourceName: 'Org' },
    },
    decisionSource: BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE,
    facts: [],
    customerId,
    vehicleId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: vehicleId });
    (customerEligibility.evaluateForBooking as jest.Mock).mockResolvedValue(clearedCustomer);
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId,
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
    (rentalEligibility.check as jest.Mock).mockResolvedValue(baseRentalResult);
    (rentalHealth.isRentalBlocked as jest.Mock).mockResolvedValue({
      blocked: false,
      reasons: [],
      healthGateStatus: 'OK',
    });
  });

  it('fetches verification once and passes snapshot to customer eligibility', async () => {
    await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
    });

    expect(verificationService.getEligibilityStatus).toHaveBeenCalledTimes(1);
    expect(customerEligibility.evaluateForBooking).toHaveBeenCalledWith(
      orgId,
      customerId,
      expect.objectContaining({
        verificationSnapshot: expect.objectContaining({
          idDocument: 'verified',
        }),
      }),
    );
  });

  it('delegates rental rules without duplicate verification impact', async () => {
    await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
    });

    expect(rentalEligibility.check).toHaveBeenCalledWith(
      expect.objectContaining({
        skipVerificationImpact: true,
      }),
    );
  });

  it('customer block wins over rental eligibility and verification warnings', async () => {
    const buckets = createEligibilityBuckets();
    buckets.globalBlockingReasons.push('Customer is blocked');
    (customerEligibility.evaluateForBooking as jest.Mock).mockResolvedValue(
      assembleCustomerEligibilityResult(customerId, buckets, {
        canCreatePendingBooking: false,
        canConfirmBooking: false,
        canStartRental: false,
      }),
    );
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId,
      idDocument: 'pending',
      drivingLicense: 'pending',
      proofOfAddress: 'not_required',
      canConfirmBooking: false,
      canStartPickup: false,
      confirmBlockingReasons: [],
      pickupBlockingReasons: [],
      blockingReasons: [],
      warnings: [],
    });
    (rentalEligibility.check as jest.Mock).mockResolvedValue({
      ...baseRentalResult,
      status: 'MANUAL_APPROVAL_REQUIRED',
      manualApprovalReasons: ['Foreign travel requires manual approval.'],
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
    });

    expect(result.decisionAuthority).toBe('GATEKEEPER');
    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons[0]?.code).toBe(
      BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED,
    );
  });

  it('verification pending on confirm resolves to manual approval, not eligible', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId,
      idDocument: 'requires_review',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: false,
      canStartPickup: true,
      confirmBlockingReasons: [],
      pickupBlockingReasons: [],
      blockingReasons: [],
      warnings: [],
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
    });

    expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
    expect(result.reasonCodes).toContain(
      BOOKING_ELIGIBILITY_REASON_CODE.ID_DOCUMENT_REQUIRES_REVIEW,
    );
  });

  it('rental rule violation wins over missing-information-only verification on confirm', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue({
      customerId,
      idDocument: 'missing',
      drivingLicense: 'verified',
      proofOfAddress: 'not_required',
      canConfirmBooking: false,
      canStartPickup: true,
      confirmBlockingReasons: [],
      pickupBlockingReasons: [],
      blockingReasons: [],
      warnings: [],
    });
    (rentalEligibility.check as jest.Mock).mockResolvedValue({
      ...baseRentalResult,
      status: 'NOT_ELIGIBLE',
      blockingReasons: [
        'Customer is 19 years old but this vehicle requires minimum age 21.',
      ],
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.reasonCodes).toContain(
      BOOKING_ELIGIBILITY_REASON_CODE.MINIMUM_AGE_NOT_MET,
    );
  });

  it('throws when evaluateForBooking booking is missing', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.evaluateForBooking(orgId, 'missing-booking', 'PREVIEW'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
