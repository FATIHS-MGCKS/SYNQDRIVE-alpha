import {
  FINE_HEARING_FORM_COMPLETE,
  FINE_PAYMENT_NOTICE_COMPLETE,
  FINE_PAYMENT_NOTICE_INVALID_DUE_DATE,
  FINE_PAYMENT_NOTICE_MISSING_AUTHORITY,
  FINE_PAYMENT_NOTICE_NO_OFFENSE_TIME,
  FINE_PAYMENT_NOTICE_PLATE_MISMATCH,
} from './__fixtures__/document-fine-fixtures';
import {
  assessFineApplyGate,
  collectFinePlausibilityChecks,
  FINE_NOTICE_TYPES,
  hasOffenseDateTimeForAttribution,
  noticeTypeAllowsNoAmount,
  readAmountCents,
  readReferenceNumber,
  resolveFineNoticeType,
} from './document-fine-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('document-fine-extraction.rules', () => {
  describe('notice type resolution', () => {
    it('distinguishes payment notice and Anhörungsbogen', () => {
      expect(
        resolveFineNoticeType({
          fields: FINE_PAYMENT_NOTICE_COMPLETE,
        }),
      ).toBe(FINE_NOTICE_TYPES.PAYMENT_NOTICE);
      expect(
        resolveFineNoticeType({
          fields: FINE_HEARING_FORM_COMPLETE,
        }),
      ).toBe(FINE_NOTICE_TYPES.HEARING_FORM);
      expect(
        resolveFineNoticeType({
          documentSubtype: 'ANHOERUNGSBOGEN',
          fields: {},
        }),
      ).toBe(FINE_NOTICE_TYPES.HEARING_FORM);
    });

    it('allows hearing forms without amount', () => {
      expect(noticeTypeAllowsNoAmount(FINE_NOTICE_TYPES.HEARING_FORM)).toBe(true);
      expect(noticeTypeAllowsNoAmount(FINE_NOTICE_TYPES.PAYMENT_NOTICE)).toBe(false);
    });
  });

  describe('field readers', () => {
    it('reads reference number and amount aliases without defaults', () => {
      expect(readReferenceNumber({ reportNumber: 'AZ-1' })).toBe('AZ-1');
      expect(readReferenceNumber({ referenceNumber: 'AZ-2' })).toBe('AZ-2');
      expect(readAmountCents({ totalCents: 1750 })).toBe(1750);
      expect(readAmountCents({ amountCents: 990 })).toBe(990);
      expect(readAmountCents({})).toBeNull();
    });

    it('requires offense date-time with time for attribution', () => {
      expect(hasOffenseDateTimeForAttribution(FINE_PAYMENT_NOTICE_COMPLETE)).toBe(true);
      expect(hasOffenseDateTimeForAttribution(FINE_PAYMENT_NOTICE_NO_OFFENSE_TIME)).toBe(false);
      expect(
        hasOffenseDateTimeForAttribution({
          eventDate: '2025-10-24',
          eventTime: '09:15',
        }),
      ).toBe(true);
    });
  });

  describe('plausibility checks', () => {
    it('blocks plate mismatch for FINE', () => {
      const checks = collectFinePlausibilityChecks(FINE_PAYMENT_NOTICE_PLATE_MISMATCH, {
        vehicleLicensePlate: 'KS-FH-660E',
      });
      expect(checks.some((check) => check.code === 'PLATE_MISMATCH' && check.status === 'BLOCKER')).toBe(
        true,
      );
    });

    it('blocks missing authority and reference', () => {
      const checks = collectFinePlausibilityChecks(FINE_PAYMENT_NOTICE_MISSING_AUTHORITY);
      expect(checks.map((check) => check.code)).toEqual(
        expect.arrayContaining(['MISSING_ISSUING_AUTHORITY']),
      );
    });

    it('blocks due date before offense date', () => {
      const checks = collectFinePlausibilityChecks(FINE_PAYMENT_NOTICE_INVALID_DUE_DATE);
      expect(checks.some((check) => check.code === 'DUE_DATE_BEFORE_OFFENSE')).toBe(true);
    });

    it('blocks missing offense date-time for attribution', () => {
      const checks = collectFinePlausibilityChecks(FINE_PAYMENT_NOTICE_NO_OFFENSE_TIME);
      expect(checks.some((check) => check.code === 'MISSING_OFFENSE_DATETIME')).toBe(true);
    });

    it('warns for hearing form instead of treating as payment notice', () => {
      const checks = collectFinePlausibilityChecks(FINE_HEARING_FORM_COMPLETE);
      expect(checks.some((check) => check.code === 'HEARING_FORM_NO_FINE_APPLY')).toBe(true);
      expect(checks.some((check) => check.code === 'FINE_AMOUNT_NON_POSITIVE')).toBe(false);
    });
  });

  describe('apply gate', () => {
    it('allows complete payment notice apply', () => {
      const gate = assessFineApplyGate({ fields: FINE_PAYMENT_NOTICE_COMPLETE });
      expect(gate.canApply).toBe(true);
      expect(gate.noticeType).toBe(FINE_NOTICE_TYPES.PAYMENT_NOTICE);
    });

    it('blocks Anhörungsbogen apply as fine', () => {
      const gate = assessFineApplyGate({ fields: FINE_HEARING_FORM_COMPLETE });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'HEARING_FORM_APPLY_BLOCKED')).toBe(
        true,
      );
    });

    it('blocks apply without offense description/type and does not invent defaults', () => {
      const gate = assessFineApplyGate({
        fields: {
          ...FINE_PAYMENT_NOTICE_COMPLETE,
          offenseType: undefined,
          offenseDescription: undefined,
          description: undefined,
        },
      });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'MISSING_OFFENSE_DESCRIPTION')).toBe(
        true,
      );
    });
  });

  describe('plausibility service integration', () => {
    const svc = new DocumentExtractionPlausibilityService();

    it('aggregates fine checks into BLOCKER overall status', () => {
      const result = svc.runChecks(
        'FINE',
        FINE_PAYMENT_NOTICE_PLATE_MISMATCH,
        { licensePlate: 'KS-FH-660E' },
      );
      expect(result.overallStatus).toBe('BLOCKER');
      expect(result.checks.map((check) => check.code)).toContain('PLATE_MISMATCH');
    });
  });
});
