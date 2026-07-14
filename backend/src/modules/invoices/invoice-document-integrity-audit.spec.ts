import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { BUNDLE_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import {
  BOOKING_REF,
  DOC_BOOKING_INVOICE,
  INVOICE_BOOKING,
  ORG_A,
} from './__fixtures__/invoice-baseline.fixtures';
import { InvoiceDocumentIntegrityAuditService } from './invoice-document-integrity-audit.service';

describe('InvoiceDocumentIntegrityAuditService', () => {
  const service = new InvoiceDocumentIntegrityAuditService({} as never);

  const baseInvoice = {
    id: INVOICE_BOOKING,
    organizationId: ORG_A,
    type: OrgInvoiceType.OUTGOING_BOOKING,
    status: OrgInvoiceStatus.ISSUED,
    bookingId: BOOKING_REF,
    generatedDocumentId: null as string | null,
  };

  const baseDocument: {
    id: string;
    organizationId: string;
    documentType: string;
    status: string;
    bookingId: string | null;
    invoiceId: string | null;
    versionNumber: number | null;
    isActiveVersion: boolean;
    generationStatus: string | null;
    objectKey: string;
    createdAt: Date;
  } = {
    id: DOC_BOOKING_INVOICE,
    organizationId: ORG_A,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    status: DOCUMENT_STATUS.GENERATED,
    bookingId: BOOKING_REF,
    invoiceId: INVOICE_BOOKING,
    versionNumber: null as number | null,
    isActiveVersion: false,
    generationStatus: null as string | null,
    objectKey: 'organizations/org/bookings/bk/doc.pdf',
    createdAt: new Date('2026-07-10T10:10:00.000Z'),
  };

  const emptyContext = {
    invoices: [] as typeof baseInvoice[],
    documents: [] as typeof baseDocument[],
    bundles: [] as Array<{
      id: string;
      organizationId: string;
      bookingId: string;
      status: string;
      bookingInvoiceDocumentId: string | null;
      finalInvoiceDocumentId: string | null;
    }>,
    bookings: [] as Array<{ id: string; organizationId: string }>,
  };

  function run(overrides: Partial<typeof emptyContext> = {}) {
    return service.auditOrganizationData({ ...emptyContext, ...overrides });
  }

  it('detects cache_document_missing when generatedDocumentId points to absent document', () => {
    const findings = run({
      invoices: [{ ...baseInvoice, generatedDocumentId: 'missing-doc-id' }],
    });
    expect(findings.some((f) => f.checkId === 'cache_document_missing')).toBe(true);
    expect(findings.find((f) => f.checkId === 'cache_document_missing')?.repairClass).toBe(
      'AUTO_FIX_SAFE',
    );
  });

  it('detects cache_document_invoice_mismatch when cache doc belongs to another invoice', () => {
    const otherInvoiceId = 'other-invoice-id-0001';
    const findings = run({
      invoices: [{ ...baseInvoice, generatedDocumentId: DOC_BOOKING_INVOICE }],
      documents: [{ ...baseDocument, invoiceId: otherInvoiceId }],
    });
    expect(findings.some((f) => f.checkId === 'cache_document_invoice_mismatch')).toBe(true);
  });

  it('detects invoice_missing_active_pointer (known Ist divergence)', () => {
    const findings = run({
      invoices: [{ ...baseInvoice, generatedDocumentId: null }],
      documents: [baseDocument],
    });
    expect(findings.some((f) => f.checkId === 'invoice_missing_active_pointer')).toBe(true);
  });

  it('detects multiple_active_documents when multiple isActiveVersion flags are set', () => {
    const findings = run({
      invoices: [baseInvoice],
      documents: [
        { ...baseDocument, id: 'doc-a', isActiveVersion: true },
        {
          ...baseDocument,
          id: 'doc-b',
          isActiveVersion: true,
          createdAt: new Date('2026-07-11T10:10:00.000Z'),
        },
      ],
    });
    expect(findings.some((f) => f.checkId === 'multiple_active_documents')).toBe(true);
  });

  it('detects duplicate_version_numbers', () => {
    const findings = run({
      invoices: [baseInvoice],
      documents: [
        { ...baseDocument, id: 'doc-v1', versionNumber: 1 },
        { ...baseDocument, id: 'doc-v1b', versionNumber: 1 },
      ],
    });
    expect(findings.some((f) => f.checkId === 'duplicate_version_numbers')).toBe(true);
  });

  it('detects invoice_doc_without_invoice_link for invoice PDFs without invoiceId', () => {
    const findings = run({
      documents: [{ ...baseDocument, invoiceId: null }],
    });
    expect(findings.some((f) => f.checkId === 'invoice_doc_without_invoice_link')).toBe(true);
  });

  it('detects orphan_invoice_id_on_document when invoice row is absent from scan set', () => {
    const findings = run({
      documents: [{ ...baseDocument, invoiceId: 'ghost-invoice-id' }],
    });
    expect(findings.some((f) => f.checkId === 'orphan_invoice_id_on_document')).toBe(true);
  });

  it('detects bundle_doc_not_linked_to_invoice when bundle pointer doc has no invoice link', () => {
    const findings = run({
      invoices: [baseInvoice],
      documents: [{ ...baseDocument, invoiceId: null }],
      bundles: [
        {
          id: 'bundle-1',
          organizationId: ORG_A,
          bookingId: BOOKING_REF,
          status: BUNDLE_STATUS.COMPLETE,
          bookingInvoiceDocumentId: DOC_BOOKING_INVOICE,
          finalInvoiceDocumentId: null,
        },
      ],
      bookings: [{ id: BOOKING_REF, organizationId: ORG_A }],
    });
    expect(findings.some((f) => f.checkId === 'bundle_doc_not_linked_to_invoice')).toBe(true);
  });

  it('detects booking_invoice_without_document for issued booking invoice without PDF link', () => {
    const findings = run({
      invoices: [baseInvoice],
      documents: [],
      bookings: [{ id: BOOKING_REF, organizationId: ORG_A }],
    });
    expect(findings.some((f) => f.checkId === 'booking_invoice_without_document')).toBe(true);
  });

  it('detects document_completed_without_storage when status is success-like but objectKey empty', () => {
    const findings = run({
      documents: [{ ...baseDocument, objectKey: '' }],
    });
    expect(findings.some((f) => f.checkId === 'document_completed_without_storage')).toBe(true);
  });

  it('detects document_file_with_bad_status when file exists but status is VOID', () => {
    const findings = run({
      documents: [{ ...baseDocument, status: DOCUMENT_STATUS.VOID }],
    });
    expect(findings.some((f) => f.checkId === 'document_file_with_bad_status')).toBe(true);
  });

  it('detects multiple_active_candidates when several non-VOID docs share invoice+type', () => {
    const findings = run({
      invoices: [baseInvoice],
      documents: [
        baseDocument,
        {
          ...baseDocument,
          id: 'doc-newer',
          createdAt: new Date('2026-07-12T10:10:00.000Z'),
        },
      ],
    });
    expect(findings.some((f) => f.checkId === 'multiple_active_candidates')).toBe(true);
  });

  it('detects ambiguous_legacy_assignment when multiple invoices match booking+type', () => {
    const findings = run({
      invoices: [
        baseInvoice,
        {
          ...baseInvoice,
          id: 'invoice-dup',
          generatedDocumentId: null,
        },
      ],
      documents: [{ ...baseDocument, invoiceId: null }],
      bookings: [{ id: BOOKING_REF, organizationId: ORG_A }],
    });
    expect(findings.some((f) => f.checkId === 'ambiguous_legacy_assignment')).toBe(true);
  });

  it('detects organization_mismatch between document and booking org', () => {
    const findings = run({
      documents: [{ ...baseDocument, organizationId: ORG_A }],
      bookings: [{ id: BOOKING_REF, organizationId: 'other-org-id-99999999' }],
    });
    expect(findings.some((f) => f.checkId === 'organization_mismatch')).toBe(true);
  });

  it('returns no findings for a consistent invoice-document link with matching cache pointer', () => {
    const findings = run({
      invoices: [{ ...baseInvoice, generatedDocumentId: DOC_BOOKING_INVOICE }],
      documents: [{ ...baseDocument, isActiveVersion: true }],
      bookings: [{ id: BOOKING_REF, organizationId: ORG_A }],
    });
    const unexpected = findings.filter(
      (f) =>
        ![
          'invoice_doc_without_invoice_link',
          'bundle_doc_not_linked_to_invoice',
          'booking_invoice_without_document',
        ].includes(f.checkId),
    );
    expect(unexpected).toHaveLength(0);
  });
});
