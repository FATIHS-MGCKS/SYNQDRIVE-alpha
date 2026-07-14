import { OrgInvoiceType } from '@prisma/client';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import {
  expectedDocumentTypeForInvoice,
  hasStorageKey,
  isActiveDocumentStatus,
  isInvoiceDocumentType,
} from './invoice-document-integrity-audit.util';
import type {
  InvoiceDocumentBackfillAction,
  InvoiceDocumentBackfillDataRow,
  InvoiceDocumentBackfillSkip,
} from './invoice-document-backfill.types';

type DocRow = InvoiceDocumentBackfillDataRow['documents'][number];
type InvRow = InvoiceDocumentBackfillDataRow['invoices'][number];

const MANUAL_SKIP_CHECKS = new Set([
  'organization_mismatch',
  'ambiguous_legacy_assignment',
  'multiple_active_candidates',
  'duplicate_version_numbers',
  'document_completed_without_storage',
  'cache_document_missing',
  'cache_document_invoice_mismatch',
]);

export function pickUnambiguousActiveDocument(docs: DocRow[]): DocRow | null {
  const active = docs.filter((d) => isActiveDocumentStatus(d.status));
  if (active.length === 0) return null;
  if (active.length === 1) return active[0];

  const flagged = active.filter((d) => d.isActiveVersion);
  if (flagged.length === 1) return flagged[0];
  if (flagged.length > 1) return null;

  const sorted = [...active].sort(compareActiveCandidates);
  const first = sorted[0];
  const second = sorted[1];
  if (!second) return first;

  if (
    first.versionNumber != null &&
    second.versionNumber != null &&
    first.versionNumber > second.versionNumber
  ) {
    return first;
  }

  if (first.createdAt.getTime() > second.createdAt.getTime()) {
    if (first.versionNumber == null && second.versionNumber == null) return first;
    if (first.versionNumber != null && second.versionNumber == null) return first;
    if (
      first.versionNumber != null &&
      second.versionNumber != null &&
      first.versionNumber !== second.versionNumber
    ) {
      return first;
    }
  }

  return null;
}

