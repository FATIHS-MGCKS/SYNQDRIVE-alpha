import { Injectable } from '@nestjs/common';
import { OrgInvoice, OrgInvoiceType } from '@prisma/client';
import { BUNDLE_STATUS, DOCUMENT_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ACTIVE_DOCUMENT_STATUSES,
  bundleInvoicePointerField,
  expectedDocumentTypeForInvoice,
  hasStorageKey,
  INVOICE_DOCUMENT_TYPES,
  isActiveDocumentStatus,
  isInvoiceDocumentType,
} from './invoice-document-integrity-audit.util';
import type {
  InvoiceDocumentAuditFilters,
  InvoiceDocumentIntegrityAuditReport,
  InvoiceDocumentIntegrityCheckId,
  InvoiceDocumentIntegrityFinding,
  InvoiceDocumentIntegrityOrgReport,
  InvoiceDocumentAuditSeverity,
  InvoiceDocumentRepairClass,
} from './invoice-document-integrity-audit.types';

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_FINDING_LIMIT = 250;

type InvoiceRow = Pick<
  OrgInvoice,
  | 'id'
  | 'organizationId'
  | 'type'
  | 'status'
  | 'bookingId'
  | 'generatedDocumentId'
>;

type DocumentRow = {
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
};

type BundleRow = {
  id: string;
  organizationId: string;
  bookingId: string;
  status: string;
  bookingInvoiceDocumentId: string | null;
  finalInvoiceDocumentId: string | null;
};

const CHECK_META: Record<
  InvoiceDocumentIntegrityCheckId,
  {
    severity: InvoiceDocumentAuditSeverity;
    repairClass: InvoiceDocumentRepairClass;
    label: string;
  }
> = {
  cache_document_missing: {
    severity: 'critical',
    repairClass: 'AUTO_FIX_SAFE',
    label: 'Invoice cache points to missing document',
  },
  cache_document_invoice_mismatch: {
    severity: 'error',
    repairClass: 'AUTO_FIX_WITH_RULE',
    label: 'Invoice cache document belongs to another invoice',
  },
  invoice_missing_active_pointer: {
    severity: 'warning',
    repairClass: 'AUTO_FIX_SAFE',
    label: 'Linked document exists but invoice cache is empty or stale',
  },
  multiple_active_documents: {
    severity: 'error',
    repairClass: 'MANUAL_REVIEW',
    label: 'Multiple isActiveVersion documents for same invoice + type',
  },
  duplicate_version_numbers: {
    severity: 'error',
    repairClass: 'MANUAL_REVIEW',
    label: 'Duplicate version numbers for same invoice + type',
  },
  invoice_doc_without_invoice_link: {
    severity: 'warning',
    repairClass: 'AUTO_FIX_WITH_RULE',
    label: 'Invoice-type document without invoiceId',
  },
  orphan_invoice_id_on_document: {
    severity: 'critical',
    repairClass: 'AUTO_FIX_SAFE',
    label: 'Document invoiceId references missing invoice',
  },
  organization_mismatch: {
    severity: 'critical',
    repairClass: 'UNRECOVERABLE',
    label: 'Organization mismatch across invoice, document, or booking',
  },
  bundle_doc_not_linked_to_invoice: {
    severity: 'warning',
    repairClass: 'AUTO_FIX_WITH_RULE',
    label: 'Bundle invoice pointer without matching invoice document link',
  },
  booking_invoice_without_document: {
    severity: 'warning',
    repairClass: 'MANUAL_REVIEW',
    label: 'Booking-linked invoice without generated invoice document',
  },
  document_completed_without_storage: {
    severity: 'error',
    repairClass: 'MANUAL_REVIEW',
    label: 'Successful/completed document metadata without storage key',
  },
  document_file_with_bad_status: {
    severity: 'info',
    repairClass: 'AUTO_FIX_WITH_RULE',
    label: 'Stored file present but document status is VOID/FAILED',
  },
  multiple_active_candidates: {
    severity: 'warning',
    repairClass: 'AUTO_FIX_WITH_RULE',
    label: 'Multiple active document candidates without single active flag',
  },
  ambiguous_legacy_assignment: {
    severity: 'warning',
    repairClass: 'MANUAL_REVIEW',
    label: 'Legacy document cannot be assigned to a single invoice unambiguously',
  },
};

