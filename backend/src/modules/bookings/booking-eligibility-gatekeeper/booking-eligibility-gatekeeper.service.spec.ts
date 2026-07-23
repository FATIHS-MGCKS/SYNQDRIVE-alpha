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
import { BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION } from './booking-eligibility-gatekeeper.constants';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';

describe('BookingEligibilityGatekeeperService', () => {
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

  const baseVerification = {
    customerId,
    idDocument: 'verified' as const,
    drivingLicense: 'verified' as const,
    proofOfAddress: 'not_required' as const,
    canConfirmBooking: true,
    canStartPickup: true,
    confirmBlockingReasons: [],
    pickupBlockingReasons: [],
    blockingReasons: [],
    warnings: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: vehicleId });
    (customerEligibility.evaluateForBooking as jest.Mock).mockResolvedValue(clearedCustomer);
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue(baseVerification);
    (rentalEligibility.check as jest.Mock).mockResolvedValue(baseRentalResult);
    (rentalHealth.isRentalBlocked as jest.Mock).mockResolvedValue({
      blocked: false,
      reasons: [],
      healthGateStatus: 'OK',
      healthGateWarning: null,
      manualReviewRequired: false,
    });
  });

  it('returns ELIGIBLE when all domains pass on CREATE stage', async () => {
    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.allowed).toBe(true);
    expect(result.engineVersion).toBe(BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION);
    expect(result.evaluatedAt).toBeTruthy();
    expect(result.domains.customer.evaluated).toBe(true);
    expect(result.domains.verification.evaluated).toBe(true);
    expect(result.domains.rentalRules.evaluated).toBe(true);
    expect(result.domains.vehicle.vehicleFound).toBe(true);
    expect(result.domains.vehicleReadiness.skipped).toBe(true);
    expect(result.domains.pricingDeposit.skipped).toBe(true);
  });

  it('returns NOT_ELIGIBLE when customer is blocked', async () => {
    const buckets = createEligibilityBuckets();
    buckets.globalBlockingReasons.push('Customer is blocked');
    (customerEligibility.evaluateForBooking as jest.Mock).mockResolvedValue(
      assembleCustomerEligibilityResult(customerId, buckets, {
        canCreatePendingBooking: false,
        canConfirmBooking: false,
        canStartRental: false,
      }),
    );

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain('CUSTOMER_BLOCKED');
  });

  it('returns MISSING_INFORMATION when rental rules lack customer data', async () => {
    (rentalEligibility.check as jest.Mock).mockResolvedValue({
      ...baseRentalResult,
      status: 'MISSING_INFORMATION',
      missingFields: ['customer.dateOfBirth'],
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'PREVIEW',
      startDate,
    });

    expect(result.status).toBe('MISSING_INFORMATION');
    expect(result.missingFields).toContain('customer.dateOfBirth');
    expect(result.recheckRequired).toBe(true);
  });

  it('returns MANUAL_APPROVAL_REQUIRED from rental rules domain', async () => {
    (rentalEligibility.check as jest.Mock).mockResolvedValue({
      ...baseRentalResult,
      status: 'MANUAL_APPROVAL_REQUIRED',
      manualApprovalReasons: ['Foreign travel requires manual approval'],
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'PREVIEW',
      startDate,
      foreignTravelRequested: true,
    });

    expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
    expect(result.allowed).toBe(true);
  });

  it('returns NOT_ELIGIBLE when vehicle is not found', async () => {
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.reasonCodes).toContain('VEHICLE_NOT_FOUND');
  });

  it('returns TEMPORARILY_UNAVAILABLE when vehicle readiness is unavailable', async () => {
    (rentalHealth.isRentalBlocked as jest.Mock).mockResolvedValue({
      blocked: true,
      reasons: ['Health aggregation incomplete'],
      healthGateStatus: 'UNAVAILABLE',
      healthGateWarning: 'Manual review required',
      manualReviewRequired: true,
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
      includeVehicleReadiness: true,
    });

    expect(result.status).toBe('TEMPORARILY_UNAVAILABLE');
    expect(result.recheckRequired).toBe(true);
    expect(result.reasonCodes).toContain('VEHICLE_READINESS_UNAVAILABLE');
  });

  it('returns NOT_ELIGIBLE when vehicle readiness blocks rental', async () => {
    (rentalHealth.isRentalBlocked as jest.Mock).mockResolvedValue({
      blocked: true,
      reasons: ['Brake service overdue'],
      healthGateStatus: 'BLOCKED',
      healthGateWarning: null,
      manualReviewRequired: false,
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
      includeVehicleReadiness: true,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.reasonCodes).toContain('VEHICLE_RENTAL_BLOCKED');
  });

  it('delegates rental eligibility check with booking context', async () => {
    await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CREATE',
      startDate,
      bookingId: 'book-1',
      paymentIntent: 'payment_link',
      foreignTravelRequested: true,
      additionalDriverCount: 1,
      depositReceived: true,
    });

    expect(rentalEligibility.check).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        customerId,
        vehicleId,
        bookingId: 'book-1',
        paymentIntent: 'payment_link',
        foreignTravelRequested: true,
        additionalDriverCount: 1,
        depositReceived: true,
      }),
    );
  });

  it('evaluateForBooking loads booking and delegates to evaluate', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      id: 'book-1',
      customerId,
      vehicleId,
      startDate,
      endDate: null,
      status: 'PENDING',
    });

    const result = await service.evaluateForBooking(orgId, 'book-1', 'CREATE');

    expect(result.bookingId).toBe('book-1');
    expect(result.status).toBe('ELIGIBLE');
  });

  it('evaluateForBooking throws when booking is missing', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.evaluateForBooking(orgId, 'missing', 'CREATE'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('evaluateWithExtensions merges extension evaluator results', async () => {
    const result = await service.evaluateWithExtensions(
      {
        organizationId: orgId,
        customerId,
        vehicleId,
        stage: 'CREATE',
        startDate,
      },
      [
        {
          domain: 'pricing_deposit',
          evaluate: async () => ({
            blockingReasons: [
              {
                code: 'PRICING_DEPOSIT_CONFLICT',
                domain: 'pricing_deposit',
                message: 'Tariff deposit differs from rental rules deposit',
              },
            ],
            warnings: [],
            status: 'NOT_ELIGIBLE',
          }),
        },
      ],
    );

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.reasonCodes).toContain('PRICING_DEPOSIT_CONFLICT');
  });

  it('includes sourceRuleIds from effective rental rules', async () => {
    (rentalEligibility.check as jest.Mock).mockResolvedValue({
      ...baseRentalResult,
      effectiveRules: {
        ...baseRentalResult.effectiveRules,
        rentalCategoryId: 'cat-premium',
      },
    });

    const result = await service.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'PREVIEW',
      startDate,
    });

    expect(result.sourceRuleIds).toEqual(
      expect.arrayContaining(['org:org-1', 'category:cat-premium', `vehicle:${vehicleId}`]),
    );
  });
});
