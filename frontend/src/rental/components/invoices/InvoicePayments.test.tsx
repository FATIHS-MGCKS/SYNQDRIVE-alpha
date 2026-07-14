import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { InvoicePayments } from './InvoicePayments';
import type { Invoice, InvoicePayment } from './invoiceTypes';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = de[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
  }),
}));

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

const sampleInvoice = (): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1,
  invoiceNumberDisplay: 'FSM-2026-0001',
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
  taxCents: 1900,
  totalCents: 11900,
  paidCents: 5000,
  outstandingCents: 6900,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'PARTIALLY_PAID',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
});

const payments: InvoicePayment[] = [
  {
    id: 'p1',
    amountCents: 5000,
    method: 'CARD',
    paidAt: '2026-07-02T10:00:00Z',
    reference: 'REF-123',
    statusKind: 'recorded',
    statusLabel: 'Erfasst',
    createdByName: 'Maria Admin',
  },
];

const baseProps = () => ({
  invoice: sampleInvoice(),
  payments,
  recordGate: { allowed: true, reason: undefined },
  recordDialogOpen: false,
  onRecordDialogOpenChange: () => undefined,
  amountInput: '69.00',
  method: 'BANK_TRANSFER',
  paidAt: '2026-07-14',
  reference: '',
  note: '',
  recording: false,
  detailPaymentId: null,
  onDetailPaymentIdChange: () => undefined,
  onAmountInputChange: () => undefined,
  onMethodChange: () => undefined,
  onPaidAtChange: () => undefined,
  onReferenceChange: () => undefined,
  onNoteChange: () => undefined,
  onOpenRecordDialog: () => undefined,
  onSubmitRecord: () => undefined,
  ...theme,
});

function renderPayments(viewportClass?: string) {
  const html = renderToStaticMarkup(
  <div className={viewportClass}>
    <InvoicePayments {...baseProps()} />
  </div>,
  );
  return html;
}

describe('InvoicePayments component', () => {
  it('shows localized method labels instead of raw enums', () => {
    const html = renderPayments();
    expect(html).toContain('Karte');
    expect(html).not.toContain('>CARD<');
    expect(html).not.toContain('BANK_TRANSFER');
  });

  it('shows paid and outstanding summaries', () => {
    const html = renderPayments();
    expect(html).toContain('Bezahlt');
    expect(html).toContain('Offen');
  });

  it('renders mobile card layout markers', () => {
    const html = renderPayments('w-[320px]');
    expect(html).toContain('data-layout="mobile-cards"');
    expect(html).toContain('REF-123');
    expect(html).toContain('Maria Admin');
  });

  it('renders desktop table with column headers', () => {
    const html = renderPayments();
    expect(html).toContain('Erfasst von');
    expect(html).toContain('hidden md:block');
    expect(html).toContain('Details');
  });

  it('shows empty state when no payments', () => {
    const html = renderToStaticMarkup(
      <InvoicePayments {...baseProps()} payments={[]} />,
    );
    expect(html).toContain('Noch keine Zahlungen erfasst');
  });

  it('disables record action when gate blocks', () => {
    const html = renderToStaticMarkup(
      <InvoicePayments
        {...baseProps()}
        recordGate={{ allowed: false, reason: 'Kein offener Betrag' }}
      />,
    );
    expect(html).toContain('disabled');
    expect(html).toContain('title="Kein offener Betrag"');
  });
});

describe('InvoicePayments responsive layouts', () => {
  const widths = [
    { label: '320px', className: 'w-[320px]' },
    { label: '375px', className: 'w-[375px]' },
    { label: '390px', className: 'w-[390px]' },
    { label: 'tablet', className: 'w-[768px]' },
    { label: 'desktop', className: 'w-[1280px]' },
  ];

  widths.forEach(({ label, className }) => {
    it(`renders structured payment UI at ${label}`, () => {
      const html = renderPayments(className);
      expect(html).toContain('invoice-payments-section');
      expect(html).toContain('Zahlungen');
      expect(html).toContain('Karte');
      expect(html).not.toContain('>CARD<');
    });
  });
});