@Injectable()
export class InvoiceDocumentIntegrityAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async runAudit(filters: InvoiceDocumentAuditFilters = {}): Promise<InvoiceDocumentIntegrityAuditReport> {
    const batchSize = filters.batchSize ?? DEFAULT_BATCH_SIZE;
    const findingLimit = filters.limit ?? DEFAULT_FINDING_LIMIT;

    const orgIds = filters.organizationId
      ? [filters.organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true }, take: batchSize })).map(
          (o) => o.id,
        );

    const organizations: InvoiceDocumentIntegrityOrgReport[] = [];
    let invoicesScanned = 0;
    let documentsScanned = 0;
    let bundlesScanned = 0;

    for (const organizationId of orgIds) {
      const invoiceWhere = {
        organizationId,
        ...(filters.invoiceId ? { id: filters.invoiceId } : {}),
      };

      const invoices = await this.prisma.orgInvoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          organizationId: true,
          type: true,
          status: true,
          bookingId: true,
          generatedDocumentId: true,
        },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });
      invoicesScanned += invoices.length;

      const invoiceIds = invoices.map((i) => i.id);
      const bookingIds = [...new Set(invoices.map((i) => i.bookingId).filter(Boolean))] as string[];

      const documents = await this.prisma.generatedDocument.findMany({
        where: {
          organizationId,
          OR: [
            { invoiceId: { in: invoiceIds.length > 0 ? invoiceIds : ['__none__'] } },
            {
              documentType: { in: [...INVOICE_DOCUMENT_TYPES] },
              ...(filters.invoiceId
                ? { OR: [{ invoiceId: filters.invoiceId }, { bookingId: { in: bookingIds } }] }
                : {}),
            },
          ],
        },
        select: {
          id: true,
          organizationId: true,
          documentType: true,
          status: true,
          bookingId: true,
          invoiceId: true,
          versionNumber: true,
          isActiveVersion: true,
          generationStatus: true,
          objectKey: true,
          createdAt: true,
        },
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });
      documentsScanned += documents.length;

      const bundles =
        bookingIds.length > 0
          ? await this.prisma.bookingDocumentBundle.findMany({
              where: { organizationId, bookingId: { in: bookingIds } },
              select: {
                id: true,
                organizationId: true,
                bookingId: true,
                status: true,
                bookingInvoiceDocumentId: true,
                finalInvoiceDocumentId: true,
              },
              take: batchSize,
            })
          : [];
      bundlesScanned += bundles.length;

      const bookings =
        bookingIds.length > 0
          ? await this.prisma.booking.findMany({
              where: { organizationId, id: { in: bookingIds } },
              select: { id: true, organizationId: true },
            })
          : [];

      const findings = this.auditOrganizationData({
        invoices,
        documents,
        bundles,
        bookings,
      });

      const limited = findings.slice(0, findingLimit);
      organizations.push(this.buildOrgReport(organizationId, limited, findings.length > findingLimit));
    }

    const allFindings = organizations.flatMap((o) => o.findings);

    return {
      mode: 'audit',
      readOnly: true,
      generatedAt: new Date().toISOString(),
      filters,
      organizationsScanned: orgIds.length,
      entitiesScanned: {
        invoices: invoicesScanned,
        documents: documentsScanned,
        bundles: bundlesScanned,
      },
      summary: this.buildSummary(allFindings),
      organizations,
    };
  }

  /** Pure analysis for tests and org-scoped scans. */
  auditOrganizationData(args: {
    invoices: InvoiceRow[];
    documents: DocumentRow[];
    bundles: BundleRow[];
    bookings: Array<{ id: string; organizationId: string }>;
  }): InvoiceDocumentIntegrityFinding[] {
    const findings: InvoiceDocumentIntegrityFinding[] = [];
    const invoiceById = new Map(args.invoices.map((i) => [i.id, i]));
    const documentById = new Map(args.documents.map((d) => [d.id, d]));
    const bookingOrgById = new Map(args.bookings.map((b) => [b.id, b.organizationId]));

    const push = (finding: Omit<InvoiceDocumentIntegrityFinding, 'severity' | 'repairClass'> & {
      checkId: InvoiceDocumentIntegrityCheckId;
    }) => {
      const meta = CHECK_META[finding.checkId];
      findings.push({
        ...finding,
        severity: meta.severity,
        repairClass: meta.repairClass,
      });
    };

    for (const invoice of args.invoices) {
      if (!invoice.generatedDocumentId) continue;
      const cached = documentById.get(invoice.generatedDocumentId);
      if (!cached) {
        push({
          checkId: 'cache_document_missing',
          organizationId: invoice.organizationId,
          message: CHECK_META.cache_document_missing.label,
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          relatedIds: { generatedDocumentId: invoice.generatedDocumentId },
        });
        continue;
      }
      if (cached.invoiceId && cached.invoiceId !== invoice.id) {
        push({
          checkId: 'cache_document_invoice_mismatch',
          organizationId: invoice.organizationId,
          message: CHECK_META.cache_document_invoice_mismatch.label,
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          relatedIds: {
            generatedDocumentId: invoice.generatedDocumentId,
            documentInvoiceId: cached.invoiceId,
          },
        });
      }
    }

    for (const doc of args.documents) {
      if (!doc.invoiceId || !isInvoiceDocumentType(doc.documentType)) continue;
      if (!isActiveDocumentStatus(doc.status)) continue;
      const invoice = invoiceById.get(doc.invoiceId);
      if (!invoice) continue;
      if (invoice.generatedDocumentId !== doc.id) {
        push({
          checkId: 'invoice_missing_active_pointer',
          organizationId: doc.organizationId,
          message: CHECK_META.invoice_missing_active_pointer.label,
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          relatedIds: {
            invoiceId: doc.invoiceId,
            invoiceGeneratedDocumentId: invoice.generatedDocumentId,
          },
        });
      }
    }

    const activeFlagGroups = new Map<string, DocumentRow[]>();
    for (const doc of args.documents) {
      if (!doc.invoiceId || !doc.isActiveVersion || !isInvoiceDocumentType(doc.documentType)) continue;
      const key = `${doc.organizationId}:${doc.invoiceId}:${doc.documentType}`;
      const group = activeFlagGroups.get(key) ?? [];
      group.push(doc);
      activeFlagGroups.set(key, group);
    }
    for (const [, group] of activeFlagGroups) {
      if (group.length <= 1) continue;
      push({
        checkId: 'multiple_active_documents',
        organizationId: group[0].organizationId,
        message: CHECK_META.multiple_active_documents.label,
        entityType: 'GeneratedDocument',
        entityId: group[0].id,
        relatedIds: { documentIds: group.map((d) => d.id).join(',') },
        details: { count: group.length, documentType: group[0].documentType },
      });
    }

    const versionGroups = new Map<string, DocumentRow[]>();
    for (const doc of args.documents) {
      if (!doc.invoiceId || doc.versionNumber == null || !isInvoiceDocumentType(doc.documentType)) continue;
      const key = `${doc.organizationId}:${doc.invoiceId}:${doc.documentType}:${doc.versionNumber}`;
      const group = versionGroups.get(key) ?? [];
      group.push(doc);
      versionGroups.set(key, group);
    }
    for (const [, group] of versionGroups) {
      if (group.length <= 1) continue;
      push({
        checkId: 'duplicate_version_numbers',
        organizationId: group[0].organizationId,
        message: CHECK_META.duplicate_version_numbers.label,
        entityType: 'GeneratedDocument',
        entityId: group[0].id,
        relatedIds: { documentIds: group.map((d) => d.id).join(',') },
        details: {
          versionNumber: group[0].versionNumber,
          documentType: group[0].documentType,
          count: group.length,
        },
      });
    }

    for (const doc of args.documents) {
      if (!isInvoiceDocumentType(doc.documentType)) continue;

      if (!doc.invoiceId) {
        push({
          checkId: 'invoice_doc_without_invoice_link',
          organizationId: doc.organizationId,
          message: CHECK_META.invoice_doc_without_invoice_link.label,
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          relatedIds: { bookingId: doc.bookingId },
          details: { documentType: doc.documentType, status: doc.status },
        });
      } else if (!invoiceById.has(doc.invoiceId)) {
        push({
          checkId: 'orphan_invoice_id_on_document',
          organizationId: doc.organizationId,
          message: CHECK_META.orphan_invoice_id_on_document.label,
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          relatedIds: { invoiceId: doc.invoiceId },
        });
      }

      if (doc.invoiceId) {
        const invoice = invoiceById.get(doc.invoiceId);
        if (invoice && invoice.organizationId !== doc.organizationId) {
          push({
            checkId: 'organization_mismatch',
            organizationId: doc.organizationId,
            message: 'Document organizationId differs from linked invoice',
            entityType: 'GeneratedDocument',
            entityId: doc.id,
            relatedIds: { invoiceId: doc.invoiceId },
          });
        }
        if (invoice?.bookingId && doc.bookingId && invoice.bookingId !== doc.bookingId) {
          push({
            checkId: 'organization_mismatch',
            organizationId: doc.organizationId,
            message: 'Document bookingId differs from linked invoice bookingId',
            entityType: 'GeneratedDocument',
            entityId: doc.id,
            relatedIds: {
              invoiceId: doc.invoiceId,
              documentBookingId: doc.bookingId,
              invoiceBookingId: invoice.bookingId,
            },
          });
        }
      }

      if (doc.bookingId) {
        const bookingOrg = bookingOrgById.get(doc.bookingId);
        if (bookingOrg && bookingOrg !== doc.organizationId) {
          push({
            checkId: 'organization_mismatch',
            organizationId: doc.organizationId,
            message: 'Document organizationId differs from booking organization',
            entityType: 'GeneratedDocument',
            entityId: doc.id,
            relatedIds: { bookingId: doc.bookingId },
          });
        }
      }

      const successLike =
        ACTIVE_DOCUMENT_STATUSES.has(doc.status) ||
        doc.generationStatus === 'SUCCEEDED' ||
        doc.status === DOCUMENT_STATUS.GENERATED ||
        doc.status === DOCUMENT_STATUS.SENT;

      if (successLike && !hasStorageKey(doc.objectKey)) {
        push({
          checkId: 'document_completed_without_storage',
          organizationId: doc.organizationId,
          message: CHECK_META.document_completed_without_storage.label,
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          details: { status: doc.status, generationStatus: doc.generationStatus },
        });
      }

      if (
        hasStorageKey(doc.objectKey) &&
        (doc.status === DOCUMENT_STATUS.VOID || doc.status === DOCUMENT_STATUS.FAILED)
      ) {
        push({
          checkId: 'document_file_with_bad_status',
          organizationId: doc.organizationId,
          message: CHECK_META.document_file_with_bad_status.label,
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          details: { status: doc.status },
        });
      }
    }

    for (const bundle of args.bundles) {
      const pointers: Array<{ field: keyof BundleRow; documentType: string }> = [
        { field: 'bookingInvoiceDocumentId', documentType: DOCUMENT_TYPE.BOOKING_INVOICE },
        { field: 'finalInvoiceDocumentId', documentType: DOCUMENT_TYPE.FINAL_INVOICE },
      ];
      for (const { field, documentType } of pointers) {
        const docId = bundle[field] as string | null;
        if (!docId) continue;
        const doc = documentById.get(docId);
        if (!doc) continue;
        const bookingInvoices = args.invoices.filter(
          (i) =>
            i.bookingId === bundle.bookingId &&
            expectedDocumentTypeForInvoice(i.type as OrgInvoiceType) === documentType,
        );
        const linkedToBookingInvoice = doc.invoiceId
          ? bookingInvoices.some((i) => i.id === doc.invoiceId)
          : false;
        if (!linkedToBookingInvoice) {
          push({
            checkId: 'bundle_doc_not_linked_to_invoice',
            organizationId: bundle.organizationId,
            message: CHECK_META.bundle_doc_not_linked_to_invoice.label,
            entityType: 'BookingDocumentBundle',
            entityId: bundle.id,
            relatedIds: {
              bookingId: bundle.bookingId,
              documentId: docId,
              documentInvoiceId: doc.invoiceId,
            },
            details: { pointerField: field, documentType },
          });
        }
      }
    }

    for (const invoice of args.invoices) {
      if (!invoice.bookingId) continue;
      const expectedType = expectedDocumentTypeForInvoice(invoice.type as OrgInvoiceType);
      if (!expectedType) continue;
      if (['VOID', 'CANCELLED', 'CREDITED', 'DRAFT'].includes(invoice.status)) continue;

      const linkedDocs = args.documents.filter(
        (d) =>
          d.invoiceId === invoice.id &&
          d.documentType === expectedType &&
          isActiveDocumentStatus(d.status),
      );
      if (linkedDocs.length === 0 && !invoice.generatedDocumentId) {
        push({
          checkId: 'booking_invoice_without_document',
          organizationId: invoice.organizationId,
          message: CHECK_META.booking_invoice_without_document.label,
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          relatedIds: { bookingId: invoice.bookingId },
          details: { expectedDocumentType: expectedType, invoiceStatus: invoice.status },
        });
      }
    }

    for (const bundle of args.bundles) {
      if (bundle.status !== BUNDLE_STATUS.COMPLETE) continue;
      for (const documentType of INVOICE_DOCUMENT_TYPES) {
        const field = bundleInvoicePointerField(documentType);
        if (!field) continue;
        const docId = bundle[field];
        if (!docId) continue;
        const doc = documentById.get(docId);
        if (!doc) continue;
        if (!hasStorageKey(doc.objectKey)) {
          push({
            checkId: 'document_completed_without_storage',
            organizationId: bundle.organizationId,
            message: 'Bundle COMPLETE but invoice document lacks storage key',
            entityType: 'BookingDocumentBundle',
            entityId: bundle.id,
            relatedIds: { documentId: docId, bookingId: bundle.bookingId },
            details: { bundleStatus: bundle.status, documentType },
          });
        }
      }
    }

    const candidateGroups = new Map<string, DocumentRow[]>();
    for (const doc of args.documents) {
      if (!doc.invoiceId || !isInvoiceDocumentType(doc.documentType)) continue;
      if (!isActiveDocumentStatus(doc.status)) continue;
      const key = `${doc.organizationId}:${doc.invoiceId}:${doc.documentType}`;
      const group = candidateGroups.get(key) ?? [];
      group.push(doc);
      candidateGroups.set(key, group);
    }
    for (const [, group] of candidateGroups) {
      if (group.length <= 1) continue;
      const activeFlags = group.filter((d) => d.isActiveVersion);
      if (activeFlags.length === 1) continue;
      push({
        checkId: 'multiple_active_candidates',
        organizationId: group[0].organizationId,
        message: CHECK_META.multiple_active_candidates.label,
        entityType: 'GeneratedDocument',
        entityId: group[0].id,
        relatedIds: {
          invoiceId: group[0].invoiceId,
          documentIds: group.map((d) => d.id).join(','),
        },
        details: { documentType: group[0].documentType, candidateCount: group.length },
      });
    }

    for (const doc of args.documents) {
      if (!isInvoiceDocumentType(doc.documentType)) continue;
      if (doc.invoiceId) continue;
      if (!doc.bookingId) continue;

      const candidates = args.invoices.filter(
        (i) =>
          i.bookingId === doc.bookingId &&
          expectedDocumentTypeForInvoice(i.type as OrgInvoiceType) === doc.documentType &&
          !['VOID', 'CANCELLED', 'CREDITED'].includes(i.status),
      );

      if (candidates.length <= 1) continue;

      push({
        checkId: 'ambiguous_legacy_assignment',
        organizationId: doc.organizationId,
        message: CHECK_META.ambiguous_legacy_assignment.label,
        entityType: 'GeneratedDocument',
        entityId: doc.id,
        relatedIds: {
          bookingId: doc.bookingId,
          candidateInvoiceIds: candidates.map((i) => i.id).join(','),
        },
        details: { documentType: doc.documentType, candidateCount: candidates.length },
      });
    }

    return findings;
  }

  private buildOrgReport(
    organizationId: string,
    findings: InvoiceDocumentIntegrityFinding[],
    truncated: boolean,
  ): InvoiceDocumentIntegrityOrgReport {
    const countsByCheck: InvoiceDocumentIntegrityOrgReport['countsByCheck'] = {};
    const countsByRepairClass: InvoiceDocumentIntegrityOrgReport['countsByRepairClass'] = {};

    for (const f of findings) {
      countsByCheck[f.checkId] = (countsByCheck[f.checkId] ?? 0) + 1;
      countsByRepairClass[f.repairClass] = (countsByRepairClass[f.repairClass] ?? 0) + 1;
    }

    return { organizationId, countsByCheck, countsByRepairClass, findings, truncated };
  }

  private buildSummary(
    findings: InvoiceDocumentIntegrityFinding[],
  ): InvoiceDocumentIntegrityAuditReport['summary'] {
    const byCheckId: InvoiceDocumentIntegrityAuditReport['summary']['byCheckId'] = {};
    const byRepairClass: InvoiceDocumentIntegrityAuditReport['summary']['byRepairClass'] = {};

    let critical = 0;
    let errors = 0;
    let warnings = 0;
    let infos = 0;

    for (const f of findings) {
      byCheckId[f.checkId] = (byCheckId[f.checkId] ?? 0) + 1;
      byRepairClass[f.repairClass] = (byRepairClass[f.repairClass] ?? 0) + 1;
      if (f.severity === 'critical') critical++;
      else if (f.severity === 'error') errors++;
      else if (f.severity === 'warning') warnings++;
      else infos++;
    }

    return {
      totalFindings: findings.length,
      critical,
      errors,
      warnings,
      infos,
      byCheckId,
      byRepairClass,
    };
  }
}
