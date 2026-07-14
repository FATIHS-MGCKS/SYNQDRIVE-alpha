import { OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import {
  BOOKING_REF,
  DOC_BOOKING_INVOICE,
  INVOICE_BOOKING,
  ORG_A,
  ORG_B,
} from './__fixtures__/invoice-baseline.fixtures';
import {
  isActionAlreadyApplied,
  pickUnambiguousActiveDocument,
  planInvoiceDocumentRepairs,
} from './invoice-document-backfill.planner';
import type { InvoiceDocumentBackfillDataRow } from './invoice-document-backfill.types';

describe('invoice-document-backfill.planner', () => {
  const invoice = {
    id: INVOICE_BOOKING,
    organizationId: ORG_A,
    type: OrgInvoiceType.OUTGOING_BOOKING,
    status: OrgInvoiceStatus.ISSUED,
    bookingId: BOOKING_REF,
    generatedDocumentId: null as string | null,
  };

  const document = {
    id: DOC_BOOKING_INVOICE,
    organizationId: ORG_A,
    documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
    status: DOCUMENT_STATUS.GENERATED,
    bookingId: BOOKING_REF,
    invoiceId: INVOICE_BOOKING,
    versionNumber: null as number | null,
    isActiveVersion: false,
    objectKey: 'organizations/org/doc.pdf',
    createdAt: new Date('2026-07-10T10:10:00.000Z'),
  };

  it('plans sync_cache_from_document when invoiceId set but cache empty', () => {
    const { actions } = planInvoiceDocumentRepairs({
      invoices: [invoice],
      documents: [document],
      bundles: [],
    });
    expect(actions.some((a) => a.kind === 'sync_cache_from_document')).toBe(true);
  });

  it('plans sync_invoice_id_from_cache when cache set but invoiceId missing', () => {
    const { actions } = planInvoiceDocumentRepairs({
      invoices: [{ ...invoice, generatedDocumentId: DOC_BOOKING_INVOICE }],
      documents: [{ ...document, invoiceId: null }],
      bundles: [],
    });
    expect(actions.some((a) => a.kind === 'sync_invoice_id_from_cache')).toBe(true);
  });

  it('skips organization mismatch', () => {
    const { skipped } = planInvoiceDocumentRepairs({
      invoices: [invoice],
      documents: [{ ...document, organizationId: ORG_B }],
      bundles: [],
    });
    expect(skipped.some((s) => s.checkId === 'organization_mismatch')).toBe(true);
  });

  it('skips multiple active candidates when tie on createdAt', () => {
    const { skipped } = planInvoiceDocumentRepairs({
      invoices: [invoice],
      documents: [
        document,
        {
          ...document,
          id: 'doc-b',
          createdAt: new Date('2026-07-10T10:10:00.000Z'),
        },
      ],
      bundles: [],
    });
    expect(skipped.some((s) => s.checkId === 'multiple_active_candidates')).toBe(true);
  });

  it('picks unambiguous newer document as active winner', () => {
    const winner = pickUnambiguousActiveDocument([
      document,
      {
        ...document,
        id: 'doc-newer',
        createdAt: new Date('2026-07-12T10:10:00.000Z'),
      },
    ]);
    expect(winner?.id).toBe('doc-newer');
  });

  it('assigns version numbers chronologically', () => {
    const { actions } = planInvoiceDocumentRepairs({
      invoices: [invoice],
      documents: [
        { ...document, id: 'v1', createdAt: new Date('2026-07-10T10:00:00.000Z') },
        {
          ...document,
          id: 'v2',
          createdAt: new Date('2026-07-11T10:00:00.000Z'),
        },
      ],
      bundles: [],
    });
    const versionActions = actions.filter((a) => a.kind === 'assign_version_numbers');
    expect(versionActions).toHaveLength(2);
    expect(versionActions.map((a) => a.after.versionNumber).sort()).toEqual([1, 2]);
  });

  it('is idempotent when state already matches planned action', () => {
    const { actions } = planInvoiceDocumentRepairs({
      invoices: [{ ...invoice, generatedDocumentId: DOC_BOOKING_INVOICE }],
      documents: [{ ...document, isActiveVersion: true }],
      bundles: [],
    });
    const cacheAction = actions.find((a) => a.kind === 'sync_cache_from_document');
    expect(cacheAction).toBeUndefined();
    expect(
      isActionAlreadyApplied(
        {
          actionId: 'x',
          kind: 'sync_cache_from_document',
          organizationId: ORG_A,
          invoiceId: INVOICE_BOOKING,
          documentId: DOC_BOOKING_INVOICE,
          reason: '',
          before: {},
          after: { invoiceGeneratedDocumentId: DOC_BOOKING_INVOICE, documentIsActiveVersion: 1 },
        },
        { ...invoice, generatedDocumentId: DOC_BOOKING_INVOICE },
        { ...document, isActiveVersion: true },
      ),
    ).toBe(true);
  });

  it('does not plan cross-tenant repairs', () => {
    const { actions } = planInvoiceDocumentRepairs({
      invoices: [{ ...invoice, organizationId: ORG_A }],
      documents: [{ ...document, organizationId: ORG_B, invoiceId: INVOICE_BOOKING }],
      bundles: [],
    });
    expect(actions.filter((a) => a.kind === 'sync_cache_from_document')).toHaveLength(0);
  });
});

describe('invoice-document-backfill.planner — bundle sync', () => {
  const data: InvoiceDocumentBackfillDataRow = {
    invoices: [
      {
        id: INVOICE_BOOKING,
        organizationId: ORG_A,
        type: OrgInvoiceType.OUTGOING_BOOKING,
        status: OrgInvoiceStatus.ISSUED,
        bookingId: BOOKING_REF,
        generatedDocumentId: null,
      },
    ],
    documents: [
      {
        id: DOC_BOOKING_INVOICE,
        organizationId: ORG_A,
        documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
        status: DOCUMENT_STATUS.GENERATED,
        bookingId: BOOKING_REF,
        invoiceId: null,
        versionNumber: null,
        isActiveVersion: false,
        objectKey: 'key.pdf',
        createdAt: new Date(),
      },
    ],
    bundles: [
      {
        id: 'bundle-1',
        organizationId: ORG_A,
        bookingId: BOOKING_REF,
        bookingInvoiceDocumentId: DOC_BOOKING_INVOICE,
        finalInvoiceDocumentId: null,
      },
    ],
  };

  it('plans bundle pointer sync when invoice is unique', () => {
    const { actions } = planInvoiceDocumentRepairs(data);
    expect(actions.some((a) => a.kind === 'sync_from_bundle_pointer')).toBe(true);
  });
});
