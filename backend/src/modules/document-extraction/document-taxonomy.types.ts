import type { ApplyDocumentExtractionType } from './document-extraction.schemas';

export const DOCUMENT_TAXONOMY_VERSION = '1.0.0' as const;

export const DOCUMENT_CATEGORIES = [
  'FINANCE',
  'AUTHORITY',
  'VEHICLE',
  'TECHNICAL',
  'COMPLIANCE',
  'INSURANCE',
  'CUSTOMER',
  'DRIVER',
  'CONTRACT',
  'GENERAL',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_SUBTYPES = [
  'INVOICE',
  'CREDIT_NOTE',
  'REMINDER',
  'FINE_NOTICE',
  'DRIVER_IDENTIFICATION_REQUEST',
  'SERVICE_REPORT',
  'TUV_REPORT',
  'BOKRAFT_REPORT',
  'DAMAGE_REPORT',
  'ACCIDENT_REPORT',
  'INSURANCE_LETTER',
  'CUSTOMER_CORRESPONDENCE',
  'DRIVER_DOCUMENT',
  'PAYMENT_PROOF',
  'OTHER',
] as const;

export type DocumentSubtype = (typeof DOCUMENT_SUBTYPES)[number];

export const DOCUMENT_TAXONOMY_SOURCES = [
  'classification',
  'legacy_mapping',
  'manual_type',
  'subtype_hint',
  'unknown_subtype_archive',
] as const;

export type DocumentTaxonomySource = (typeof DOCUMENT_TAXONOMY_SOURCES)[number];

export type DocumentTaxonomy = {
  taxonomyVersion: typeof DOCUMENT_TAXONOMY_VERSION;
  documentCategory: DocumentCategory;
  documentSubtype: DocumentSubtype;
  legacyDocumentType: ApplyDocumentExtractionType;
  source: DocumentTaxonomySource;
  archiveRecommended: boolean;
};

export type DocumentTaxonomyPipelineState = DocumentTaxonomy & {
  resolvedAt: string;
};

export type ResolveDocumentTaxonomyInput = {
  legacyDocumentType?: string | null;
  documentSubtype?: string | null;
  archiveSubtype?: string | null;
  source?: DocumentTaxonomySource;
};
