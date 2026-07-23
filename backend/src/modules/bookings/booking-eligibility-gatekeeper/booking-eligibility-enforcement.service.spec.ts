import { ConflictException } from '@nestjs/common';
import { BookingEligibilityEnforcementService } from './booking-eligibility-enforcement.service';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper.types';

describe('BookingEligibilityEnforcementService', () => {
  const prisma = {
    bookingAllowedDriver: { count: jest.fn() },
    bookingDeposit: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const gatekeeper = {
    evaluate: jest.fn(),
  } as unknown as BookingEligibilityGatekeeperService;

  const service = new BookingEligibilityEnforcementService(prisma, gatekeeper);

  const eligibleResult: BookingEligibilityGateResult = {
    status: 'ELIGIBLE',
    stage: 'CONFIRM',
    allowed: true,
    reasonCodes: [],
    blockingReasons: [],
    warnings: [],
    missingFields: [],
    sourceRuleIds: [],
    evaluatedAt: new Date().toISOString(),
    recheckRequired: false,
    engineVersion: '1.0.0',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-1' },
      vehicleReadiness: { evaluated: false, skipped: true, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.bookingAllowedDriver.count as jest.Mock).mockResolvedValue(0);
    (prisma.bookingDeposit.findFirst as jest.Mock).mockResolvedValue(null);
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue(eligibleResult);
  });

  it('skips wizard draft pending bookings', async () => {
    const result = await service.assertAllowed({
      organizationId: 'org-1',
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      startDate: new Date('2026-07-01T10:00:00.000Z'),
      endDate: new Date('2026-07-05T10:00:00.000Z'),
      targetStatus: 'PENDING',
      notes: '[synq:wizard-draft]',
    });

    expect(result).toBeNull();
    expect(gatekeeper.evaluate).not.toHaveBeenCalled();
  });

  it('enforces confirm policy for confirmed bookings', async () => {
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue({
      ...eligibleResult,
      status: 'NOT_ELIGIBLE',
      allowed: false,
      blockingReasons: [
        {
          code: 'MINIMUM_AGE_NOT_MET',
          domain: 'rental_rules',
          message: 'Too young',
        },
      ],
    });

    await expect(
      service.assertAllowed({
        organizationId: 'org-1',
        customerId: 'cust-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-07-01T10:00:00.000Z'),
        endDate: new Date('2026-07-05T10:00:00.000Z'),
        targetStatus: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
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
