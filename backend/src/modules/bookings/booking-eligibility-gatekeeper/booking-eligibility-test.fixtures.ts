import { buildBookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper.types';

export function testEligibilityCorrelation() {
  return buildBookingEligibilityCorrelationIds({
    organizationId: 'org-1',
    bookingId: 'booking-1',
    command: 'preview',
  });
}

export function testGateResult(
  overrides: Partial<BookingEligibilityGateResult> = {},
): BookingEligibilityGateResult {
  return {
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
    correlation: testEligibilityCorrelation(),
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-1' },
      vehicleReadiness: { evaluated: false, skipped: true, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
    ...overrides,
  };
}
