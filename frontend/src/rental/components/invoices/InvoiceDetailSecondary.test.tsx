import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./hooks/useInvoiceTimeline', () => ({
  useInvoiceTimeline: () => ({ panel: null, loading: false, error: null }),
}));

import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import { InvoiceDetailSecondary } from './InvoiceDetailSecondary';
import { InvoiceRelations } from './InvoiceRelations';
import type { Invoice } from './invoiceTypes';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1,
  invoiceNumberDisplay: 'FSM-2026-0001',
  type: 'OUTGOING_BOOKING',
  customerId: 'cust-11111111-2222-3333-4444-555555555555',
  vendorId: null,
  vendorName: null,
  bookingId: 'book-99999999-8888-7777-6666-555555555555',
  vehicleId: 'veh-1',
  title: 'Mietrechnung',
  description: 'Mietzeitraum Hinweis für Kunden',
  lineItems: null,
  subtotalCents: 10000,
  taxCents: 1900,
  totalCents: 11900,
  paidCents: 0,
  outstandingCents: 11900,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'DRAFT',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  tasks: [
    { id: 'task-1', title: 'Zahlung prüfen', status: 'OPEN' },
    { id: 'task-2', title: 'Erledigt', status: 'DONE' },
  ],
  ...overrides,
});

describe('InvoiceRelations primary', () => {
  it('shows only entity assignment without provenance or tasks', () => {
    const detail = buildInvoiceDetailDto(invoice(), {
      canManageEmail: true,
      relationsEnrichment: {
        customer: {
          id: 'cust-11111111-2222-3333-4444-555555555555',
          firstName: 'Erika',
          lastName: 'Beispiel',
          email: 'erika@example.com',
        },
        customerFetchState: 'ok',
        createdByUserName: 'Tom Tenant',
      },
    });

    const html = renderToStaticMarkup(
      <InvoiceRelations detail={detail} {...theme} />,
    );

    expect(html).toContain('Zuordnung');
    expect(html).toContain('Erika Beispiel');
    expect(html).not.toContain('Erstellt von');
    expect(html).not.toContain('Verknüpfte Aufgabe');
  });
});

describe('InvoiceDetailSecondary', () => {
  it('groups description, notes, tasks, and audit in accordion', () => {
    const detail = buildInvoiceDetailDto(invoice(), {
      canManageEmail: true,
      relationsEnrichment: { createdByUserName: 'Tom Tenant' },
    });

    const html = renderToStaticMarkup(
      <InvoiceDetailSecondary
        invoice={invoice()}
        detail={detail}
        orgId="org-1"
        viewportWidth={1280}
        onSaveNotes={async () => true}
        onCopyInternalId={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('invoice-detail-secondary');
    expect(html).toContain('Weitere Informationen');
    expect(html).toContain('Rechnungsbeschreibung');
    expect(html).toContain('Interne Notizen');
    expect(html).toContain('Nur intern');
    expect(html).toContain('Aufgaben');
    expect(html).toContain('(1 offen)');
    expect(html).toContain('Herkunft');
    expect(html).not.toContain('Keine Notizen vorhanden');
  });

  it('shows more-info section when edit is allowed without oversized empty card', () => {
    const detail = buildInvoiceDetailDto(invoice({ status: 'DRAFT', description: '' }), {
      canManageEmail: true,
    });

    const html = renderToStaticMarkup(
      <InvoiceDetailSecondary
        invoice={invoice({ status: 'DRAFT', description: '' })}
        detail={detail}
        orgId="org-1"
        viewportWidth={1280}
        onSaveNotes={async () => true}
        onCopyInternalId={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('Weitere Informationen');
    expect(html).not.toContain('Keine Notizen vorhanden');
  });

  it('keeps secondary sections collapsed by default on narrow mobile', () => {
    const detail = buildInvoiceDetailDto(invoice(), { canManageEmail: true });
    const html = renderToStaticMarkup(
      <InvoiceDetailSecondary
        invoice={invoice()}
        detail={detail}
        orgId="org-1"
        viewportWidth={320}
        onSaveNotes={async () => true}
        onCopyInternalId={() => undefined}
        {...theme}
      />,
    );

    expect(html).toContain('Weitere Informationen');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('layout hierarchy reduction', () => {
  it('removed four standalone secondary card surfaces', () => {
    const detail = buildInvoiceDetailDto(invoice(), { canManageEmail: true });
    const relationsHtml = renderToStaticMarkup(
      <InvoiceRelations detail={detail} {...theme} />,
    );
    const secondaryHtml = renderToStaticMarkup(
      <InvoiceDetailSecondary
        invoice={invoice()}
        detail={detail}
        orgId="org-1"
        onSaveNotes={async () => true}
        onCopyInternalId={() => undefined}
        {...theme}
      />,
    );

    expect(relationsHtml.match(/class="card/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(secondaryHtml).toContain('accordion');
    expect(secondaryHtml).not.toContain('Verknüpfte Aufgabe');
  });
});
