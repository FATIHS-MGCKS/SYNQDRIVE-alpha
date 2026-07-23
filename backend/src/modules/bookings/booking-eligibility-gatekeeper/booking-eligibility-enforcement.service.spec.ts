import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { BookingEligibilityEnforcementService } from './booking-eligibility-enforcement.service';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper.service';
import { BookingEligibilityAuditLogger } from './booking-eligibility-audit.logger';
import { PrismaService } from '@shared/database/prisma.service';
import { testGateResult } from './booking-eligibility-test.fixtures';

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

  const auditLogger = {
    logEvaluation: jest.fn(),
  } as unknown as BookingEligibilityAuditLogger;

  const service = new BookingEligibilityEnforcementService(prisma, gatekeeper, auditLogger);

  const eligibleResult = testGateResult({
    status: 'ELIGIBLE',
    stage: 'CONFIRM',
    allowed: true,
  });

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
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue(
      testGateResult({
        status: 'NOT_ELIGIBLE',
        allowed: false,
        blockingReasons: [
          {
            code: 'MINIMUM_AGE_NOT_MET',
            domain: 'rental_rules',
            message: 'Too young',
          },
        ],
      }),
    );

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

  it('returns technical preview without throwing', async () => {
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue(
      testGateResult({
        status: 'TECHNICAL_ERROR',
        allowed: false,
      }),
    );

    const preview = await service.previewEvaluation({
      organizationId: 'org-1',
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      startDate: new Date('2026-07-01T10:00:00.000Z'),
      endDate: new Date('2026-07-05T10:00:00.000Z'),
      targetStatus: 'CONFIRMED',
    });

    expect(preview.status).toBe('TECHNICAL_ERROR');
    expect(auditLogger.logEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'preview', outcome: 'preview_only' }),
    );
  });

  it('fails closed on technical error for confirmed enforce', async () => {
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue(
      testGateResult({
        status: 'TECHNICAL_ERROR',
        allowed: false,
      }),
    );

    await expect(
      service.assertAllowed({
        organizationId: 'org-1',
        customerId: 'cust-1',
        vehicleId: 'veh-1',
        startDate: new Date('2026-07-01T10:00:00.000Z'),
        endDate: new Date('2026-07-05T10:00:00.000Z'),
        targetStatus: 'CONFIRMED',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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
