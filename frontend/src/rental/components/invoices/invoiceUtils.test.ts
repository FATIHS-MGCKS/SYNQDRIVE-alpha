import { describe, expect, it } from 'vitest';

import {
  canIssue,
  canMarkSent,
  canRecordPayment,
  displayNumber,
  formatAmount,
  formatDate,
  isOutgoing,
} from './invoiceUtils';
import { makeInvoice } from './invoice-baseline.fixtures';

describe('invoiceUtils', () => {
  it('displayNumber prefers invoiceNumberDisplay', () => {
    expect(displayNumber({ invoiceNumberDisplay: 'FSM-2026-0042', status: 'ISSUED' })).toBe(
      'FSM-2026-0042',
    );
  });

  it('displayNumber falls back to Entwurf without number', () => {
    expect(displayNumber({ status: 'DRAFT' })).toBe('Entwurf');
  });

  it('formatAmount formats EUR cents in de-DE', () => {
    expect(formatAmount(53550, 'EUR')).toMatch(/535,50/);
  });

  it('formatDate returns em dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('canIssue only for outgoing drafts', () => {
    expect(canIssue('DRAFT', 'OUTGOING_MANUAL')).toBe(true);
    expect(canIssue('ISSUED', 'OUTGOING_MANUAL')).toBe(false);
    expect(canIssue('DRAFT', 'INCOMING_VENDOR')).toBe(false);
  });

  it('canMarkSent for issued outgoing invoices', () => {
    expect(canMarkSent('ISSUED', 'OUTGOING_BOOKING')).toBe(true);
    expect(canMarkSent('DRAFT', 'OUTGOING_BOOKING')).toBe(false);
  });

  it('canRecordPayment blocks terminal statuses', () => {
    expect(canRecordPayment('PAID')).toBe(true);
    expect(canRecordPayment('VOID')).toBe(false);
    expect(canRecordPayment('DRAFT')).toBe(false);
  });

  it('isOutgoing recognizes all outgoing types', () => {
    expect(isOutgoing('OUTGOING_BOOKING')).toBe(true);
    expect(isOutgoing('OUTGOING_FINAL')).toBe(true);
    expect(isOutgoing('INCOMING_VENDOR')).toBe(false);
  });
});

describe('invoice detail helpers — payment display baseline', () => {
  it('documents CARD enum as raw table value (current regression)', () => {
    const inv = makeInvoice();
    const method = inv.payments?.[0]?.method ?? '';
    expect(method).toBe('CARD');
    expect(method).not.toBe('Karte');
  });
});
