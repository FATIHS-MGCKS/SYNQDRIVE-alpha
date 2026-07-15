/**
 * Audit baseline — operative Rechnungsfunktion.
 * Maps to docs/audits/invoice-function-current-state.md (Ist-Analyse).
 * Documents current behavior; does not weaken existing pipeline tests.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicePaymentMethod } from '@prisma/client';
import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { FIXED_NOW, LINE_ITEM_NET } from './__fixtures__/invoice-pipeline.fixtures';
import { buildOutgoingPaymentCheckTitle } from './invoice-payment-task.util';
import { invoiceBookingRef } from './utils/invoice-booking-ref.util';
import {
  createInvoicePipelineHarness,
  issueWithPdf,
  type InvoicePipelineHarness,
} from './invoices-pipeline.harness';

/** Simulates BookingDocumentBundle creating a BOOKING_INVOICE row (harness bundle mock is empty by default). */
function wireBundleCreatesBookingInvoice(
  h: InvoicePipelineHarness,
  opts: { invoiceId: string; bookingId: string; orgId?: string },
) {
  const orgId = opts.orgId ?? h.store.ids.orgA;
  h.bundleMock.getBundleView.mockImplementation(async (_o: string, bookingId: string) => {
    const documents = h.store.tables.generatedDocuments.filter(
      (d) =>
        d.organizationId === orgId &&
        d.bookingId === bookingId &&
        d.documentType === 'BOOKING_INVOICE' &&
        d.status !== DOCUMENT_STATUS.VOID,
    );
    return { documents };
  });
  h.bundleMock.generateInitialBundle.mockImplementation(async () => {
    const exists = h.store.tables.generatedDocuments.some(
      (d) =>
        d.organizationId === orgId &&
        d.bookingId === opts.bookingId &&
        d.documentType === 'BOOKING_INVOICE' &&
        d.status !== DOCUMENT_STATUS.VOID,
    );
    if (!exists) {
      h.store.seedDocument({
        organizationId: orgId,
        bookingId: opts.bookingId,
        invoiceId: opts.invoiceId,
        documentType: 'BOOKING_INVOICE',
        status: DOCUMENT_STATUS.GENERATED,
      });
    }
  });
}

