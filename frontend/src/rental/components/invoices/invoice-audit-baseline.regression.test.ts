/**
 * Audit baseline — UI/mapper regressions for invoice function.
 * See docs/audits/invoice-function-test-safety-net.md
 */
import { describe, expect, it } from 'vitest';

import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import {
  buildInvoiceProvenance,
  buildInvoiceRelationsDto,
} from './invoiceRelations.mapper';
import { invoicePaymentMethodLabel } from './invoicePayments.mapper';
import type { Invoice } from './invoiceTypes';

const t = (key: TranslationKey) => de[key] ?? key;

const rawApiInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  invoiceNumber: 7,
  invoiceNumberDisplay: 'FSM-2026-0007',
  type: 'OUTGOING_BOOKING',
  customerId: 'cust-11111111-2222-3333-4444-555555555555',
  vendorId: null,
  vendorName: null,
  bookingId: 'book-99999999-8888-7777-6666-555555555555',
  vehicleId: 'veh-12345678-abcd-ef01-2345-678901234567',
  title: 'Mietrechnung',
  description: '',
  lineItems: null,
  subtotalCents: 10000,
  taxCents: 1900,
  totalCents: 11900,
  paidCents: 0,
  outstandingCents: 11900,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  generatedDocumentId: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

/** Naive audit-era provenance — anti-pattern we must not reintroduce in UI. */
function naiveProvenanceFromTypeOnly(invoice: Invoice): string {
  if (invoice.type === 'OUTGOING_BOOKING') return 'Automatisch (Buchung)';
  if (invoice.type === 'INCOMING_UPLOADED' || invoice.documentExtractionId) return 'Document Extraction';
  return 'Manuell';
}

describe('Invoice audit baseline — UI regressions', () => {
  describe('06 Roh-API ohne Enrichment → kein Verknüpft/UUID in Relations-DTO', () => {
    it('audit-06a — ohne Lookup-Daten: Buchungsnummer aus ID-Suffix, kein „Verknüpft“', () => {
      const relations = buildInvoiceRelationsDto(rawApiInvoice(), {
        customerFetchState: 'error',
        bookingFetchState: 'error',
        vehicleFetchState: 'error',
      });
      expect(relations.customer?.primary).not.toBe('Verknüpft');
      expect(relations.booking?.primary).toBe('BK-555555');
      expect(relations.booking?.primary).not.toContain('book-9999');
      expect(relations.vehicle?.primary).not.toMatch(/^veh-/);
    });

    it('audit-06b — Detail-DTO zeigt keine Roh-UUID in invoiceNumberDisplay', () => {
      const dto = buildInvoiceDetailDto(rawApiInvoice(), { canManageEmail: true });
      expect(dto.core.invoiceNumberDisplay).toBe('FSM-2026-0007');
      expect(dto.core.invoiceNumberDisplay).not.toContain('inv-aaaa');
    });
  });

  describe('07 Herkunft aus echter Provenance, nicht nur Rechnungstyp', () => {
    it('audit-07 — buildInvoiceProvenance ersetzt naive Typ-Ableitung', () => {
      const invoice = rawApiInvoice();
      const naive = naiveProvenanceFromTypeOnly(invoice);
      expect(naive).toBe('Automatisch (Buchung)');

      const provenance = buildInvoiceProvenance(invoice, {
        createdByUserName: 'Anna Admin',
        bookingFetchState: 'ok',
        booking: {
          core: {
            bookingId: invoice.bookingId!,
            bookingNumber: 'BK-555555',
            organizationId: 'org-1',
            status: 'CONFIRMED',
            statusEnum: 'CONFIRMED',
            startDate: '2026-07-10T08:00:00.000Z',
            endDate: '2026-07-12T18:00:00.000Z',
            notes: '[synq:wizard-draft]',
            pickupStationId: null,
            returnStationId: null,
            pickupStationName: null,
            returnStationName: null,
            createdAt: '2026-07-01T08:00:00.000Z',
            updatedAt: '2026-07-01T08:00:00.000Z',
            cancelledAt: null,
            completedAt: null,
            kmIncluded: null,
            kmDriven: null,
            insuranceOptions: [],
            extras: [],
            currency: 'EUR',
            isOneWayRental: false,
            pickupAddressOverride: null,
            returnAddressOverride: null,
          },
        } as never,
      });
      expect(provenance.erstelltUeber).not.toBe(naive);
      expect(provenance.erstelltUeber).toBe('Buchungsassistent');
      expect(provenance.quelle).toContain('BK-555555');
    });
  });

  describe('09 Rechnungsversand ohne bookingId wenn PDF vorhanden', () => {
    it('audit-09 — sendEmail erlaubt ohne bookingId bei generiertem Dokument', () => {
      const dto = buildInvoiceDetailDto(
        rawApiInvoice({ bookingId: null, generatedDocumentId: 'doc-1' }),
        { canManageEmail: true },
      );
      expect(dto.primary.sendEmail.allowed).toBe(true);
      expect(dto.primary.sendEmail.reason).toBeFalsy();
    });

    it.todo(
      'audit-09-future — Legacy InvoicesView: E-Mail weiterhin an bookingId gebunden (bis vollständige Migration)',
    );
  });

  describe('10 CARD — technischer Enum in API, lokalisiert in UI', () => {
    it('audit-10 — Mapper übersetzt CARD für Anzeige', () => {
      expect(invoicePaymentMethodLabel('CARD', t)).toBe('Karte');
      expect(invoicePaymentMethodLabel('CARD', t)).not.toBe('CARD');
    });
  });

  describe('04 Dokument ohne generatedDocumentId auf Invoice', () => {
    it('audit-04 — ohne generatedDocumentId: PDF-Aktionen gesperrt bis Generierung', () => {
      const dto = buildInvoiceDetailDto(rawApiInvoice({ generatedDocumentId: null }), {
        canManageEmail: true,
      });
      expect(dto.primary.viewPdf.allowed).toBe(false);
      expect(dto.primary.sendEmail.allowed).toBe(false);
      expect(dto.primary.sendEmail.reason).toContain('PDF muss zuerst erzeugt werden');
    });
  });
});
