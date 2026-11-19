import { BookingEligibilityGatekeeperService } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { createP6Pr5cCustomerEligibilityStub } from './p6-pr5c-customer-eligibility.stub';
import { buildP6Pr5cEffectiveRentalRules } from './p6-pr5c-rental-rules.stub';
import { P6_PR5C_RENTAL_HEALTH_MOCK } from './p6-pr5c-bookings-http-nest.harness';

describe('P6-PR5C gatekeeper harness boundary', () => {
  it('assembles ELIGIBLE from documented stubs (no evaluate spy)', async () => {
    const prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'v1' }) },
    };
    const verification = {
      getEligibilityStatus: jest.fn().mockResolvedValue({
        customerId: 'c1',
        bookingId: 'b1',
        idDocument: 'verified',
        drivingLicense: 'verified',
        proofOfAddress: 'not_required',
        canConfirmBooking: true,
        canStartPickup: true,
        confirmBlockingReasons: [],
        pickupBlockingReasons: [],
        blockingReasons: [],
        warnings: [],
      }),
    };
    const rental = {
      check: jest.fn().mockResolvedValue({
        status: 'ELIGIBLE',
        blockingReasons: [],
        warningReasons: [],
        missingFields: [],
        manualApprovalReasons: [],
        effectiveRules: buildP6Pr5cEffectiveRentalRules('o1', 'v1'),
        decisionSource: 'RENTAL_RULES',
        facts: {},
        customerId: 'c1',
        vehicleId: 'v1',
      }),
    };
    const gatekeeper = new BookingEligibilityGatekeeperService(
      prisma as never,
      createP6Pr5cCustomerEligibilityStub() as never,
      verification as never,
      rental as never,
      P6_PR5C_RENTAL_HEALTH_MOCK as never,
    );

    const result = await gatekeeper.evaluate({
      organizationId: 'o1',
      customerId: 'c1',
      vehicleId: 'v1',
      stage: 'CONFIRM',
      startDate: new Date('2026-07-01T10:00:00.000Z'),
      endDate: new Date('2026-07-05T10:00:00.000Z'),
      bookingId: 'b1',
      requestedStatus: 'CONFIRMED',
      includeVehicleReadiness: true,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.allowed).toBe(true);
  });
});