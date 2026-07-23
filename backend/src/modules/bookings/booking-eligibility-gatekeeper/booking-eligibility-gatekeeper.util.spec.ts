import { assembleCustomerEligibilityResult, createEligibilityBuckets } from '@modules/customers/types/customer-eligibility.types';
import { BOOKING_ELIGIBILITY_REASON_CODE } from './booking-eligibility-gatekeeper.constants';
import {
  collectSourceRuleIds,
  dedupeGateReasons,
  mapCustomerEligibilityToGateReasons,
  mapRentalEligibilityToGateReasons,
  mapVerificationToGateReasons,
  resolveAggregateGateStatus,
} from './booking-eligibility-gatekeeper.util';
import type { BookingRentalEligibilityResult } from '../booking-rental-eligibility.types';
import { BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE } from '../booking-rental-eligibility.types';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';

describe('booking-eligibility-gatekeeper.util', () => {
  describe('resolveAggregateGateStatus', () => {
    it('returns worst status by priority', () => {
      expect(
        resolveAggregateGateStatus(['ELIGIBLE', 'NOT_ELIGIBLE', 'MISSING_INFORMATION']),
      ).toBe('NOT_ELIGIBLE');
      expect(
        resolveAggregateGateStatus(['ELIGIBLE', 'MANUAL_APPROVAL_REQUIRED']),
      ).toBe('MANUAL_APPROVAL_REQUIRED');
      expect(
        resolveAggregateGateStatus(['ELIGIBLE', 'TEMPORARILY_UNAVAILABLE']),
      ).toBe('TEMPORARILY_UNAVAILABLE');
      expect(
        resolveAggregateGateStatus(['NOT_ELIGIBLE', 'TECHNICAL_ERROR']),
      ).toBe('TECHNICAL_ERROR');
      expect(
        resolveAggregateGateStatus(['MISSING_INFORMATION', 'MANUAL_APPROVAL_REQUIRED']),
      ).toBe('MISSING_INFORMATION');
    });

    it('returns ELIGIBLE for empty input', () => {
      expect(resolveAggregateGateStatus([])).toBe('ELIGIBLE');
    });
  });

  describe('mapCustomerEligibilityToGateReasons', () => {
    it('maps create-stage blockers for blocked customer', () => {
      const buckets = createEligibilityBuckets();
      buckets.globalBlockingReasons.push('Customer is blocked');
      const result = assembleCustomerEligibilityResult('cust-1', buckets, {
        canCreatePendingBooking: false,
        canConfirmBooking: false,
        canStartRental: false,
      });

      const mapped = mapCustomerEligibilityToGateReasons(result, 'CREATE');
      expect(mapped.status).toBe('NOT_ELIGIBLE');
      expect(mapped.blockingReasons[0]?.code).toBe(
        BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED,
      );
    });
  });

  describe('mapVerificationToGateReasons', () => {
    it('maps confirm-stage document blockers', () => {
      const mapped = mapVerificationToGateReasons(
        {
          customerId: 'cust-1',
          idDocument: 'missing',
          drivingLicense: 'verified',
          proofOfAddress: 'not_required',
          canConfirmBooking: false,
          canStartPickup: false,
          confirmBlockingReasons: ['ID document missing'],
          pickupBlockingReasons: [],
          blockingReasons: ['ID document missing'],
          warnings: [],
        },
        'CONFIRM',
      );

      expect(mapped.blockingReasons.some((r) => r.code === 'ID_DOCUMENT_MISSING')).toBe(
        true,
      );
      expect(mapped.status).toBe('NOT_ELIGIBLE');
    });

    it('treats pickup_required documents as overridable warnings on create', () => {
      const mapped = mapVerificationToGateReasons(
        {
          customerId: 'cust-1',
          idDocument: 'pickup_required',
          drivingLicense: 'pickup_required',
          proofOfAddress: 'not_required',
          canConfirmBooking: true,
          canStartPickup: true,
          confirmBlockingReasons: [],
          pickupBlockingReasons: [],
          blockingReasons: [],
          warnings: [],
        },
        'CREATE',
      );

      expect(mapped.warnings.some((r) => r.overridable === true)).toBe(true);
      expect(mapped.status).toBe('ELIGIBLE');
    });
  });

  describe('mapRentalEligibilityToGateReasons', () => {
    const baseRentalResult: BookingRentalEligibilityResult = {
      status: 'NOT_ELIGIBLE',
      blockingReasons: [
        'Customer is 19 years old but this vehicle requires minimum age 21.',
      ],
      warningReasons: [],
      missingFields: [],
      manualApprovalReasons: [],
      effectiveRules: {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        rentalCategoryId: 'cat-1',
        rentalCategoryName: 'Premium',
        rentalCategoryType: null,
        rulesActive: true,
        activation: createActiveRentalRulesActivationSnapshot({
          categoryAssigned: true,
          categoryActive: true,
        }),
        minimumAgeYears: { value: 21, source: 'CATEGORY', sourceName: 'Premium' },
        minimumLicenseHoldingMonths: { value: 12, source: 'CATEGORY', sourceName: 'Premium' },
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
        minimumLicenseHoldingYears: { value: 1, source: 'CATEGORY', sourceName: 'Premium' },
        minimumLicenseHoldingRemainderMonths: { value: 0, source: 'CATEGORY', sourceName: 'Premium' },
      },
      decisionSource: BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE,
      facts: [],
      customerId: 'cust-1',
      vehicleId: 'veh-1',
    };

    it('maps age blockers to machine-readable codes', () => {
      const mapped = mapRentalEligibilityToGateReasons(baseRentalResult);
      expect(mapped.status).toBe('NOT_ELIGIBLE');
      expect(mapped.blockingReasons[0]?.code).toBe('MINIMUM_AGE_NOT_MET');
    });

    it('maps missing fields to dedicated codes', () => {
      const mapped = mapRentalEligibilityToGateReasons({
        ...baseRentalResult,
        status: 'MISSING_INFORMATION',
        blockingReasons: [],
        missingFields: ['customer.dateOfBirth', 'customer.licenseIssuedAt'],
      });
      expect(mapped.missingFields).toHaveLength(2);
      expect(mapped.blockingReasons.map((r) => r.code)).toEqual(
        expect.arrayContaining([
          'MISSING_CUSTOMER_DATE_OF_BIRTH',
          'MISSING_CUSTOMER_LICENSE_ISSUED_AT',
        ]),
      );
    });
  });

  describe('collectSourceRuleIds', () => {
    it('collects org, category, and vehicle identifiers', () => {
      const ids = collectSourceRuleIds({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        rentalCategoryId: 'cat-1',
      } as BookingRentalEligibilityResult['effectiveRules']);
      expect(ids).toEqual(['org:org-1', 'category:cat-1', 'vehicle:veh-1']);
    });
  });

  describe('dedupeGateReasons', () => {
    it('removes duplicate code+message pairs', () => {
      const deduped = dedupeGateReasons([
        {
          code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED,
          domain: 'customer',
          message: 'Customer is blocked',
        },
        {
          code: BOOKING_ELIGIBILITY_REASON_CODE.CUSTOMER_BLOCKED,
          domain: 'customer',
          message: 'Customer is blocked',
        },
      ]);
      expect(deduped).toHaveLength(1);
    });
  });
});
