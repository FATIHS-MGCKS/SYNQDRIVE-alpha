import type { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import { readDocumentActionPlanState } from './document-action-plan.store';
import {
  DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES,
  isTerminalApplyLifecycleStatus,
} from './document-action-plan.state-machine';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';
import { readInvoiceNumber } from './document-invoice-extraction.rules';
import { readDocumentTaxonomyPipelineState, resolveDocumentTaxonomy } from './document-taxonomy.util';
import { readFollowUpSuggestions } from './document-follow-up-suggestion.store';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
} from './document-follow-up-suggestion.types';

export type DocumentExtractionArchiveActionStatus =
  | 'NONE'
  | 'READY'
  | 'APPLYING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED';

export type DocumentExtractionArchiveFollowUpStatus =
  | 'NONE'
  | 'OPEN'
  | 'ACCEPTED'
  | 'DISMISSED'
  | 'MIXED';

export type DocumentExtractionArchiveIndexRow = {
  extractionId: string;
  organizationId: string;
  status: DocumentExtractionStatus;
  documentCategory: string | null;
  documentSubtype: string | null;
  effectiveDocumentType: DocumentExtractionType | null;
  vehicleId: string | null;
  bookingId: string | null;
  customerId: string | null;
  driverId: string | null;
  vendorId: string | null;
  createdById: string | null;
  sourceFileName: string | null;
  invoiceNumber: string | null;
  caseReference: string | null;
  actionStatus: DocumentExtractionArchiveActionStatus;
  followUpStatus: DocumentExtractionArchiveFollowUpStatus;
  documentDate: Date | null;
  searchText: string;
  uploadedAt: Date;
  appliedAt: Date | null;
};

export type PublicDocumentArchiveEntityLinkDto = {
  entityType: string;
  entityId: string;
  label: string | null;
};

export type PublicDocumentArchiveActionSummaryDto = {
  status: DocumentExtractionArchiveActionStatus;
  lifecycleStatus: string | null;
  summary: string | null;
  succeededCount: number;
  failedCount: number;
  pendingCount: number;
};

export type PublicDocumentArchiveFollowUpSummaryDto = {
  status: DocumentExtractionArchiveFollowUpStatus;
  openCount: number;
  acceptedCount: number;
  dismissedCount: number;
  primaryType: string | null;
  primaryTitle: string | null;
};

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function readMergedFields(record: {
  confirmedData?: unknown;
  extractedData?: unknown;
}): Record<string, unknown> {
  const confirmed =
    record.confirmedData && typeof record.confirmedData === 'object' && !Array.isArray(record.confirmedData)
      ? (record.confirmedData as Record<string, unknown>)
      : {};
  const extracted =
    record.extractedData && typeof record.extractedData === 'object' && !Array.isArray(record.extractedData)
      ? (record.extractedData as Record<string, unknown>)
      : {};
  return { ...extracted, ...confirmed };
}

function readEntityLinkIds(confirmedData: Record<string, unknown>) {
  const links = readAcceptedEntityLinks(confirmedData);
  const byType = new Map(links.map((link) => [link.entityType, link.entityId]));
  return {
    vehicleId: byType.get('vehicle') ?? null,
    bookingId: byType.get('booking') ?? null,
    customerId: byType.get('customer') ?? null,
    driverId: byType.get('driver') ?? byType.get('driver_customer') ?? null,
    vendorId: byType.get('vendor') ?? byType.get('partner') ?? null,
  };
}

function readCaseReference(fields: Record<string, unknown>): string | null {
  return (
    toStr(fields.reportNumber) ??
    toStr(fields.referenceNumber) ??
    toStr(fields.fineNumber) ??
    toStr(fields.caseReference) ??
    toStr(fields.aktenzeichen)
  );
}

