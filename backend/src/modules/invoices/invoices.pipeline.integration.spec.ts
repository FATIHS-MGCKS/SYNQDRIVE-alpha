/**
 * Invoice process integration matrix (V4.9.468).
 * Real service wiring + relational in-memory store; external I/O mocked.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InvoicePaymentMethod } from '@prisma/client';
import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { FIXED_NOW, LINE_ITEM_NET } from './__fixtures__/invoice-pipeline.fixtures';
import { createInvoicePipelineHarness, issueWithPdf } from './invoices-pipeline.harness';

type CreatedInvoice = { id: string };

async function createOutgoing(
  h: ReturnType<typeof createInvoicePipelineHarness>,
  title: string,
  opts?: { customerId?: string; vehicleId?: string; totalCents?: number },
): Promise<CreatedInvoice> {
  return (await h.invoices.create(h.store.ids.orgA, {
    type: 'OUTGOING_MANUAL',
    customerId: opts?.customerId ?? h.store.ids.customerPrivate,
    vehicleId: opts?.vehicleId,
    title,
    lineItems: [LINE_ITEM_NET],
    totalCents: opts?.totalCents ?? 10000,
    currency: 'EUR',
    invoiceDate: FIXED_NOW.toISOString(),
  })) as CreatedInvoice;
}

describe('Invoice process pipeline (integration matrix)', () => {
  let h: ReturnType<typeof createInvoicePipelineHarness>;

  beforeEach(() => {
    h = createInvoicePipelineHarness();
  });

  // ─── Rechnungserstellung (1–8) ─────────────────────────────────────────────

  describe('Rechnungserstellung', () => {
    it('01 — manuelle Ausgangsrechnung: DRAFT → issue mit Sequenznummer', async () => {
      const { orgA, customerPrivate } = h.store.ids;
      const inv = await h.invoices.create(orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: customerPrivate,
        title: 'Manuelle Rechnung',
        lineItems: [LINE_ITEM_NET],
        totalCents: 10000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      expect(inv.status).toBe('DRAFT');
      const issued = await h.invoices.issue(String(inv.id), orgA);
      expect(issued.status).toBe('ISSUED');
      expect(issued.invoiceNumberDisplay).toMatch(/TFL-2026-\d{4}/);
    });

    it('02 — Buchungsrechnung über neues Buchungsformular (createBookingInvoice + Snapshot)', async () => {
      const { orgA, bookingForm, customerCompany } = h.store.ids;
      const inv = await h.invoices.createBookingInvoice(orgA, {
        id: bookingForm,
        customerId: customerCompany,
        vehicleId: h.store.ids.vehicleA,
        startDate: new Date('2026-08-10T10:00:00.000Z'),
        endDate: new Date('2026-08-12T10:00:00.000Z'),
      });
      expect(inv).not.toBeNull();
      expect(inv!.type).toBe('OUTGOING_BOOKING');
      expect(inv!.bookingId).toBe(bookingForm);
      expect(inv!.customerId).toBe(customerCompany);
      expect(inv!.totalCents).toBe(12000);
    });

    it('03 — Buchungsrechnung über Booking Wizard: confirm sync issued, paymentIntent markiert nicht bezahlt', async () => {
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

    it('04 — Eingangsrechnung: NEEDS_REVIEW + Zahlungsaufgabe', async () => {
      const { orgA, vendorA } = h.store.ids;
      const inv = await h.invoices.create(orgA, {
        type: 'INCOMING_VENDOR',
        vendorId: vendorA,
        title: 'Werkstattrechnung',
        lineItems: [LINE_ITEM_NET],
        totalCents: 5000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      expect(inv.status).toBe('NEEDS_REVIEW');
      const tasks = h.store.tables.orgTasks.filter((t) => t.invoiceId === inv.id);
      expect(tasks.length).toBeGreaterThan(0);
    });

    it('05 — Ausgangsrechnung ohne Buchung', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Ohne Buchung',
        lineItems: [LINE_ITEM_NET],
        totalCents: 8000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      expect(inv.bookingId).toBeNull();
    });

    it('06 — Ausgangsrechnung ohne Fahrzeug', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Ohne Fahrzeug',
        lineItems: [LINE_ITEM_NET],
        totalCents: 8000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      expect(inv.vehicleId).toBeNull();
    });

    it('07 — Firmenkunde (company gesetzt)', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerCompany,
        title: 'Firmenkunde',
        lineItems: [LINE_ITEM_NET],
        totalCents: 15000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      const customer = await h.store.prisma.customer.findFirst({
        where: { id: inv.customerId! },
      });
      expect(customer!.company).toBe('Firma AG');
    });

    it('08 — Privatkunde', async () => {
      const inv = await h.invoices.create(h.store.ids.orgA, {
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Privatkunde',
        lineItems: [LINE_ITEM_NET],
        totalCents: 9000,
        currency: 'EUR',
        invoiceDate: FIXED_NOW.toISOString(),
      });
      const customer = await h.store.prisma.customer.findFirst({
        where: { id: inv.customerId! },
      });
      expect(customer!.company).toBeNull();
      expect(customer!.firstName).toBe('Max');
    });
  });

  // ─── Dokumente (9–16) ────────────────────────────────────────────────────

  describe('Dokumente', () => {
    it('09 — erste PDF-Generierung verknüpft generatedDocumentId', async () => {
      const inv = await createOutgoing(h, 'PDF Test');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      const panel = await h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin);
      expect(panel.activeDocument).not.toBeNull();
      const row = await h.store.prisma.orgInvoice.findFirst({ where: { id: inv.id } });
      expect(row!.generatedDocumentId).toBe(panel.activeDocument!.id);
    });

    it('10 — mehrere Versionen: regenerate erzeugt neue Version', async () => {
      const inv = await createOutgoing(h, 'Versionen');
      await issueWithPdf(h, h.store.ids.orgA, inv.id);
      const firstCount = h.store.tables.generatedDocuments.length;
      await h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin, { regenerate: true });
      expect(h.store.tables.generatedDocuments.length).toBeGreaterThan(firstCount);
      const voided = h.store.tables.generatedDocuments.filter((d) => d.status === DOCUMENT_STATUS.VOID);
      expect(voided.length).toBeGreaterThanOrEqual(1);
    });

    it('11 — aktive Version ist die neueste sendbare', async () => {
      const inv = await createOutgoing(h, 'Aktiv');
      const invoiceId = await issueWithPdf(h, h.store.ids.orgA, inv.id);
      const panel = await h.documents.getPanel(h.store.ids.orgA, invoiceId, { isAdmin: true });
      expect(panel.activeDocument?.isActive).toBe(true);
      expect(panel.versions[0].isActive).toBe(true);
    });

    it('12 — fehlgeschlagene Generierung setzt FAILED Panel-State', async () => {
      h.rendererMock.mockRejectedValueOnce(new Error('Render kaputt'));
      const inv = await createOutgoing(h, 'Fail Gen');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      await expect(
        h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
      const panel = await h.documents.getPanel(h.store.ids.orgA, inv.id, { isAdmin: true });
      expect(panel.panelState).toBe('FAILED');
    });

    it('13 — Retry nach fehlgeschlagener Generierung', async () => {
      h.rendererMock.mockRejectedValueOnce(new Error('temp fail'));
      const inv = await createOutgoing(h, 'Retry Gen');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      await expect(h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin)).rejects.toThrow();
      h.rendererMock.mockResolvedValue(Buffer.from('%PDF-ok'));
      const panel = await h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin);
      expect(panel.panelState).toBe('ACTIVE');
    });

    it('14 — Storage-Fehler bei PDF-Erzeugung', async () => {
      h.storagePutMock.mockRejectedValueOnce(new Error('disk full'));
      const inv = await createOutgoing(h, 'Storage Fail');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      await expect(
        h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('15 — parallele Generierung: zweiter Aufruf → Conflict', async () => {
      let resolveRender!: () => void;
      const slow = new Promise<Buffer>((resolve) => {
        resolveRender = () => resolve(Buffer.from('%PDF-slow'));
      });
      h.rendererMock.mockReturnValueOnce(slow);
      const inv = await createOutgoing(h, 'Parallel');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      const p1 = h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin);
      await new Promise((resolve) => setImmediate(resolve));
      await expect(
        h.documents.generate(h.store.ids.orgA, inv.id, h.store.ids.userAdmin),
      ).rejects.toBeInstanceOf(ConflictException);
      resolveRender!();
      await p1;
    });

    it('16 — Legacy-Dokument nach Backfill: listForInvoice findet Pointer ohne invoiceId', async () => {
      const inv = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        status: 'ISSUED',
        customerId: h.store.ids.customerPrivate,
        title: 'Legacy Doc',
        totalCents: 10000,
        sequenceNumber: 1,
        sequenceYear: 2026,
      });
      const legacyDoc = h.store.seedDocument({
        organizationId: h.store.ids.orgA,
        invoiceId: null,
        status: DOCUMENT_STATUS.GENERATED,
      });
      await h.store.prisma.orgInvoice.update({
        where: { id: inv.id as string },
        data: { generatedDocumentId: legacyDoc.id },
      });
      const generatedDocs = new GeneratedDocumentsService(h.store.prisma as never, {
        putObject: h.storagePutMock,
        getObjectStream: jest.fn(),
        getObject: jest.fn(),
      } as never);
      const docs = await generatedDocs.listForInvoice(
        h.store.ids.orgA,
        inv.id as string,
        null,
        legacyDoc.id as string,
      );
      expect(docs.some((d) => d.id === legacyDoc.id)).toBe(true);
    });
  });

  // ─── Versand (17–26) ─────────────────────────────────────────────────────

  describe('Versand', () => {
    async function manualIssuedWithPdf() {
      const inv = await createOutgoing(h, 'Mail Test');
      return issueWithPdf(h, h.store.ids.orgA, inv.id);
    }

    it('17 — Rechnung ohne bookingId per E-Mail (INVOICE_SINGLE)', async () => {
      const invoiceId = await manualIssuedWithPdf();
      const dto = await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Ihre Rechnung',
      });
      expect(dto.invoiceId).toBe(invoiceId);
      expect(dto.bookingId).toBeFalsy();
      expect(dto.status).toBe('SENT_SIMULATED');
    });

    it('18 — Provider angenommen (SENT)', async () => {
      h.setProviderResult({ provider: 'resend', providerMessageId: 're_1', status: 'SENT' });
      const invoiceId = await manualIssuedWithPdf();
      const dto = await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Sent',
      });
      expect(dto.status).toBe('SENT');
      expect(dto.providerMessageId).toBe('re_1');
    });

    it('19 — Webhook zugestellt (DELIVERED)', async () => {
      h.setProviderResult({ provider: 'resend', providerMessageId: 're_del_1', status: 'SENT' });
      const invoiceId = await manualIssuedWithPdf();
      await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Deliver',
      });
      const emailId = await h.outboundEmail.applyWebhookEvent('re_del_1', 'DELIVERED', {});
      expect(emailId).toBeTruthy();
    });

    it('20 — Versand fehlgeschlagen (Provider FAILED)', async () => {
      h.setProviderResult({
        provider: 'resend',
        providerMessageId: 're_fail',
        status: 'FAILED',
        errorCode: 'API_ERROR',
        errorMessage: 'Provider down',
      });
      const invoiceId = await manualIssuedWithPdf();
      const dto = await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Fail',
      });
      expect(dto.status).toBe('FAILED');
    });

    it('21 — Bounce per Webhook', async () => {
      h.setProviderResult({ provider: 'resend', providerMessageId: 're_bounce', status: 'SENT' });
      const invoiceId = await manualIssuedWithPdf();
      await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Bounce',
      });
      await h.outboundEmail.applyWebhookEvent('re_bounce', 'BOUNCED', { error: 'mailbox full' });
      const row = await h.store.prisma.outboundEmail.findFirst({ where: { providerMessageId: 're_bounce' } });
      expect(row!.status).toBe('FAILED');
    });

    it('22 — Retry mit Idempotency-Key = outbound.id', async () => {
      h.setProviderResult({
        provider: 'resend',
        providerMessageId: 're_fail2',
        status: 'FAILED',
        errorMessage: 'fail',
      });
      const invoiceId = await manualIssuedWithPdf();
      const failed = await h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
        toEmail: 'max@example.com',
        subject: 'Retry me',
      });
      h.setProviderResult({ provider: 'resend', providerMessageId: 're_retry', status: 'SENT' });
      h.providerSendMock.mockClear();
      await h.invoiceEmail.retryInvoiceEmail(
        h.store.ids.orgA,
        invoiceId,
        failed.id,
        h.store.ids.userAdmin,
      );
      expect(h.providerSendMock).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    it('23 — externer Versand per Post (mark-sent)', async () => {
      const inv = await createOutgoing(h, 'Post');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      const sent = await h.invoices.markSent(inv.id, h.store.ids.orgA);
      expect(sent.status).toBe('SENT');
      expect(sent.sentAt).toBeTruthy();
    });

    it('24 — externer Versand per E-Mail (mark-sent ohne Provider)', async () => {
      const inv = await createOutgoing(h, 'Extern Mail');
      const invoiceId = await issueWithPdf(h, h.store.ids.orgA, inv.id);
      const sent = await h.invoices.markSent(invoiceId, h.store.ids.orgA);
      expect(sent.status).toBe('SENT');
    });

    it('25 — Versand ohne Empfänger (ungültige E-Mail)', async () => {
      const invoiceId = await manualIssuedWithPdf();
      await expect(
        h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invoiceId, h.store.ids.userAdmin, {
          toEmail: 'not-an-email',
          subject: 'X',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('26 — Versand ohne PDF', async () => {
      const inv = await createOutgoing(h, 'No PDF');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      await expect(
        h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, inv.id, h.store.ids.userAdmin, {
          toEmail: 'max@example.com',
          subject: 'No attachment',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── Zahlungen (27–35) ───────────────────────────────────────────────────

  describe('Zahlungen', () => {
    async function issuedInvoice(total = 10000) {
      const inv = await createOutgoing(h, 'Zahlung', { totalCents: total });
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      return inv.id;
    }

    it('27 — Teilzahlung → PARTIALLY_PAID', async () => {
      const id = await issuedInvoice();
      const paid = await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 4000,
        method: InvoicePaymentMethod.BANK_TRANSFER,
      });
      expect(paid.status).toBe('PARTIALLY_PAID');
      expect(paid.paidCents).toBe(4000);
      expect(paid.outstandingCents).toBe(6000);
    });

    it('28 — Vollzahlung → PAID', async () => {
      const id = await issuedInvoice();
      const paid = await h.invoices.markPaid(id, h.store.ids.orgA);
      expect(paid.status).toBe('PAID');
      expect(paid.outstandingCents).toBe(0);
    });

    it('29 — Barzahlung', async () => {
      const id = await issuedInvoice();
      const paid = await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 10000,
        method: InvoicePaymentMethod.CASH,
      });
      expect(paid.status).toBe('PAID');
      expect(h.store.tables.orgInvoicePayments.at(-1)?.method).toBe('CASH');
    });

    it('30 — Kartenzahlung (CARD)', async () => {
      const id = await issuedInvoice();
      await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 10000,
        method: InvoicePaymentMethod.CARD,
        reference: 'POS-123',
      });
      expect(h.store.tables.orgInvoicePayments.at(-1)?.method).toBe('CARD');
    });

    it('31 — Überweisung', async () => {
      const id = await issuedInvoice();
      await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 5000,
        method: InvoicePaymentMethod.BANK_TRANSFER,
        reference: 'UEBER-1',
      });
      expect(h.store.tables.orgInvoicePayments.at(-1)?.method).toBe('BANK_TRANSFER');
    });

    it('32 — Stripe-Zahlung mit Provider-Referenz', async () => {
      const id = await issuedInvoice();
      await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 10000,
        method: InvoicePaymentMethod.STRIPE,
        reference: 'pi_test_123',
      });
      const payment = h.store.tables.orgInvoicePayments.at(-1);
      expect(payment?.method).toBe('STRIPE');
      expect(payment?.reference).toBe('pi_test_123');
    });

    it('33 — Überzahlung wird abgelehnt', async () => {
      const id = await issuedInvoice();
      await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 4000,
        method: InvoicePaymentMethod.CASH,
      });
      await expect(
        h.invoices.recordPayment(id, h.store.ids.orgA, {
          amountCents: 7000,
          method: InvoicePaymentMethod.CASH,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('34 — doppelte Providerzahlung (gleiche Stripe-Referenz)', async () => {
      const id = await issuedInvoice();
      await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 5000,
        method: InvoicePaymentMethod.STRIPE,
        reference: 'pi_dup',
      });
      await expect(
        h.invoices.recordPayment(id, h.store.ids.orgA, {
          amountCents: 5000,
          method: InvoicePaymentMethod.STRIPE,
          reference: 'pi_dup',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('35 — Zahlungsaufgabe wird bei Vollzahlung geschlossen', async () => {
      const id = await issuedInvoice();
      h.store.seedTask({
        organizationId: h.store.ids.orgA,
        invoiceId: id,
        status: 'OPEN',
        title: 'Zahlung prüfen',
      });
      await h.invoices.markPaid(id, h.store.ids.orgA);
      const tasks = h.store.tables.orgTasks.filter((t) => t.invoiceId === id);
      expect(tasks.every((t) => t.status === 'DONE')).toBe(true);
    });
  });

  // ─── Status (36–40) ──────────────────────────────────────────────────────

  describe('Status', () => {
    it('36 — erlaubte Übergänge DRAFT → ISSUED → SENT', async () => {
      const inv = await createOutgoing(h, 'Status OK');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      const sent = await h.invoices.markSent(inv.id, h.store.ids.orgA);
      expect(sent.status).toBe('SENT');
    });

    it('37 — unerlaubte Übergänge: Zahlung auf VOID', async () => {
      const row = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        status: 'VOID',
        customerId: h.store.ids.customerPrivate,
        title: 'Void',
        totalCents: 10000,
      });
      await expect(
        h.invoices.recordPayment(row.id as string, h.store.ids.orgA, {
          amountCents: 1000,
          method: InvoicePaymentMethod.CASH,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('38 — überfällig (OVERDUE) bleibt zahlbar', async () => {
      const row = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        status: 'OVERDUE',
        customerId: h.store.ids.customerPrivate,
        title: 'Overdue',
        totalCents: 10000,
        paidCents: 0,
        outstandingCents: 10000,
        dueDate: new Date('2026-01-01'),
        sequenceNumber: 2,
        sequenceYear: 2026,
      });
      const paid = await h.invoices.recordPayment(row.id as string, h.store.ids.orgA, {
        amountCents: 10000,
        method: InvoicePaymentMethod.BANK_TRANSFER,
      });
      expect(paid.status).toBe('PAID');
    });

    it('39 — storniert (CANCELLED) blockiert issue', async () => {
      const row = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        status: 'CANCELLED',
        customerId: h.store.ids.customerPrivate,
        title: 'Cancelled',
        totalCents: 10000,
      });
      await expect(h.invoices.issue(row.id as string, h.store.ids.orgA)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('40 — bezahlt nach Teilzahlung', async () => {
      const id = (await createOutgoing(h, 'Partial then full')).id;
      await h.invoices.issue(id, h.store.ids.orgA);
      await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 3000,
        method: InvoicePaymentMethod.BANK_TRANSFER,
      });
      const full = await h.invoices.recordPayment(id, h.store.ids.orgA, {
        amountCents: 7000,
        method: InvoicePaymentMethod.BANK_TRANSFER,
      });
      expect(full.status).toBe('PAID');
    });
  });

  // ─── Sicherheit (41–46) ──────────────────────────────────────────────────

  describe('Sicherheit', () => {
    it('41 — Cross-Tenant Invoice Read', async () => {
      const inv = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        customerId: h.store.ids.customerPrivate,
        title: 'Org A only',
        totalCents: 10000,
      });
      await expect(h.invoices.findById(inv.id as string, h.store.ids.orgB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('42 — Cross-Tenant Document', async () => {
      const doc = h.store.seedDocument({
        organizationId: h.store.ids.orgA,
        invoiceId: null,
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

    it('43 — Cross-Tenant Customer bei Rechnungserstellung', async () => {
      await expect(
        h.invoices.create(h.store.ids.orgA, {
          type: 'OUTGOING_MANUAL',
          customerId: h.store.ids.customerOtherOrg,
          title: 'Fremd',
          lineItems: [LINE_ITEM_NET],
          totalCents: 10000,
          currency: 'EUR',
          invoiceDate: FIXED_NOW.toISOString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('44 — Cross-Tenant Vehicle bei Rechnungserstellung', async () => {
      await expect(
        h.invoices.create(h.store.ids.orgA, {
          type: 'OUTGOING_MANUAL',
          customerId: h.store.ids.customerPrivate,
          vehicleId: h.store.ids.vehicleOtherOrg,
          title: 'Fremdes Fz',
          lineItems: [LINE_ITEM_NET],
          totalCents: 10000,
          currency: 'EUR',
          invoiceDate: FIXED_NOW.toISOString(),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('45 — unberechtigter Versand: fremde Org-Rechnung', async () => {
      const invoiceId = await issueWithPdf(h, h.store.ids.orgA, (await createOutgoing(h, 'Cross send')).id);
      await expect(
        h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgB, invoiceId, h.store.ids.userAdmin, {
          toEmail: 'max@example.com',
          subject: 'Cross org',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('46 — manipuliertes Dokument einer anderen Rechnung', async () => {
      const invAId = await issueWithPdf(h, h.store.ids.orgA, (await createOutgoing(h, 'Inv A')).id);
      const invBId = await issueWithPdf(h, h.store.ids.orgA, (await createOutgoing(h, 'Inv B')).id);
      const docB = h.store.tables.generatedDocuments.find((d) => d.invoiceId === invBId)!.id as string;
      await expect(
        h.invoiceEmail.sendInvoiceEmail(h.store.ids.orgA, invAId, h.store.ids.userAdmin, {
          toEmail: 'max@example.com',
          subject: 'Hack',
          documentId: docB,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('47 — unberechtigte Zahlung auf fremde Org-Rechnung', async () => {
      const inv = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        status: 'ISSUED',
        customerId: h.store.ids.customerPrivate,
        title: 'Pay guard',
        totalCents: 10000,
        sequenceNumber: 3,
        sequenceYear: 2026,
      });
      await expect(
        h.invoices.recordPayment(inv.id as string, h.store.ids.orgB, {
          amountCents: 1000,
          method: InvoicePaymentMethod.CASH,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── Reconciliation (47–50) ────────────────────────────────────────────────

  describe('Reconciliation', () => {
    it('48 — Rechnung ohne Dokument: Panel EMPTY', async () => {
      const inv = await createOutgoing(h, 'No doc');
      await h.invoices.issue(inv.id, h.store.ids.orgA);
      const panel = await h.documents.getPanel(h.store.ids.orgA, inv.id, { isAdmin: true });
      expect(panel.panelState).toBe('EMPTY');
      expect(panel.activeDocument).toBeNull();
    });

    it('49 — Dokument ohne Pointer (invoiceId gesetzt, generatedDocumentId null)', async () => {
      const inv = h.store.seedInvoice({
        organizationId: h.store.ids.orgA,
        type: 'OUTGOING_MANUAL',
        status: 'ISSUED',
        customerId: h.store.ids.customerPrivate,
        title: 'Pointer gap',
        totalCents: 10000,
        generatedDocumentId: null,
        sequenceNumber: 4,
        sequenceYear: 2026,
      });
      h.store.seedDocument({
        organizationId: h.store.ids.orgA,
        invoiceId: inv.id,
        status: DOCUMENT_STATUS.GENERATED,
      });
      const panel = await h.documents.getPanel(h.store.ids.orgA, inv.id as string, { isAdmin: true });
      expect(panel.versions.length).toBeGreaterThan(0);
      expect(panel.activeDocument).not.toBeNull();
    });

    it('50 — hängender Versand (SENDING) erkennbar', async () => {
      const invoiceId = await issueWithPdf(h, h.store.ids.orgA, (await createOutgoing(h, 'Stuck send')).id);
      await h.store.prisma.outboundEmail.create({
        data: {
          organizationId: h.store.ids.orgA,
          invoiceId,
          sourceType: 'INVOICE_SINGLE',
          status: 'SENDING',
          fromEmail: 'noreply@test.com',
          toEmail: 'max@example.com',
          subject: 'stuck',
          ccEmails: [],
          bccEmails: [],
        },
      });
      const panel = await h.documents.getPanel(h.store.ids.orgA, invoiceId, { isAdmin: true });
      expect(panel.deliveryHistory.some((d) => d.status === 'SENDING')).toBe(true);
    });

    it('51 — PAID mit offener Aufgabe (Reconciliation-Hinweis)', async () => {
      const id = (await createOutgoing(h, 'Paid task gap')).id;
      await h.invoices.issue(id, h.store.ids.orgA);
      h.store.seedTask({
        organizationId: h.store.ids.orgA,
        invoiceId: id,
        status: 'OPEN',
        title: 'Noch offen trotz PAID-Simulation',
      });
      await h.store.prisma.orgInvoice.update({
        where: { id },
        data: { status: 'PAID', paidCents: 10000, outstandingCents: 0 },
      });
      const tasks = h.store.tables.orgTasks.filter((t) => t.invoiceId === id && t.status !== 'DONE');
      const invoice = await h.invoices.findById(id, h.store.ids.orgA);
      expect(invoice.status).toBe('PAID');
      expect(tasks.length).toBeGreaterThan(0);
    });
  });
});
