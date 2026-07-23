import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-enforcement.service';
import { BookingEligibilityAuditLogger } from './booking-eligibility-audit.logger';
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

describe('booking eligibility fail-closed policy', () => {
  const orgId = 'org-1';
  const customerId = 'cust-1';
  const vehicleId = 'veh-1';
  const startDate = new Date('2026-07-01T10:00:00.000Z');
  const endDate = new Date('2026-07-05T10:00:00.000Z');

  const prisma = {
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    bookingAllowedDriver: { count: jest.fn() },
    bookingDeposit: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
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

  const auditLogger = {
    logEvaluation: jest.fn(),
  } as unknown as BookingEligibilityAuditLogger;

  const gatekeeper = new BookingEligibilityGatekeeperService(
    prisma,
    customerEligibility,
    verificationService,
    rentalEligibility,
    rentalHealth,
  );

  const enforcement = new BookingEligibilityEnforcementService(
    prisma,
    gatekeeper,
    auditLogger,
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
    effectiveRules: null,
    decisionSource: BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE,
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
    warnings: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.vehicle.findFirst as jest.Mock).mockResolvedValue({ id: vehicleId });
    (prisma.bookingAllowedDriver.count as jest.Mock).mockResolvedValue(0);
    (prisma.bookingDeposit.findFirst as jest.Mock).mockResolvedValue(null);
    (customerEligibility.evaluateForBooking as jest.Mock).mockResolvedValue(clearedCustomer);
    (verificationService.getEligibilityStatus as jest.Mock).mockResolvedValue(baseVerification);
    (rentalEligibility.check as jest.Mock).mockResolvedValue(baseRentalResult);
    (rentalHealth.isRentalBlocked as jest.Mock).mockResolvedValue({
      blocked: false,
      healthGateStatus: 'OK',
      reasons: [],
    });
  });

  it('maps database errors to TECHNICAL_ERROR without approving', async () => {
    (prisma.vehicle.findFirst as jest.Mock).mockRejectedValue(new Error('database connection lost'));

    const result = await gatekeeper.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
      endDate,
    });

    expect(result.status).toBe('TECHNICAL_ERROR');
    expect(result.allowed).toBe(false);
    expect(result.blockingReasons.some((r) => r.code === 'TECHNICAL_ERROR')).toBe(true);
    expect(result.correlation.evaluationId).toMatch(/^elig-eval:/);
  });

  it('maps missing rental rules resolver failures to TECHNICAL_ERROR', async () => {
    (rentalEligibility.check as jest.Mock).mockRejectedValue(new Error('effective rules resolver failed'));

    const result = await gatekeeper.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
      endDate,
    });

    expect(result.status).toBe('TECHNICAL_ERROR');
    expect(result.reasonCodes).toContain('TECHNICAL_ERROR');
    expect(result.blockingReasons[0]?.domain).toBe('rental_rules');
  });

  it('maps verification service failures to TECHNICAL_ERROR (not NOT_ELIGIBLE)', async () => {
    (verificationService.getEligibilityStatus as jest.Mock).mockRejectedValue(
      new Error('document service timeout'),
    );

    const result = await gatekeeper.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'CONFIRM',
      startDate,
      endDate,
    });

    expect(result.status).toBe('TECHNICAL_ERROR');
    expect(result.status).not.toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.some((r) => r.domain === 'verification')).toBe(true);
  });

  it('maps vehicle readiness failures to TECHNICAL_ERROR when readiness is required', async () => {
    (rentalHealth.isRentalBlocked as jest.Mock).mockRejectedValue(new Error('health timeout'));

    const result = await gatekeeper.evaluate({
      organizationId: orgId,
      customerId,
      vehicleId,
      stage: 'PICKUP',
      startDate,
      endDate,
      includeVehicleReadiness: true,
    });

    expect(result.status).toBe('TECHNICAL_ERROR');
    expect(result.allowed).toBe(false);
  });

  it('allows preview to surface technical errors without throwing', async () => {
    (rentalEligibility.check as jest.Mock).mockRejectedValue(new Error('timeout'));

    const preview = await enforcement.previewEvaluation({
      organizationId: orgId,
      customerId,
      vehicleId,
      startDate,
      endDate,
      targetStatus: 'CONFIRMED',
    });

    expect(preview.status).toBe('TECHNICAL_ERROR');
    expect(auditLogger.logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'preview',
        outcome: 'preview_only',
        correlation: expect.objectContaining({
          evaluationId: expect.stringMatching(/^elig-eval:/),
          commandId: expect.stringMatching(/^elig-cmd:/),
          transitionId: expect.stringMatching(/^elig-xn:/),
          auditEventId: expect.stringMatching(/^elig-audit:/),
        }),
      }),
    );
  });

  it('fails closed on enforce for CONFIRMED technical errors (503)', async () => {
    (rentalEligibility.check as jest.Mock).mockRejectedValue(new Error('timeout'));

    await expect(
      enforcement.assertAllowed({
        organizationId: orgId,
        customerId,
        vehicleId,
        startDate,
        endDate,
        targetStatus: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed on enforce for ACTIVE pickup technical errors (503)', async () => {
    (rentalHealth.isRentalBlocked as jest.Mock).mockRejectedValue(new Error('timeout'));

    await expect(
      enforcement.assertAllowed({
        organizationId: orgId,
        customerId,
        vehicleId,
        startDate,
        endDate,
        targetStatus: 'ACTIVE',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('distinguishes business NOT_ELIGIBLE from technical errors on enforce', async () => {
    (rentalEligibility.check as jest.Mock).mockResolvedValue({
      ...baseRentalResult,
      status: 'NOT_ELIGIBLE',
      blockingReasons: ['Minimum age not met'],
    });

    await expect(
      enforcement.assertAllowed({
        organizationId: orgId,
        customerId,
        vehicleId,
        startDate,
        endDate,
        targetStatus: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('supports retry after technical error once resolver recovers', async () => {
    (rentalEligibility.check as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(baseRentalResult);

    await expect(
      enforcement.assertAllowed({
        organizationId: orgId,
        customerId,
        vehicleId,
        startDate,
        endDate,
        targetStatus: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const retry = await enforcement.assertAllowed({
      organizationId: orgId,
      customerId,
      vehicleId,
      startDate,
      endDate,
      targetStatus: 'CONFIRMED',
    });

    expect(retry?.status).toBe('ELIGIBLE');
  });

  it('reuses parent command id for repeated confirm commands', async () => {
    const parentCommandId = 'elig-cmd:confirm:repeat-test';
    const evaluateSpy = jest.spyOn(gatekeeper, 'evaluate');

    await enforcement.assertAllowed(
      {
        organizationId: orgId,
        customerId,
        vehicleId,
        startDate,
        endDate,
        targetStatus: 'CONFIRMED',
        bookingId: 'booking-1',
      },
      { command: 'confirm', parentCommandId },
    );

    expect(evaluateSpy.mock.calls[0][0].correlation?.commandId).toBe(parentCommandId);
    evaluateSpy.mockRestore();
  });
});
