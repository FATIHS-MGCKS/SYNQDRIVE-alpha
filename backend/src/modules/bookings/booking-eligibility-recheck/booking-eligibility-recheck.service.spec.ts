import type { BookingStatus } from '@prisma/client';
import { BookingEligibilityRecheckService } from './booking-eligibility-recheck.service';
import { BookingEligibilityDecisionService } from '../booking-eligibility-decision/booking-eligibility-decision.service';
import { BookingEligibilityEnforcementService } from '../booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityApprovalService } from '../booking-eligibility-approval/booking-eligibility-approval.service';
import {
  BOOKING_ELIGIBILITY_RECHECK_TRIGGER,
  RETROACTIVITY_RECHECK_OUTCOME,
  RETROACTIVITY_SNAPSHOT_POLICY,
} from './booking-eligibility-retroactivity.constants';

describe('BookingEligibilityRecheckService', () => {
  const organizationId = 'org-1';
  const bookingBase = {
    organizationId,
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-05T10:00:00.000Z'),
    paymentIntent: 'pay_on_pickup',
    extrasJson: null,
    vehicle: { rentalCategoryId: 'cat-1' },
  };

  let prisma: {
    booking: { findMany: jest.Mock; findFirst: jest.Mock };
    vehicle: { findUnique: jest.Mock };
  };
  let decisions: {
    getLatestConfirmRulesHash: jest.Mock;
    resolveCurrentRulesHashForBooking: jest.Mock;
    appendRecheckDecision: jest.Mock;
    findDueRecheckDecisions: jest.Mock;
  };
  let enforcement: { previewEvaluation: jest.Mock };
  let approvals: { revokeActiveApprovals: jest.Mock };
  let service: BookingEligibilityRecheckService;

  beforeEach(() => {
    prisma = {
      booking: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ rentalCategoryId: 'cat-1' }),
      },
    };
    decisions = {
      getLatestConfirmRulesHash: jest.fn().mockResolvedValue('hash-old'),
      resolveCurrentRulesHashForBooking: jest.fn().mockResolvedValue('hash-new'),
      appendRecheckDecision: jest.fn().mockResolvedValue({ id: 'decision-1' }),
      findDueRecheckDecisions: jest.fn().mockResolvedValue([]),
    };
    enforcement = {
      previewEvaluation: jest.fn().mockResolvedValue({
        status: 'ELIGIBLE',
        allowed: true,
        reasonCodes: [],
      }),
    };
    approvals = {
      revokeActiveApprovals: jest.fn().mockResolvedValue(1),
    };
    service = new BookingEligibilityRecheckService(
      prisma as never,
      decisions as unknown as BookingEligibilityDecisionService,
      enforcement as unknown as BookingEligibilityEnforcementService,
      approvals as unknown as BookingEligibilityApprovalService,
    );
  });

  function mockBooking(status: BookingStatus, notes: string | null = null) {
    return {
      id: `booking-${status.toLowerCase()}`,
      status,
      notes,
      ...bookingBase,
    };
  }

  it('grandfathers confirmed bookings on rule publish without changing booking status', async () => {
    prisma.booking.findMany.mockResolvedValue([mockBooking('CONFIRMED')]);

    const results = await service.processRulePublishRechecks({
      organizationId,
      publishedRevisionId: 'rev-2',
      affectedBookingIds: ['booking-confirmed'],
      criticalRuleChange: true,
      correlationId: 'publish:rev-2:1',
    });

    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe(RETROACTIVITY_RECHECK_OUTCOME.REVIEW_REQUIRED);
    expect(results[0].policy.snapshotPolicy).toBe(
      RETROACTIVITY_SNAPSHOT_POLICY.FROZEN_GRANDFATHER,
    );
    expect(approvals.revokeActiveApprovals).toHaveBeenCalled();
    expect(enforcement.previewEvaluation).not.toHaveBeenCalled();
    expect(decisions.appendRecheckDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'RULE_PUBLISH_RECHECK',
        priorRulesHash: 'hash-old',
        currentRulesHash: 'hash-new',
      }),
    );
  });

  it('reevaluates pending bookings on mutation recheck', async () => {
    prisma.booking.findFirst.mockResolvedValue(mockBooking('PENDING'));

    const result = await service.processMutationRecheck({
      organizationId,
      bookingId: 'booking-pending',
      trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.VEHICLE_CHANGE,
      invalidationFacts: ['vehicle', 'rule_revision'],
    });

    expect(result?.policy.enforceGatekeeper).toBe(true);
    expect(enforcement.previewEvaluation).toHaveBeenCalled();
    expect(decisions.appendRecheckDecision).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MUTATION_RECHECK' }),
    );
  });

  it('skips terminal bookings during rule publish recheck selection', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    const results = await service.processRulePublishRechecks({
      organizationId,
      publishedRevisionId: 'rev-2',
      affectedBookingIds: ['completed-booking'],
      criticalRuleChange: false,
      correlationId: 'publish:rev-2:1',
    });

    expect(results).toEqual([]);
    expect(decisions.appendRecheckDecision).not.toHaveBeenCalled();
  });

  it('runs pickup precheck with gatekeeper enforcement for confirmed bookings', async () => {
    prisma.booking.findFirst.mockResolvedValue(mockBooking('CONFIRMED'));

    const result = await service.processPickupPrecheck(organizationId, 'booking-confirmed', 'user-1');

    expect(result?.policy.snapshotPolicy).toBe(RETROACTIVITY_SNAPSHOT_POLICY.PICKUP_RECHECK);
    expect(result?.policy.enforceGatekeeper).toBe(true);
    expect(enforcement.previewEvaluation).toHaveBeenCalled();
    expect(decisions.appendRecheckDecision).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'SCHEDULED_RECHECK' }),
    );
  });

  it('never auto-cancels bookings during recheck processing', async () => {
    prisma.booking.findFirst.mockResolvedValue(mockBooking('CONFIRMED'));

    const result = await service.processMutationRecheck({
      organizationId,
      bookingId: 'booking-confirmed',
      trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PERIOD_CHANGE,
      invalidationFacts: ['period', 'license_validity', 'rule_revision'],
    });

    expect(result?.policy.allowAutoCancel).toBe(false);
    expect(prisma.booking.findFirst).toHaveBeenCalled();
    expect(prisma.booking.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });
});
