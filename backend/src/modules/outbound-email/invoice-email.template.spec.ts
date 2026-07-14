import {
  buildDefaultInvoiceEmailHtml,
  buildDefaultInvoiceEmailSubject,
} from './invoice-email.template';

describe('invoice-email.template', () => {
  it('builds subject with invoice number', () => {
    expect(
      buildDefaultInvoiceEmailSubject({
        invoiceNumberDisplay: 'FSM-2026-0042',
        title: 'Rechnung',
        totalCents: 11900,
        currency: 'EUR',
        customerName: 'Max',
      }),
    ).toBe('Ihre Rechnung FSM-2026-0042');
  });

  it('builds html body with amount and due date', () => {
    const html = buildDefaultInvoiceEmailHtml({
      invoiceNumberDisplay: 'FSM-2026-0042',
      title: 'Rechnung',
      totalCents: 11900,
      currency: 'EUR',
      dueDate: new Date('2026-08-15T12:00:00.000Z'),
      customerName: 'Max Müller',
    });
    expect(html).toContain('Max Müller');
    expect(html).toContain('FSM-2026-0042');
    expect(html).toContain('119,00');
  });
});
