import { createHash } from 'crypto';
import {
  buildBookingEligibilityDataVersion,
  buildBookingEligibilityRuleRevision,
} from './booking-eligibility-approval.util';
import { testGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';

describe('booking-eligibility-approval.util', () => {
  it('builds stable booking data version hashes', () => {
    const context = {
      customerId: 'c1',
      vehicleId: 'v1',
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      endDate: new Date('2026-08-03T10:00:00.000Z'),
      paymentIntent: 'pay_on_pickup',
      extrasJson: null,
      additionalDriverCount: 1,
    };
    const first = buildBookingEligibilityDataVersion(context);
    const second = buildBookingEligibilityDataVersion(context);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('changes data version when booking fields change', () => {
    const base = {
      customerId: 'c1',
      vehicleId: 'v1',
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      endDate: new Date('2026-08-03T10:00:00.000Z'),
    };
    const first = buildBookingEligibilityDataVersion(base);
    const second = buildBookingEligibilityDataVersion({
      ...base,
      vehicleId: 'v2',
    });
    expect(first).not.toBe(second);
  });

  it('builds rule revision from gatekeeper engine version and source rules', () => {
    const gate = testGateResult({
      status: 'MANUAL_APPROVAL_REQUIRED',
      sourceRuleIds: ['rule-b', 'rule-a'],
    });
    const revision = buildBookingEligibilityRuleRevision(gate);
    const expected = createHash('sha256')
      .update(
        JSON.stringify({
          engineVersion: gate.engineVersion,
          sourceRuleIds: ['rule-a', 'rule-b'],
        }),
      )
      .digest('hex');
    expect(revision).toBe(expected);
  });
});
