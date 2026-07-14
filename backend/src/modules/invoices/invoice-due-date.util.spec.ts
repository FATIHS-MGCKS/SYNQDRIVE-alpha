import { InvoiceDueDateBase } from '@prisma/client';
import { zonedStartOfDayToUtc } from '@modules/pricing/tariff-instant.util';
import {
  computeDueDateFromTerms,
  normalizePaymentTermsDays,
  resolveDueDateForCreate,
  resolveDueDateOnIssue,
} from './invoice-due-date.util';

const TZ = 'Europe/Berlin';

describe('invoice-due-date.util', () => {
  describe('normalizePaymentTermsDays', () => {
    it('defaults invalid values to 7', () => {
      expect(normalizePaymentTermsDays(null)).toBe(7);
      expect(normalizePaymentTermsDays(-1)).toBe(7);
    });

    it.each([0, 7, 14, 30])('accepts %i days', (days) => {
      expect(normalizePaymentTermsDays(days)).toBe(days);
    });
  });

  describe('resolveDueDateForCreate', () => {
    const invoiceDate = zonedStartOfDayToUtc('2026-07-01', TZ);

    it('explicit dueDate → CUSTOM without payment terms snapshot', () => {
      const resolved = resolveDueDateForCreate({
        explicitDueDate: '2026-08-15',
        invoiceDate,
        paymentTermsDays: 14,
        timezone: TZ,
        isOutgoing: true,
      });
      expect(resolved.dueDateBase).toBe(InvoiceDueDateBase.CUSTOM);
      expect(resolved.paymentTermsDaysAtCreate).toBeNull();
      expect(resolved.dueDate).toEqual(zonedStartOfDayToUtc('2026-08-15', TZ));
    });

    it('incoming without explicit due date → null', () => {
      const resolved = resolveDueDateForCreate({
        invoiceDate,
        paymentTermsDays: 14,
        timezone: TZ,
        isOutgoing: false,
      });
      expect(resolved.dueDate).toBeNull();
      expect(resolved.dueDateBase).toBeNull();
    });

    it.each([0, 7, 14, 30])(
      'outgoing auto uses INVOICE_DATE + %i payment terms',
      (terms) => {
        const resolved = resolveDueDateForCreate({
          invoiceDate,
          paymentTermsDays: terms,
          timezone: TZ,
          isOutgoing: true,
        });
        expect(resolved.dueDateBase).toBe(InvoiceDueDateBase.INVOICE_DATE);
        expect(resolved.paymentTermsDaysAtCreate).toBe(terms);
        expect(resolved.dueDate).toEqual(
          computeDueDateFromTerms(invoiceDate, terms, TZ),
        );
      },
    );

    it('BOOKING_START anchor uses booking start, not invoice date', () => {
      const bookingStart = zonedStartOfDayToUtc('2026-07-20', TZ);
      const resolved = resolveDueDateForCreate({
        dueDateBase: InvoiceDueDateBase.BOOKING_START,
        invoiceDate,
        bookingStartDate: bookingStart,
        paymentTermsDays: 14,
        timezone: TZ,
        isOutgoing: true,
      });
      expect(resolved.dueDate).toEqual(computeDueDateFromTerms(bookingStart, 14, TZ));
    });

    it('invoice before booking start: INVOICE_DATE base ignores booking', () => {
      const bookingStart = zonedStartOfDayToUtc('2026-08-01', TZ);
      const resolved = resolveDueDateForCreate({
        invoiceDate,
        bookingStartDate: bookingStart,
        paymentTermsDays: 7,
        timezone: TZ,
        isOutgoing: true,
      });
      expect(resolved.dueDate).toEqual(computeDueDateFromTerms(invoiceDate, 7, TZ));
    });

    it('retroactive invoice: ISSUE_DATE base at create uses invoiceDate until issue', () => {
      const resolved = resolveDueDateForCreate({
        dueDateBase: InvoiceDueDateBase.ISSUE_DATE,
        invoiceDate: zonedStartOfDayToUtc('2026-06-01', TZ),
        paymentTermsDays: 14,
        timezone: TZ,
        isOutgoing: true,
      });
      expect(resolved.dueDateBase).toBe(InvoiceDueDateBase.ISSUE_DATE);
      expect(resolved.dueDate).toEqual(
        computeDueDateFromTerms(zonedStartOfDayToUtc('2026-06-01', TZ), 14, TZ),
      );
    });
  });

  describe('resolveDueDateOnIssue', () => {
    it('CUSTOM: keeps existing due date', () => {
      const manual = zonedStartOfDayToUtc('2026-09-01', TZ);
      const result = resolveDueDateOnIssue({
        dueDateBase: InvoiceDueDateBase.CUSTOM,
        currentDueDate: manual,
        issuedAt: new Date('2026-07-15T10:00:00.000Z'),
        paymentTermsDaysAtCreate: null,
        paymentTermsDays: 7,
        timezone: TZ,
      });
      expect(result).toEqual(manual);
    });

    it('legacy null base: does not recalculate', () => {
      const existing = zonedStartOfDayToUtc('2026-08-01', TZ);
      const result = resolveDueDateOnIssue({
        dueDateBase: null,
        currentDueDate: existing,
        issuedAt: new Date('2026-07-15T10:00:00.000Z'),
        paymentTermsDaysAtCreate: 14,
        paymentTermsDays: 7,
        timezone: TZ,
      });
      expect(result).toEqual(existing);
    });

    it('ISSUE_DATE: recalculates from issuedAt + snapshotted terms', () => {
      const issuedAt = zonedStartOfDayToUtc('2026-07-15', TZ);
      const result = resolveDueDateOnIssue({
        dueDateBase: InvoiceDueDateBase.ISSUE_DATE,
        currentDueDate: zonedStartOfDayToUtc('2026-06-20', TZ),
        issuedAt,
        paymentTermsDaysAtCreate: 30,
        paymentTermsDays: 7,
        timezone: TZ,
      });
      expect(result).toEqual(computeDueDateFromTerms(issuedAt, 30, TZ));
    });

    it('INVOICE_DATE base: keeps due date set at create', () => {
      const atCreate = zonedStartOfDayToUtc('2026-07-22', TZ);
      const result = resolveDueDateOnIssue({
        dueDateBase: InvoiceDueDateBase.INVOICE_DATE,
        currentDueDate: atCreate,
        issuedAt: zonedStartOfDayToUtc('2026-07-20', TZ),
        paymentTermsDaysAtCreate: 7,
        paymentTermsDays: 7,
        timezone: TZ,
      });
      expect(result).toEqual(atCreate);
    });
  });
});
