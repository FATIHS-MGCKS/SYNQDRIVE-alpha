import { describe, expect, it } from 'vitest';
import {
  isExpenseInvoice,
  isOutgoingInvoice,
  isOverdueReceivable,
  isReceivableInvoice,
  isRevenueInvoice,
} from '../components/invoices/invoiceClassification';

describe('invoiceClassification', () => {
  it('treats all outgoing revenue types equally', () => {
    expect(isOutgoingInvoice('OUTGOING_BOOKING')).toBe(true);
    expect(isOutgoingInvoice('OUTGOING_MANUAL')).toBe(true);
    expect(isOutgoingInvoice('OUTGOING_FINAL')).toBe(true);
    expect(isRevenueInvoice({ type: 'OUTGOING_FINAL', status: 'ISSUED' })).toBe(true);
  });

  it('excludes draft/cancelled/void/credited outgoing invoices from revenue', () => {
    expect(isRevenueInvoice({ type: 'OUTGOING_FINAL', status: 'DRAFT' })).toBe(false);
    expect(isRevenueInvoice({ type: 'OUTGOING_FINAL', status: 'VOID' })).toBe(false);
    expect(isRevenueInvoice({ type: 'OUTGOING_BOOKING', status: 'CREDITED' })).toBe(false);
  });

  it('classifies receivable and overdue outgoing invoices', () => {
    const now = new Date('2026-06-24T10:00:00.000Z');
    expect(
      isReceivableInvoice({
        type: 'OUTGOING_FINAL',
        status: 'ISSUED',
        dueDate: '2026-07-01T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isOverdueReceivable(
        {
          type: 'OUTGOING_FINAL',
          status: 'ISSUED',
          dueDate: '2026-06-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
    expect(isReceivableInvoice({ type: 'INCOMING_VENDOR', status: 'ISSUED' })).toBe(false);
  });

  it('counts only incoming vendor/uploaded as expenses', () => {
    expect(isExpenseInvoice({ type: 'INCOMING_VENDOR', status: 'ISSUED' })).toBe(true);
    expect(isExpenseInvoice({ type: 'INCOMING_UPLOADED', status: 'APPROVED' })).toBe(true);
    expect(isExpenseInvoice({ type: 'OUTGOING_BOOKING', status: 'ISSUED' })).toBe(false);
    expect(isExpenseInvoice({ type: 'INCOMING_VENDOR', status: 'DRAFT' })).toBe(false);
    expect(isExpenseInvoice({ type: 'INCOMING_VENDOR', status: 'REJECTED' })).toBe(false);
  });
});
