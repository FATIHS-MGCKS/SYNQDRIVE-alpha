import {
  BOOKING_ELIGIBILITY_GATE_DOMAIN,
  BOOKING_ELIGIBILITY_REASON_CODE,
} from './booking-eligibility-gatekeeper.constants';
import {
  BOOKING_ELIGIBILITY_STATUS_PRIORITY,
  resolveAggregateGateStatus,
  resolveFinalBookingEligibilityDecision,
  resolveVerificationDomainStatus,
  sortGateReasonsByPriority,
} from './booking-eligibility-decision.policy';

describe('booking-eligibility-decision.policy', () => {
  it('prioritizes hard blocks over missing information and manual approval', () => {
    expect(
      resolveAggregateGateStatus([
        'MANUAL_APPROVAL_REQUIRED',
        'NOT_ELIGIBLE',
        'MISSING_INFORMATION',
      ]),
    ).toBe('NOT_ELIGIBLE');
    expect(
      resolveAggregateGateStatus(['MANUAL_APPROVAL_REQUIRED', 'MISSING_INFORMATION']),
    ).toBe('MISSING_INFORMATION');
    expect(BOOKING_ELIGIBILITY_STATUS_PRIORITY.NOT_ELIGIBLE).toBeLessThan(
      BOOKING_ELIGIBILITY_STATUS_PRIORITY.MISSING_INFORMATION,
    );
  });

  it('sorts reason codes by stable presentation priority', () => {
    const sorted = sortGateReasonsByPriority([
      {
        code: BOOKING_ELIGIBILITY_REASON_CODE.DEPOSIT_REQUIRED,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
        message: 'Deposit required',
      },
      {
        code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
        message: 'Customer blocked',
      },
      {
        code: BOOKING_ELIGIBILITY_REASON_CODE.MINIMUM_AGE_NOT_MET,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
        message: 'Too young',
      },
    ]);

    expect(sorted.map((reason) => reason.code)).toEqual([
      BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED,
      BOOKING_ELIGIBILITY_REASON_CODE.MINIMUM_AGE_NOT_MET,
      BOOKING_ELIGIBILITY_REASON_CODE.DEPOSIT_REQUIRED,
    ]);
  });

  it('resolves final decision from domain contributions', () => {
    const decision = resolveFinalBookingEligibilityDecision([
      {
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
        status: 'ELIGIBLE',
        blockingReasons: [],
        warnings: [],
      },
      {
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        status: 'MANUAL_APPROVAL_REQUIRED',
        blockingReasons: [],
        warnings: [{
          code: BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PENDING,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
          message: 'Driving license status: pending',
        }],
      },
      {
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
        status: 'ELIGIBLE',
        blockingReasons: [],
        warnings: [],
      },
    ]);

    expect(decision.status).toBe('MANUAL_APPROVAL_REQUIRED');
    expect(decision.reasonCodes).toContain(
      BOOKING_ELIGIBILITY_REASON_CODE.LICENSE_PENDING,
    );
  });

  it('maps verification pending on confirm to manual approval', () => {
    const status = resolveVerificationDomainStatus(
      {
        customerId: 'cust-1',
        idDocument: 'pending',
        drivingLicense: 'verified',
        proofOfAddress: 'not_required',
        canConfirmBooking: false,
        canStartPickup: true,
        confirmBlockingReasons: [],
        pickupBlockingReasons: [],
        blockingReasons: [],
        warnings: [],
      },
      'CONFIRM',
      { blockingReasons: [], warnings: [] },
    );

    expect(status).toBe('MANUAL_APPROVAL_REQUIRED');
  });

  it('maps verification missing on confirm to missing information', () => {
    const status = resolveVerificationDomainStatus(
      {
        customerId: 'cust-1',
        idDocument: 'missing',
        drivingLicense: 'verified',
        proofOfAddress: 'not_required',
        canConfirmBooking: false,
        canStartPickup: true,
        confirmBlockingReasons: [],
        pickupBlockingReasons: [],
        blockingReasons: [],
        warnings: [],
      },
      'CONFIRM',
      { blockingReasons: [], warnings: [] },
    );

    expect(status).toBe('MISSING_INFORMATION');
  });
});
