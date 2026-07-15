import { describe, expect, it } from 'vitest';
import {
  InvoiceDisplayStatus,
  InvoiceStatusDomain,
  mapInvoiceDomainToDisplayStatus,
  mapInvoiceStatusToLabel,
  mapInvoiceStatusToTone,
} from './billing-domain';

describe('frontend billing-domain', () => {
  it('VOID never maps to Paid display', () => {
    const display = mapInvoiceDomainToDisplayStatus(InvoiceStatusDomain.VOID);
    expect(display).toBe(InvoiceDisplayStatus.VOID);
    expect(display).not.toBe(InvoiceDisplayStatus.PAID);
  });

  it('maps VOID label to Storniert', () => {
    expect(mapInvoiceStatusToLabel('VOID')).toBe('Storniert');
    expect(mapInvoiceStatusToLabel('Void')).toBe('Storniert');
  });

  it('maps PAID label to Bezahlt', () => {
    expect(mapInvoiceStatusToLabel('PAID')).toBe('Bezahlt');
  });

  it('VOID tone is neutral not success', () => {
    expect(mapInvoiceStatusToTone('VOID')).toBe('sq-tone-neutral');
    expect(mapInvoiceStatusToTone('PAID')).toBe('sq-tone-success');
  });
});