function readDocumentDate(fields: Record<string, unknown>): Date | null {
  const raw =
    toStr(fields.documentDate) ??
    toStr(fields.eventDate) ??
    toStr(fields.offenseDate) ??
    toStr(fields.inspectionDate) ??
    toStr(fields.serviceDate);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveArchiveActionStatus(record: {
  status: string;
  plausibility?: unknown;
}): DocumentExtractionArchiveActionStatus {
  const { actionPlanExecution, actionPlanApplyLifecycle } = readDocumentActionPlanState(
    record.plausibility,
  );
  const lifecycle = actionPlanApplyLifecycle?.status ?? null;

  if (lifecycle === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING) {
    return 'APPLYING';
  }
  if (record.status === 'PARTIALLY_APPLIED') {
    return 'PARTIAL';
  }
  if (record.status === 'APPLIED') {
    return 'SUCCEEDED';
  }
  if (record.status === 'FAILED' && actionPlanExecution?.status === 'FAILED') {
    return 'FAILED';
  }
  if (lifecycle && isTerminalApplyLifecycleStatus(lifecycle)) {
    if (actionPlanExecution?.status === 'COMPLETED') return 'SUCCEEDED';
    if (actionPlanExecution?.status === 'PARTIALLY_COMPLETED') return 'PARTIAL';
    if (actionPlanExecution?.status === 'FAILED') return 'FAILED';
  }
  if (actionPlanExecution || lifecycle) {
    return 'READY';
  }
  return 'NONE';
}

export function resolveArchiveFollowUpStatus(
  plausibility: unknown,
): DocumentExtractionArchiveFollowUpStatus {
  const rows = readFollowUpSuggestions(plausibility).filter(
    (row) => row.type !== DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
  );
  if (rows.length === 0) return 'NONE';

  const statuses = new Set(rows.map((row) => row.status));
  const hasOpen = statuses.has(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED);
  const hasAccepted = statuses.has(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED);
  const hasDismissed = statuses.has(DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.DISMISSED);

  if ([hasOpen, hasAccepted, hasDismissed].filter(Boolean).length > 1) {
    return 'MIXED';
  }
  if (hasOpen) return 'OPEN';
  if (hasAccepted) return 'ACCEPTED';
  if (hasDismissed) return 'DISMISSED';
  return 'NONE';
}

const SEARCH_TEXT_MAX = 4000;
const SENSITIVE_SEARCH_KEYS = new Set([
  'rawText',
  'ocrText',
  'pageText',
  'iban',
  'bic',
  'taxId',
  'idNumber',
  'vin',
  'licensePlate',
]);

export function buildArchiveSearchText(input: {
  sourceFileName?: string | null;
  fields: Record<string, unknown>;
  documentCategory?: string | null;
  documentSubtype?: string | null;
  entityLinks: ReturnType<typeof readEntityLinkIds>;
}): string {
  const parts: string[] = [];
  if (input.sourceFileName) parts.push(input.sourceFileName);
  if (input.documentCategory) parts.push(input.documentCategory);
  if (input.documentSubtype) parts.push(input.documentSubtype);

  for (const [key, value] of Object.entries(input.fields)) {
    if (SENSITIVE_SEARCH_KEYS.has(key)) continue;
    if (typeof value === 'string' && value.trim()) {
      parts.push(value.trim());
    }
  }

  for (const id of Object.values(input.entityLinks)) {
    if (id) parts.push(id);
  }

  return [...new Set(parts.map((part) => part.toLowerCase()))]
    .join(' ')
    .slice(0, SEARCH_TEXT_MAX);
}

export function buildDocumentExtractionArchiveIndexRow(record: {
  id: string;
  organizationId: string | null;
  vehicleId: string | null;
  status: DocumentExtractionStatus;
  effectiveDocumentType?: DocumentExtractionType | null;
  documentType?: DocumentExtractionType | null;
  detectedDocumentSubtype?: string | null;
  sourceFileName?: string | null;
  confirmedData?: unknown;
  extractedData?: unknown;
  plausibility?: unknown;
  createdById?: string | null;
  createdAt: Date;
  appliedAt?: Date | null;
}): DocumentExtractionArchiveIndexRow | null {
  if (!record.organizationId) return null;

  const fields = readMergedFields(record);
  const taxonomyState = readDocumentTaxonomyPipelineState(record.plausibility);
  const legacyType =
    record.effectiveDocumentType ?? record.documentType ?? taxonomyState?.legacyDocumentType ?? 'OTHER';
  const taxonomy =
    taxonomyState ??
    resolveDocumentTaxonomy({
      legacyDocumentType: legacyType,
      documentSubtype: record.detectedDocumentSubtype ?? undefined,
    });
  const entityLinks = readEntityLinkIds(fields);

  return {
    extractionId: record.id,
    organizationId: record.organizationId,
    status: record.status,
    documentCategory: taxonomy.documentCategory,
    documentSubtype: taxonomy.documentSubtype,
    effectiveDocumentType: record.effectiveDocumentType ?? record.documentType ?? null,
    vehicleId: record.vehicleId ?? entityLinks.vehicleId,
    bookingId: entityLinks.bookingId,
    customerId: entityLinks.customerId,
    driverId: entityLinks.driverId,
    vendorId: entityLinks.vendorId,
    createdById: record.createdById ?? null,
    sourceFileName: record.sourceFileName ?? null,
    invoiceNumber: readInvoiceNumber(fields),
    caseReference: readCaseReference(fields),
    actionStatus: resolveArchiveActionStatus(record),
    followUpStatus: resolveArchiveFollowUpStatus(record.plausibility),
    documentDate: readDocumentDate(fields),
    searchText: buildArchiveSearchText({
      sourceFileName: record.sourceFileName,
      fields,
      documentCategory: taxonomy.documentCategory,
      documentSubtype: taxonomy.documentSubtype,
      entityLinks,
    }),
    uploadedAt: record.createdAt,
    appliedAt: record.appliedAt ?? null,
  };
}

export function toPublicArchiveEntityLinks(
  confirmedData: unknown,
): PublicDocumentArchiveEntityLinkDto[] {
  return readAcceptedEntityLinks(
    confirmedData && typeof confirmedData === 'object' && !Array.isArray(confirmedData)
      ? (confirmedData as Record<string, unknown>)
      : {},
  ).map((link) => ({
    entityType: link.entityType,
    entityId: link.entityId,
    label: link.label ?? null,
  }));
}

function resolveArchiveActionSummaryText(record: {
  status: string;
  plausibility?: unknown;
}): string | null {
  const { actionPlanExecution, actionPlanApplyLifecycle } = readDocumentActionPlanState(
    record.plausibility,
  );
  const lifecycle = actionPlanApplyLifecycle?.status ?? null;
  const failedCount = (actionPlanExecution?.actions ?? []).filter(
    (row) => row.status === 'FAILED',
  ).length;
  const succeededCount = (actionPlanExecution?.actions ?? []).filter(
    (row) => row.status === 'SUCCEEDED',
  ).length;

  if (lifecycle === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLYING) {
    return 'Übernahme läuft — einzelne Aktionen werden nacheinander ausgeführt.';
  }
  if (lifecycle === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.APPLY_FAILED) {
    return 'Übernahme fehlgeschlagen — erforderliche Aktionen konnten nicht abgeschlossen werden.';
  }
  if (
    lifecycle === DOCUMENT_ACTION_PLAN_APPLY_LIFECYCLE_STATUSES.PARTIALLY_APPLIED ||
    record.status === 'PARTIALLY_APPLIED'
  ) {
    return 'Teilweise übernommen — einige optionale Aktionen sind fehlgeschlagen.';
  }
  if (record.status === 'APPLIED') {
    return 'Alle geplanten Pflichtaktionen wurden erfolgreich übernommen.';
  }
  if (failedCount > 0 && succeededCount === 0) {
    return 'Übernahme fehlgeschlagen — erforderliche Aktionen konnten nicht abgeschlossen werden.';
  }
  if (actionPlanExecution || lifecycle) {
    return 'Aktionsplan bereit.';
  }
  return null;
}

export function buildArchiveActionSummary(record: {
  status: string;
  plausibility?: unknown;
}): PublicDocumentArchiveActionSummaryDto {
  const { actionPlanExecution, actionPlanApplyLifecycle } = readDocumentActionPlanState(
    record.plausibility,
  );
  const actions = actionPlanExecution?.actions ?? [];
  const succeededCount = actions.filter((row) => row.status === 'SUCCEEDED').length;
  const failedCount = actions.filter((row) => row.status === 'FAILED').length;
  const pendingCount = actions.filter(
    (row) => row.status === 'PENDING' || row.status === 'RUNNING',
  ).length;

  return {
    status: resolveArchiveActionStatus(record),
    lifecycleStatus: actionPlanApplyLifecycle?.status ?? null,
    summary: resolveArchiveActionSummaryText(record),
    succeededCount,
    failedCount,
    pendingCount,
  };
}

export function buildArchiveFollowUpSummary(
  plausibility: unknown,
): PublicDocumentArchiveFollowUpSummaryDto {
  const rows = readFollowUpSuggestions(plausibility).filter(
    (row) => row.type !== DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.NO_FOLLOW_UP,
  );
  const openCount = rows.filter(
    (row) => row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
  ).length;
  const acceptedCount = rows.filter(
    (row) => row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.ACCEPTED,
  ).length;
  const dismissedCount = rows.filter(
    (row) => row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.DISMISSED,
  ).length;
  const primary =
    rows.find((row) => row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED) ??
    rows[0] ??
    null;

  return {
    status: resolveArchiveFollowUpStatus(plausibility),
    openCount,
    acceptedCount,
    dismissedCount,
    primaryType: primary?.type ?? null,
    primaryTitle: primary?.title ?? null,
  };
}
