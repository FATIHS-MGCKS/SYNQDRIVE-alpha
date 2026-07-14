import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  api: {
    invoices: {
      recordPayment: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';
import { recordInvoicePayment } from './invoicePayments.api';
import type { Invoice } from './invoiceTypes';

const invoiceFixture = (): Invoice => ({
  id: 'inv-42',
  invoiceNumber: 42,
  invoiceNumberDisplay: 'FSM-2026-0042',
  type: 'OUTGOING_MANUAL',
  customerId: null,
  vendorId: null,
  vendorName: null,
  bookingId: null,
  vehicleId: null,
  title: 'Test',
  description: '',
  lineItems: null,
  subtotalCents: 10000,
  taxCents: 0,
  totalCents: 10000,
  paidCents: 0,
  outstandingCents: 10000,
  currency: 'EUR',
  invoiceDate: '2026-07-14',
  dueDate: null,
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-14T08:00:00Z',
});

describe('invoice payments integration flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.invoices.recordPayment).mockResolvedValue({
      ...invoiceFixture(),
      paidCents: 5000,
      outstandingCents: 5000,
      status: 'PARTIALLY_PAID',
      payments: [
        {
          id: 'pay-1',
          amountCents: 5000,
          method: 'BANK_TRANSFER',
          paidAt: '2026-07-14T12:00:00Z',
          reference: 'REF-99',
          statusKind: 'recorded',
          statusLabel: 'Erfasst',
        },
      ],
    });
  });

  it('records payment through invoice payments endpoint with required method', async () => {
    const updated = await recordInvoicePayment('org-1', 'inv-42', {
      amountCents: 5000,
      method: 'BANK_TRANSFER',
      paidAt: '2026-07-14T12:00:00.000Z',
      reference: 'REF-99',
      note: 'Teilzahlung',
    });

    expect(api.invoices.recordPayment).toHaveBeenCalledWith('org-1', 'inv-42', {
      amountCents: 5000,
      method: 'BANK_TRANSFER',
      paidAt: '2026-07-14T12:00:00.000Z',
      reference: 'REF-99',
      note: 'Teilzahlung',
    });
    expect(updated.paidCents).toBe(5000);
    expect(updated.payments?.[0]?.method).toBe('BANK_TRANSFER');
  });
});
