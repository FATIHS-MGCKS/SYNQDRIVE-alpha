// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  invoiceDisplayStatusLabel,
  isSafeExternalUrl,
  masterInvoiceFilterToQuery,
  stripeDashboardInvoiceUrl,
} from './master-invoices.utils';

describe('master invoices utils', () => {
  it('maps invoice filters to API query params', () => {
    expect(masterInvoiceFilterToQuery('overdue')).toEqual({ displayStatus: 'OVERDUE' });
    expect(masterInvoiceFilterToQuery('partially_refunded')).toEqual({
      displayStatus: 'PARTIALLY_REFUNDED',
    });
    expect(masterInvoiceFilterToQuery('all')).toEqual({});
  });

  it('labels display status in German', () => {
    expect(invoiceDisplayStatusLabel('OVERDUE')).toBe('Überfällig');
    expect(invoiceDisplayStatusLabel('PAID')).toBe('Bezahlt');
    expect(invoiceDisplayStatusLabel('PARTIALLY_REFUNDED')).toBe('Teilerstattet');
  });

  it('accepts only http(s) external links', () => {
    expect(isSafeExternalUrl('https://example.com/invoice.pdf')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('builds stripe dashboard links for test and live', () => {
    expect(stripeDashboardInvoiceUrl('in_123', 'TEST')).toBe(
      'https://dashboard.stripe.com/test/invoices/in_123',
    );
    expect(stripeDashboardInvoiceUrl('in_123', 'LIVE')).toBe(
      'https://dashboard.stripe.com/invoices/in_123',
    );
  });
});