function compareActiveCandidates(a: DocRow, b: DocRow): number {
  if (a.versionNumber != null && b.versionNumber != null && b.versionNumber !== a.versionNumber) {
    return b.versionNumber - a.versionNumber;
  }
  if (a.versionNumber != null && b.versionNumber == null) return -1;
  if (a.versionNumber == null && b.versionNumber != null) return 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function actionId(kind: string, entityId: string, suffix = ''): string {
  return `${kind}:${entityId}${suffix ? `:${suffix}` : ''}`;
}

function invoiceTypeMatchesDoc(invoice: InvRow, doc: DocRow): boolean {
  const expected = expectedDocumentTypeForInvoice(invoice.type as OrgInvoiceType);
  return expected != null && doc.documentType === expected;
}

function isLiveInvoice(invoice: InvRow): boolean {
  return !['VOID', 'CANCELLED', 'CREDITED'].includes(invoice.status);
}

function docsForInvoiceType(docs: DocRow[], invoice: InvRow): DocRow[] {
  const expected = expectedDocumentTypeForInvoice(invoice.type as OrgInvoiceType);
  if (!expected) return [];
  return docs.filter((d) => d.invoiceId === invoice.id && d.documentType === expected);
}

function findUniqueInvoiceForBooking(
  invoices: InvRow[],
  bookingId: string,
  documentType: string,
): InvRow | null {
  const matches = invoices.filter(
    (i) =>
      i.bookingId === bookingId &&
      isLiveInvoice(i) &&
      expectedDocumentTypeForInvoice(i.type as OrgInvoiceType) === documentType,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function planInvoiceDocumentRepairs(
  data: InvoiceDocumentBackfillDataRow,
  auditSkipEntityKeys: Set<string> = new Set(),
): { actions: InvoiceDocumentBackfillAction[]; skipped: InvoiceDocumentBackfillSkip[] } {
  const actions: InvoiceDocumentBackfillAction[] = [];
  const skipped: InvoiceDocumentBackfillSkip[] = [];
  const actionKeys = new Set<string>();

  const invoiceById = new Map(data.invoices.map((i) => [i.id, i]));
  const documentById = new Map(data.documents.map((d) => [d.id, d]));

  const queueSkip = (skip: InvoiceDocumentBackfillSkip) => {
    skipped.push(skip);
  };

  const queueAction = (action: InvoiceDocumentBackfillAction) => {
    const key = `${action.kind}:${action.documentId}:${action.invoiceId ?? ''}`;
    if (actionKeys.has(key)) return;
    actionKeys.add(key);
    actions.push(action);
  };

  for (const invoice of data.invoices) {
    if (auditSkipEntityKeys.has(`OrgInvoice:${invoice.id}`)) {
      queueSkip({
        reason: 'Blocked by audit finding',
        entityType: 'OrgInvoice',
        entityId: invoice.id,
      });
      continue;
    }

    const expectedType = expectedDocumentTypeForInvoice(invoice.type as OrgInvoiceType);
    if (!expectedType) continue;

    const linkedActive = docsForInvoiceType(data.documents, invoice).filter((d) =>
      isActiveDocumentStatus(d.status),
    );

    if (linkedActive.length === 1) {
      const doc = linkedActive[0];
      if (doc.organizationId !== invoice.organizationId) {
        queueSkip({
          reason: 'Organization mismatch',
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          checkId: 'organization_mismatch',
        });
      } else if (!hasStorageKey(doc.objectKey)) {
        queueSkip({
          reason: 'Document lacks storage key',
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          checkId: 'document_completed_without_storage',
        });
      } else if (invoice.generatedDocumentId !== doc.id) {
        queueAction({
          actionId: actionId('sync_cache_from_document', invoice.id, doc.id),
          kind: 'sync_cache_from_document',
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          documentId: doc.id,
          reason: 'Single active linked document; sync invoice.generatedDocumentId cache',
          before: {
            invoiceGeneratedDocumentId: invoice.generatedDocumentId,
            documentIsActiveVersion: doc.isActiveVersion ? 1 : 0,
          },
          after: {
            invoiceGeneratedDocumentId: doc.id,
            documentIsActiveVersion: 1,
          },
        });
      }
    } else if (linkedActive.length > 1) {
      const winner = pickUnambiguousActiveDocument(linkedActive);
      if (!winner) {
        queueSkip({
          reason: 'Multiple equally valid active document candidates',
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          checkId: 'multiple_active_candidates',
        });
      } else if (invoice.generatedDocumentId !== winner.id) {
        queueAction({
          actionId: actionId('set_active_version', invoice.id, winner.id),
          kind: 'set_active_version',
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          documentId: winner.id,
          reason: 'Unambiguous active document among versions; sync cache and active flag',
          before: {
            invoiceGeneratedDocumentId: invoice.generatedDocumentId,
            documentIsActiveVersion: winner.isActiveVersion ? 1 : 0,
          },
          after: {
            invoiceGeneratedDocumentId: winner.id,
            documentIsActiveVersion: 1,
          },
        });
      }
    }

    if (invoice.generatedDocumentId) {
      const cached = documentById.get(invoice.generatedDocumentId);
      if (!cached) {
        queueSkip({
          reason: 'Cache document missing',
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          checkId: 'cache_document_missing',
        });
      } else if (cached.organizationId !== invoice.organizationId) {
        queueSkip({
          reason: 'Organization mismatch on cached document',
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          checkId: 'organization_mismatch',
        });
      } else if (!invoiceTypeMatchesDoc(invoice, cached)) {
        queueSkip({
          reason: 'Invoice type does not match cached document type',
          entityType: 'OrgInvoice',
          entityId: invoice.id,
        });
      } else if (cached.invoiceId && cached.invoiceId !== invoice.id) {
        queueSkip({
          reason: 'Cached document belongs to another invoice',
          entityType: 'OrgInvoice',
          entityId: invoice.id,
          checkId: 'cache_document_invoice_mismatch',
        });
      } else if (!cached.invoiceId) {
        const otherInvoicesWithSameDoc = data.invoices.filter(
          (i) => i.generatedDocumentId === cached.id && i.id !== invoice.id,
        );
        if (otherInvoicesWithSameDoc.length > 0) {
          queueSkip({
            reason: 'Document referenced by multiple invoice cache pointers',
            entityType: 'GeneratedDocument',
            entityId: cached.id,
            checkId: 'multiple_active_candidates',
          });
        } else if (!hasStorageKey(cached.objectKey)) {
          queueSkip({
            reason: 'Cached document lacks storage key',
            entityType: 'GeneratedDocument',
            entityId: cached.id,
            checkId: 'document_completed_without_storage',
          });
        } else {
          queueAction({
            actionId: actionId('sync_invoice_id_from_cache', invoice.id, cached.id),
            kind: 'sync_invoice_id_from_cache',
            organizationId: invoice.organizationId,
            invoiceId: invoice.id,
            documentId: cached.id,
            reason: 'Valid cache pointer; set document.invoiceId',
            before: { documentInvoiceId: null },
            after: { documentInvoiceId: invoice.id },
          });
        }
      }
    }
  }

  for (const bundle of data.bundles) {
    const pointers: Array<{ field: 'bookingInvoiceDocumentId' | 'finalInvoiceDocumentId'; type: string }> = [
      { field: 'bookingInvoiceDocumentId', type: DOCUMENT_TYPE.BOOKING_INVOICE },
      { field: 'finalInvoiceDocumentId', type: DOCUMENT_TYPE.FINAL_INVOICE },
    ];

    for (const { field, type } of pointers) {
      const docId = bundle[field];
      if (!docId) continue;
      const doc = documentById.get(docId);
      if (!doc) continue;

      const invoice = findUniqueInvoiceForBooking(data.invoices, bundle.bookingId, type);
      if (!invoice) {
        queueSkip({
          reason: 'No unique live invoice for bundle document pointer',
          entityType: 'BookingDocumentBundle',
          entityId: bundle.id,
          checkId: 'ambiguous_legacy_assignment',
        });
        continue;
      }

      if (doc.organizationId !== invoice.organizationId || bundle.organizationId !== invoice.organizationId) {
        queueSkip({
          reason: 'Organization mismatch on bundle sync',
          entityType: 'BookingDocumentBundle',
          entityId: bundle.id,
          checkId: 'organization_mismatch',
        });
        continue;
      }

      if (!hasStorageKey(doc.objectKey)) {
        queueSkip({
          reason: 'Bundle document lacks storage key',
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          checkId: 'document_completed_without_storage',
        });
        continue;
      }

      if (doc.invoiceId && doc.invoiceId !== invoice.id) {
        queueSkip({
          reason: 'Bundle document already linked to different invoice',
          entityType: 'GeneratedDocument',
          entityId: doc.id,
          checkId: 'cache_document_invoice_mismatch',
        });
        continue;
      }

      if (!doc.invoiceId) {
        queueAction({
          actionId: actionId('sync_from_bundle_pointer', bundle.id, doc.id),
          kind: 'sync_from_bundle_pointer',
          organizationId: bundle.organizationId,
          invoiceId: invoice.id,
          documentId: doc.id,
          reason: 'Bundle and invoice uniquely identify same document; set document.invoiceId',
          before: { documentInvoiceId: null },
          after: { documentInvoiceId: invoice.id },
        });
      }

      if (invoice.generatedDocumentId !== doc.id) {
        queueAction({
          actionId: actionId('sync_cache_from_bundle', invoice.id, doc.id),
          kind: 'sync_cache_from_document',
          organizationId: invoice.organizationId,
          invoiceId: invoice.id,
          documentId: doc.id,
          reason: 'Bundle pointer matches unique invoice; sync cache',
          before: {
            invoiceGeneratedDocumentId: invoice.generatedDocumentId,
            documentIsActiveVersion: doc.isActiveVersion ? 1 : 0,
          },
          after: {
            invoiceGeneratedDocumentId: doc.id,
            documentIsActiveVersion: 1,
          },
        });
      }
    }
  }

  const groups = new Map<string, DocRow[]>();
  for (const doc of data.documents) {
    if (!doc.invoiceId || !isInvoiceDocumentType(doc.documentType)) continue;
    const invoice = invoiceById.get(doc.invoiceId);
    if (!invoice || invoice.organizationId !== doc.organizationId) continue;
    const key = `${doc.organizationId}:${doc.invoiceId}:${doc.documentType}`;
    const group = groups.get(key) ?? [];
    group.push(doc);
    groups.set(key, group);
  }

  for (const [, group] of groups) {
    const active = group.filter((d) => isActiveDocumentStatus(d.status));
    if (active.length <= 1) continue;
    const winner = pickUnambiguousActiveDocument(active);
    if (!winner) {
      queueSkip({
        reason: 'Cannot pick unambiguous active version',
        entityType: 'GeneratedDocument',
        entityId: active[0].id,
        checkId: 'multiple_active_candidates',
      });
      continue;
    }

    if (!winner.isActiveVersion) {
      queueAction({
        actionId: actionId('set_active_version', winner.id),
        kind: 'set_active_version',
        organizationId: winner.organizationId,
        invoiceId: winner.invoiceId,
        documentId: winner.id,
        reason: 'Mark unambiguous winner as active version',
        before: { documentIsActiveVersion: 0 },
        after: { documentIsActiveVersion: 1 },
      });
    }

    for (const other of active) {
      if (other.id === winner.id || !other.isActiveVersion) continue;
      queueAction({
        actionId: actionId('clear_stale_active_flags', other.id),
        kind: 'clear_stale_active_flags',
        organizationId: other.organizationId,
        invoiceId: other.invoiceId,
        documentId: other.id,
        reason: 'Clear stale isActiveVersion on superseded document',
        before: { documentIsActiveVersion: 1 },
        after: { documentIsActiveVersion: 0 },
      });
    }
  }

  for (const [, group] of groups) {
    const missing = group.filter((d) => d.versionNumber == null);
    if (missing.length === 0) continue;

    const used = new Set(group.map((d) => d.versionNumber).filter((v): v is number => v != null));
    const sorted = [...missing].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let next = 1;
    const taken = () => {
      while (used.has(next)) next += 1;
      return next;
    };

    for (const doc of sorted) {
      const version = taken();
      used.add(version);
      queueAction({
        actionId: actionId('assign_version_numbers', doc.id, String(version)),
        kind: 'assign_version_numbers',
        organizationId: doc.organizationId,
        invoiceId: doc.invoiceId,
        documentId: doc.id,
        reason: 'Assign chronological version number',
        before: { versionNumber: null },
        after: { versionNumber: version },
      });
    }
  }

  return { actions, skipped };
}

export function buildAuditSkipKeys(
  findings: Array<{ entityType: string; entityId: string; checkId: string }>,
): Set<string> {
  const keys = new Set<string>();
  for (const f of findings) {
    if (MANUAL_SKIP_CHECKS.has(f.checkId)) {
      keys.add(`${f.entityType}:${f.entityId}`);
    }
  }
  return keys;
}

export function isActionAlreadyApplied(
  action: InvoiceDocumentBackfillAction,
  invoice: InvRow | undefined,
  document: DocRow | undefined,
): boolean {
  switch (action.kind) {
    case 'sync_cache_from_document':
      return (
        invoice?.generatedDocumentId === (action.after.invoiceGeneratedDocumentId as string) &&
        document?.isActiveVersion === (action.after.documentIsActiveVersion === 1)
      );
    case 'sync_from_bundle_pointer':
      return document?.invoiceId === (action.after.documentInvoiceId as string);
    case 'sync_invoice_id_from_cache':
      return document?.invoiceId === (action.after.documentInvoiceId as string);
    case 'set_active_version':
      return (
        document?.isActiveVersion === true &&
        (invoice == null || invoice.generatedDocumentId === action.documentId)
      );
    case 'clear_stale_active_flags':
      return document?.isActiveVersion === false;
    case 'assign_version_numbers':
      return document?.versionNumber === action.after.versionNumber;
    default:
      return false;
  }
}
