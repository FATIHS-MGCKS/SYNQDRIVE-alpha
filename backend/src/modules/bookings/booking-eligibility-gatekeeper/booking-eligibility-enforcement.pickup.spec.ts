import { ConflictException } from '@nestjs/common';
import { BookingEligibilityEnforcementService } from './booking-eligibility-enforcement.service';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingEligibilityAuditLogger } from './booking-eligibility-audit.logger';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-transition.policy';
import { testGateResult } from './booking-eligibility-test.fixtures';

describe('BookingEligibilityEnforcementService pickup transitions', () => {
  const prisma = {
    bookingAllowedDriver: { count: jest.fn() },
    bookingDeposit: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const gatekeeper = {
    evaluate: jest.fn(),
  } as unknown as BookingEligibilityGatekeeperService;

  const auditLogger = {
    logEvaluation: jest.fn(),
  } as unknown as BookingEligibilityAuditLogger;

  const service = new BookingEligibilityEnforcementService(prisma, gatekeeper, auditLogger);

  const eligiblePickupGate = testGateResult({
    stage: 'PICKUP',
    bookingId: 'booking-1',
    sourceRuleIds: ['org:org-1'],
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-1' },
      vehicleReadiness: { evaluated: true, skipped: false, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      startDate: new Date('2026-07-01T10:00:00.000Z'),
      endDate: new Date('2026-07-05T10:00:00.000Z'),
      status: 'CONFIRMED',
      notes: null,
      paymentIntent: 'pay_on_pickup',
      extrasJson: null,
    });
    (prisma.bookingAllowedDriver.count as jest.Mock).mockResolvedValue(1);
    (prisma.bookingDeposit.findFirst as jest.Mock).mockResolvedValue(null);
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue(eligiblePickupGate);
  });

  it('enforces pickup transition with PICKUP stage and vehicle readiness', async () => {
    await service.assertAllowedForPickup('org-1', 'booking-1', { userId: 'user-1' });

    expect(gatekeeper.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'PICKUP',
        requestedStatus: 'ACTIVE',
        includeVehicleReadiness: true,
        additionalDriverCount: 1,
      }),
    );
  });

  it('blocks pickup when gatekeeper returns not eligible', async () => {
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue({
      ...eligiblePickupGate,
      status: 'NOT_ELIGIBLE',
      allowed: false,
      blockingReasons: [
        {
          code: 'LICENSE_EXPIRED',
          domain: 'verification',
          message: 'License expired',
        },
      ],
    });

    await expect(
      service.assertAllowedForPickup('org-1', 'booking-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.assertAllowedForPickup('org-1', 'booking-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
      }),
    });
  });

  it('requires enforcement when confirmed booking vehicle changes', () => {
    const shouldEnforce = service.shouldEnforceForUpdate({
      existing: {
        status: 'CONFIRMED',
        customerId: 'cust-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-07-01T10:00:00.000Z'),
        endDate: new Date('2026-07-05T10:00:00.000Z'),
      },
      next: {
        organizationId: 'org-1',
        customerId: 'cust-1',
        vehicleId: 'veh-2',
        startDate: new Date('2026-07-01T10:00:00.000Z'),
        endDate: new Date('2026-07-05T10:00:00.000Z'),
        targetStatus: 'CONFIRMED',
        bookingId: 'booking-1',
      },
      customerIdChanged: false,
      vehicleIdChanged: true,
      datesChanged: false,
      paymentIntentChanged: false,
      extrasChanged: false,
      statusChanged: false,
    });

    expect(shouldEnforce).toBe(true);
  });
});