describe('Invoice audit baseline (integration)', () => {
  let h: ReturnType<typeof createInvoicePipelineHarness>;

  beforeEach(() => {
    h = createInvoicePipelineHarness();
  });

  describe('01–03 Buchungsformular / Wizard → Buchungsrechnung + PDF', () => {
    it('audit-01/02 — createBookingInvoice aus Buchungsformular (Snapshot) erzeugt OUTGOING_BOOKING', async () => {
      const { orgA, bookingForm, customerCompany, vehicleA } = h.store.ids;
      const inv = await h.invoices.createBookingInvoice(orgA, {
        id: bookingForm,
        customerId: customerCompany,
        vehicleId: vehicleA,
        startDate: new Date('2026-08-10T10:00:00.000Z'),
        endDate: new Date('2026-08-12T10:00:00.000Z'),
      });
      expect(inv).not.toBeNull();
      expect(inv!.type).toBe('OUTGOING_BOOKING');
      expect(inv!.bookingId).toBe(bookingForm);
      expect(inv!.totalCents).toBe(12000);
    });

    it('audit-03 — Wizard-Confirm: syncOnBookingConfirmed stellt ISSUED aus, paymentIntent markiert nicht bezahlt', async () => {
      const { orgA, bookingWizard } = h.store.ids;
      await h.invoices.createBookingInvoice(orgA, {
        id: bookingWizard,
        customerId: h.store.ids.customerPrivate,
        vehicleId: h.store.ids.vehicleA,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        endDate: new Date('2026-08-05T10:00:00.000Z'),
      });
      const synced = await h.lifecycle.syncOnBookingConfirmed(orgA, bookingWizard, {
        paymentIntent: 'cash',
      });
      expect(synced).not.toBeNull();
      const row = await h.store.prisma.orgInvoice.findFirst({
        where: { id: synced!.id, organizationId: orgA },
      });
      expect(row!.status).toBe('ISSUED');
      expect(row!.paidCents).toBe(0);
    });

    it('audit-03b — ausgestellte Buchungsrechnung erhält PDF via InvoiceDocumentsService (BOOKING_INVOICE flow)', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_BOOKING',
        customerId: h.store.ids.customerPrivate,
        bookingId: h.store.ids.bookingForm,
        vehicleId: h.store.ids.vehicleA,
        title: `Buchungsrechnung ${invoiceBookingRef(h.store.ids.bookingForm)}`,
        lineItems: [LINE_ITEM_NET],
        totalCents: 12000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      const invoiceId = String(inv.id);
      await h.invoices.issue(invoiceId, h.store.ids.orgA);
      wireBundleCreatesBookingInvoice(h, {
        invoiceId,
        bookingId: h.store.ids.bookingForm,
      });
      const panel = await h.documents.generate(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin);
      expect(panel.activeDocument).not.toBeNull();
      expect(panel.activeDocument!.documentType).toBe('BOOKING_INVOICE');
      const row = await h.store.prisma.orgInvoice.findFirst({ where: { id: inv.id } });
      expect(row!.generatedDocumentId).toBe(panel.activeDocument!.id);
    });
  });

  describe('04 Dokumentrelation invoiceId ↔ generatedDocumentId', () => {
    it('audit-04a — nach PDF-Generierung sind invoiceId und generatedDocumentId konsistent', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_BOOKING',
        customerId: h.store.ids.customerPrivate,
        bookingId: h.store.ids.bookingWizard,
        title: 'Sync Test',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      const invoiceId = String(inv.id);
      await h.invoices.issue(invoiceId, h.store.ids.orgA);
      wireBundleCreatesBookingInvoice(h, {
        invoiceId,
        bookingId: h.store.ids.bookingWizard,
      });
      await h.documents.generate(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin);
      const invoice = await h.store.prisma.orgInvoice.findFirst({ where: { id: invoiceId } });
      const doc = h.store.tables.generatedDocuments.find(
        (d) => d.id === invoice!.generatedDocumentId,
      );
      expect(doc?.invoiceId).toBe(invoiceId);
      expect(invoice!.generatedDocumentId).toBeTruthy();
    });

    it('audit-04b — REGRESSION: legacy gap invoiceId gesetzt, generatedDocumentId null — Panel findet Dokument', async () => {
      const inv = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_BOOKING',
        status: 'ISSUED',
        customerId: h.store.ids.customerPrivate,
        bookingId: h.store.ids.bookingForm,
        title: 'Pointer gap',
        totalCents: 10000,
        generatedDocumentId: null,
        sequenceNumber: 11,
        sequenceYear: 2026,
      });
      h.store.seedDocument({
        organizationId: h.store.ids.orgA,
        invoiceId: inv.id,
        documentType: 'BOOKING_INVOICE',
        status: DOCUMENT_STATUS.GENERATED,
      });
      const panel = await h.documents.getPanel(h.store.ids.orgA, inv.id as string, { isAdmin: true });
      expect(panel.versions.length).toBeGreaterThan(0);
      expect(panel.activeDocument).not.toBeNull();
      expect((await h.store.prisma.orgInvoice.findFirst({ where: { id: inv.id } }))!.generatedDocumentId).toBeNull();
    });
  });

  describe('05 Detail-Endpunkt findById — Roh-IDs ohne fachliche Auflösung', () => {
    it('audit-05 — GET-Rechnungsdetail liefert customerId/bookingId/vehicleId, keine Display-Namen', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_BOOKING',
        customerId: h.store.ids.customerPrivate,
        bookingId: h.store.ids.bookingForm,
        vehicleId: h.store.ids.vehicleA,
        title: 'Detail API',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      const detail = await h.invoices.findById(String(inv.id), h.store.ids.orgA);
      expect(detail.customerId).toBe(h.store.ids.customerPrivate);
      expect(detail.bookingId).toBe(h.store.ids.bookingForm);
      expect(detail.vehicleId).toBe(h.store.ids.vehicleA);
      expect(detail).not.toHaveProperty('customerDisplayName');
      expect(detail).not.toHaveProperty('bookingNumber');
      expect(detail).not.toHaveProperty('vehicleDisplayName');
    });
  });

  describe('08 Aufgabentitel ohne interne UUID-Fragmente', () => {
    it('audit-08a — Buchungsrechnungstitel nutzt BK-Referenz statt slice(0,8)', async () => {
      const bookingId = 'book-99999999-8888-7777-6666-555555555555';
      await h.store.prisma.booking.create({
        data: {
          id: bookingId,
          organizationId: h.store.ids.orgA,
          customerId: h.store.ids.customerPrivate,
          vehicleId: h.store.ids.vehicleA,
          status: 'CONFIRMED',
          startDate: new Date('2026-08-01T10:00:00.000Z'),
          endDate: new Date('2026-08-03T10:00:00.000Z'),
          totalPriceCents: 11900,
          dailyRateCents: 5950,
          currency: 'EUR',
        },
      });
      const inv = await h.invoices.createBookingInvoice(h.store.ids.orgA, {
        id: bookingId,
        customerId: h.store.ids.customerPrivate,
        vehicleId: h.store.ids.vehicleA,
        totalPriceCents: 11900,
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        endDate: new Date('2026-08-03T10:00:00.000Z'),
      });
      expect(inv!.title).toContain('BK-555555');
      expect(inv!.title).not.toMatch(/#book-9999/i);
      expect(inv!.title).not.toMatch(/[0-9a-f]{8}\.\.\./i);
    });

    it('audit-08b — Zahlungsaufgabe-Titel nutzt Rechnungsnummer-Label, kein Roh-UUID', () => {
      const title = buildOutgoingPaymentCheckTitle('FSM-2026-0042');
      expect(title).toBe('Zahlungseingang prüfen: Rechnung FSM-2026-0042');
      expect(title).not.toMatch(/[0-9a-f]{8}/i);
    });
  });

  describe('09/11 Versand und markPaid', () => {
    it('audit-09 — Rechnungs-E-Mail ohne bookingId (INVOICE_SINGLE)', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Ohne Buchung Mail',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      const invoiceId = await issueWithPdf(h, h.store.ids.orgA, String(inv.id));
      const dto = await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Rechnung',
      });
      expect(dto.invoiceId).toBe(invoiceId);
      expect(dto.bookingId).toBeFalsy();
    });

    it('audit-11 — markPaid verbucht Rest mit BANK_TRANSFER (kein Methoden-Dialog)', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Mark paid default',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      await h.invoices.issue(String(inv.id), h.store.ids.orgA);
      await h.invoices.markPaid(String(inv.id), h.store.ids.orgA);
      const payment = h.store.tables.orgInvoicePayments.at(-1);
      expect(payment?.method).toBe(InvoicePaymentMethod.BANK_TRANSFER);
      expect(payment?.amountCents).toBe(10000);
    });
  });

  describe('10 Zahlungsmethode CARD als Enum in API', () => {
    it('audit-10 — recordPayment persistiert CARD; Presentation-Layer muss übersetzen', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Card payment',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      await h.invoices.issue(String(inv.id), h.store.ids.orgA);
      await h.invoices.recordPayment(String(inv.id), h.store.ids.orgA, {
        amountCents: 10000,
        method: InvoicePaymentMethod.CARD,
        reference: 'POS-4421',
      });
      const payment = h.store.tables.orgInvoicePayments.at(-1);
      expect(payment?.method).toBe('CARD');
    });
  });

  describe('Mandantentrennung', () => {
    it('audit-tenant-detail — fremde Org kann Rechnungsdetail nicht lesen', async () => {
      const inv = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Org A',
        totalCents: 10000,
      });
      await expect(
        h.invoices.findById(inv.id as string, h.store.ids.orgB),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('audit-tenant-document — fremde Org kann verknüpftes Dokument nicht laden', async () => {
      const doc = h.store.seedDocument({
        organizationId: h.store.ids.orgA,
        invoiceId: null,
        documentType: 'BOOKING_INVOICE',
      });
      const generatedDocs = new GeneratedDocumentsService(h.store.prisma as never, {
        putObject: jest.fn(),
        getObjectStream: jest.fn(),
        getObject: jest.fn(),
      } as never);
      await expect(generatedDocs.getById(h.store.ids.orgB, doc.id as string)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('12 Fehler bei nachgelagerter Synchronisation', () => {
    it('audit-12a — bootstrapBookingInvoice wirft bei hartem Fehler (nicht verschluckt im Service)', async () => {
      const spy = jest.spyOn(h.invoices, 'createBookingInvoice').mockRejectedValueOnce(new Error('DB down'));
      await expect(
        h.invoices.bootstrapBookingInvoice(h.store.ids.orgA, {
          id: h.store.ids.bookingForm,
          customerId: h.store.ids.customerPrivate,
          vehicleId: h.store.ids.vehicleA,
          startDate: new Date('2026-08-01'),
          endDate: new Date('2026-08-03'),
        }),
      ).rejects.toThrow('DB down');
      spy.mockRestore();
    });

    it('audit-12b — REGRESSION: Bundle-Generierung ohne PDF wirft BadRequest an Aufrufer', async () => {
      h.rendererMock.mockRejectedValueOnce(new Error('Render kaputt'));
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Fail Gen',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      await h.invoices.issue(String(inv.id), h.store.ids.orgA);
      await expect(
        h.documents.generate(h.store.ids.orgA, String(inv.id), h.store.ids.userAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
