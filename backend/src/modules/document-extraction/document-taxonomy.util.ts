import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import { isApplyDocumentType } from './document-extraction.schemas';
import { resolveArchiveSubtype, type ArchiveSubtype } from './document-archive-extraction.rules';
import { mergePipelinePlausibility } from './document-content-cache.util';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SUBTYPES,
  DOCUMENT_TAXONOMY_VERSION,
  type DocumentCategory,
  type DocumentSubtype,
  type DocumentTaxonomy,
  type DocumentTaxonomyPipelineState,
  type ResolveDocumentTaxonomyInput,
} from './document-taxonomy.types';

const LEGACY_TYPE_TAXONOMY: Record<ApplyDocumentExtractionType, DocumentTaxonomy> = {
  INVOICE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'FINANCE',
    documentSubtype: 'INVOICE',
    legacyDocumentType: 'INVOICE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  SERVICE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    legacyDocumentType: 'SERVICE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  OIL_CHANGE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    legacyDocumentType: 'OIL_CHANGE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  TIRE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    legacyDocumentType: 'TIRE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  BRAKE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    legacyDocumentType: 'BRAKE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  BATTERY: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'TECHNICAL',
    documentSubtype: 'SERVICE_REPORT',
    legacyDocumentType: 'BATTERY',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  TUV_REPORT: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'COMPLIANCE',
    documentSubtype: 'TUV_REPORT',
    legacyDocumentType: 'TUV_REPORT',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  BOKRAFT_REPORT: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'COMPLIANCE',
    documentSubtype: 'BOKRAFT_REPORT',
    legacyDocumentType: 'BOKRAFT_REPORT',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  DAMAGE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'INSURANCE',
    documentSubtype: 'DAMAGE_REPORT',
    legacyDocumentType: 'DAMAGE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  ACCIDENT: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'INSURANCE',
    documentSubtype: 'ACCIDENT_REPORT',
    legacyDocumentType: 'ACCIDENT',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  FINE: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'AUTHORITY',
    documentSubtype: 'FINE_NOTICE',
    legacyDocumentType: 'FINE',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  VEHICLE_CONDITION: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'VEHICLE',
    documentSubtype: 'OTHER',
    legacyDocumentType: 'VEHICLE_CONDITION',
    source: 'legacy_mapping',
    archiveRecommended: false,
  },
  OTHER: {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'GENERAL',
    documentSubtype: 'OTHER',
    legacyDocumentType: 'OTHER',
    source: 'legacy_mapping',
    archiveRecommended: true,
  },
};

const SUBTYPE_HINT_TAXONOMY: Record<DocumentSubtype, { category: DocumentCategory; legacy: ApplyDocumentExtractionType }> = {
  INVOICE: { category: 'FINANCE', legacy: 'INVOICE' },
  CREDIT_NOTE: { category: 'FINANCE', legacy: 'INVOICE' },
  REMINDER: { category: 'FINANCE', legacy: 'INVOICE' },
  PAYMENT_PROOF: { category: 'FINANCE', legacy: 'OTHER' },
  FINE_NOTICE: { category: 'AUTHORITY', legacy: 'FINE' },
  DRIVER_IDENTIFICATION_REQUEST: { category: 'AUTHORITY', legacy: 'OTHER' },
  SERVICE_REPORT: { category: 'TECHNICAL', legacy: 'SERVICE' },
  TUV_REPORT: { category: 'COMPLIANCE', legacy: 'TUV_REPORT' },
  BOKRAFT_REPORT: { category: 'COMPLIANCE', legacy: 'BOKRAFT_REPORT' },
  DAMAGE_REPORT: { category: 'INSURANCE', legacy: 'DAMAGE' },
  ACCIDENT_REPORT: { category: 'INSURANCE', legacy: 'ACCIDENT' },
  INSURANCE_LETTER: { category: 'INSURANCE', legacy: 'OTHER' },
  CUSTOMER_CORRESPONDENCE: { category: 'CUSTOMER', legacy: 'OTHER' },
  DRIVER_DOCUMENT: { category: 'DRIVER', legacy: 'OTHER' },
  OTHER: { category: 'GENERAL', legacy: 'OTHER' },
};

const SUBTYPE_ALIASES: Record<string, DocumentSubtype> = {
  INVOICE: 'INVOICE',
  EINGANGSRECHNUNG: 'INVOICE',
  VENDOR_INVOICE: 'INVOICE',
  INCOMING_INVOICE: 'INVOICE',
  STANDARD: 'INVOICE',
  CREDIT_NOTE: 'CREDIT_NOTE',
  GUTSCHRIFT: 'CREDIT_NOTE',
  CREDITNOTE: 'CREDIT_NOTE',
  REMINDER: 'REMINDER',
  MAHNUNG: 'REMINDER',
  PAYMENT_REMINDER: 'REMINDER',
  DUNNING: 'REMINDER',
  FINE_NOTICE: 'FINE_NOTICE',
  FINE: 'FINE_NOTICE',
  PENALTY_NOTICE: 'FINE_NOTICE',
  VERWARNUNGSGELD: 'FINE_NOTICE',
  DRIVER_IDENTIFICATION_REQUEST: 'DRIVER_IDENTIFICATION_REQUEST',
  FAHRER_IDENT: 'DRIVER_IDENTIFICATION_REQUEST',
  SERVICE_REPORT: 'SERVICE_REPORT',
  WORKSHOP_REPORT: 'SERVICE_REPORT',
  WERKSTATTBERICHT: 'SERVICE_REPORT',
  TUV_REPORT: 'TUV_REPORT',
  HU_REPORT: 'TUV_REPORT',
  BOKRAFT_REPORT: 'BOKRAFT_REPORT',
  AU_REPORT: 'BOKRAFT_REPORT',
  DAMAGE_REPORT: 'DAMAGE_REPORT',
  ACCIDENT_REPORT: 'ACCIDENT_REPORT',
  INSURANCE_LETTER: 'INSURANCE_LETTER',
  INSURANCE: 'INSURANCE_LETTER',
  VERSICHERUNG: 'INSURANCE_LETTER',
  CUSTOMER_CORRESPONDENCE: 'CUSTOMER_CORRESPONDENCE',
  CUSTOMER_LETTER: 'CUSTOMER_CORRESPONDENCE',
  KUNDENKORRESPONDENZ: 'CUSTOMER_CORRESPONDENCE',
  DRIVER_DOCUMENT: 'DRIVER_DOCUMENT',
  DRIVER_LICENSE: 'DRIVER_DOCUMENT',
  FAHRER: 'DRIVER_DOCUMENT',
  PAYMENT_PROOF: 'PAYMENT_PROOF',
  PAYMENT_RECEIPT: 'PAYMENT_PROOF',
  ZAHLUNGSNACHWEIS: 'PAYMENT_PROOF',
  CONTRACT: 'OTHER',
  CONTRACT_DOCUMENT: 'OTHER',
  VERTRAG: 'OTHER',
  AUTHORITY_LETTER: 'OTHER',
  BEHOERDE: 'OTHER',
  EXPERT_REPORT: 'OTHER',
  GUTACHTEN: 'OTHER',
  GENERAL_EVIDENCE: 'OTHER',
  UNKNOWN: 'OTHER',
  UNCLEAR: 'OTHER',
  OTHER: 'OTHER',
};

const ARCHIVE_SUBTYPE_TAXONOMY: Record<ArchiveSubtype, { category: DocumentCategory; subtype: DocumentSubtype }> = {
  AUTHORITY_LETTER: { category: 'AUTHORITY', subtype: 'OTHER' },
  INSURANCE_LETTER: { category: 'INSURANCE', subtype: 'INSURANCE_LETTER' },
  CUSTOMER_CORRESPONDENCE: { category: 'CUSTOMER', subtype: 'CUSTOMER_CORRESPONDENCE' },
  DRIVER_DOCUMENT: { category: 'DRIVER', subtype: 'DRIVER_DOCUMENT' },
  PAYMENT_PROOF: { category: 'FINANCE', subtype: 'PAYMENT_PROOF' },
  WORKSHOP_REPORT: { category: 'TECHNICAL', subtype: 'SERVICE_REPORT' },
  EXPERT_REPORT: { category: 'GENERAL', subtype: 'OTHER' },
  GENERAL_EVIDENCE: { category: 'GENERAL', subtype: 'OTHER' },
  CONTRACT_DOCUMENT: { category: 'CONTRACT', subtype: 'OTHER' },
  UNKNOWN: { category: 'GENERAL', subtype: 'OTHER' },
};

export function normalizeDocumentSubtypeToken(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function normalizeDocumentCategoryToken(
  value: string | null | undefined,
): DocumentCategory | null {
  const token = normalizeDocumentSubtypeToken(value);
  if (!token) return null;
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(token)
    ? (token as DocumentCategory)
    : null;
}

export function normalizeDocumentSubtype(
  value: string | null | undefined,
): DocumentSubtype | null {
  const token = normalizeDocumentSubtypeToken(value);
  if (!token) return null;
  if ((DOCUMENT_SUBTYPES as readonly string[]).includes(token)) {
    return token as DocumentSubtype;
  }
  return SUBTYPE_ALIASES[token] ?? null;
}

export function resolveLegacyDocumentTypeFromTaxonomy(
  category: DocumentCategory,
  subtype: DocumentSubtype,
): ApplyDocumentExtractionType {
  const hint = SUBTYPE_HINT_TAXONOMY[subtype];
  if (hint && hint.category === category) {
    return hint.legacy;
  }
  if (category === 'CONTRACT') {
    return 'OTHER';
  }
  const legacyFromCategory: Partial<Record<DocumentCategory, ApplyDocumentExtractionType>> = {
    FINANCE: 'INVOICE',
    AUTHORITY: 'FINE',
    VEHICLE: 'VEHICLE_CONDITION',
    TECHNICAL: 'SERVICE',
    COMPLIANCE: 'TUV_REPORT',
    INSURANCE: 'DAMAGE',
    CUSTOMER: 'OTHER',
    DRIVER: 'OTHER',
    GENERAL: 'OTHER',
  };
  return legacyFromCategory[category] ?? 'OTHER';
}

export function resolveDocumentTaxonomyFromLegacyType(
  legacyDocumentType: ApplyDocumentExtractionType,
  source: ResolveDocumentTaxonomyInput['source'] = 'legacy_mapping',
): DocumentTaxonomy {
  const base = LEGACY_TYPE_TAXONOMY[legacyDocumentType];
  return {
    ...base,
    source: source ?? base.source,
  };
}

export function resolveDocumentTaxonomy(
  input: ResolveDocumentTaxonomyInput,
): DocumentTaxonomy {
  const source = input.source ?? 'legacy_mapping';
  const subtypeHint =
    normalizeDocumentSubtype(input.documentSubtype) ??
    normalizeDocumentSubtype(input.archiveSubtype);

  if (subtypeHint) {
    const archiveSubtypeResolved = input.archiveSubtype
      ? resolveArchiveSubtype({ archiveSubtype: input.archiveSubtype })
      : null;
    const archiveMapped = archiveSubtypeResolved
      ? ARCHIVE_SUBTYPE_TAXONOMY[archiveSubtypeResolved]
      : null;
    const hint = archiveMapped ?? {
      category: SUBTYPE_HINT_TAXONOMY[subtypeHint].category,
      subtype: subtypeHint,
    };
    const legacyDocumentType =
      input.legacyDocumentType && isApplyDocumentType(input.legacyDocumentType)
        ? input.legacyDocumentType
        : resolveLegacyDocumentTypeFromTaxonomy(hint.category, hint.subtype);

    return {
      taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
      documentCategory: hint.category,
      documentSubtype: hint.subtype,
      legacyDocumentType,
      source: input.documentSubtype || input.archiveSubtype ? 'subtype_hint' : source,
      archiveRecommended:
        hint.category === 'GENERAL' &&
        (hint.subtype === 'OTHER' || legacyDocumentType === 'OTHER'),
    };
  }

  const rawSubtype = normalizeDocumentSubtypeToken(input.documentSubtype ?? input.archiveSubtype);
  if (rawSubtype && !subtypeHint) {
    return {
      taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
      documentCategory: 'GENERAL',
      documentSubtype: 'OTHER',
      legacyDocumentType: 'OTHER',
      source: 'unknown_subtype_archive',
      archiveRecommended: true,
    };
  }

  if (input.legacyDocumentType && isApplyDocumentType(input.legacyDocumentType)) {
    return resolveDocumentTaxonomyFromLegacyType(input.legacyDocumentType, source);
  }

  return {
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
    documentCategory: 'GENERAL',
    documentSubtype: 'OTHER',
    legacyDocumentType: 'OTHER',
    source: 'unknown_subtype_archive',
    archiveRecommended: true,
  };
}

export function buildDocumentTaxonomyPipelineState(
  taxonomy: DocumentTaxonomy,
): DocumentTaxonomyPipelineState {
  return {
    ...taxonomy,
    resolvedAt: new Date().toISOString(),
  };
}

export function readDocumentTaxonomyPipelineState(
  plausibility: unknown,
): DocumentTaxonomyPipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const taxonomy = (pipeline as Record<string, unknown>).documentTaxonomy;
  if (!taxonomy || typeof taxonomy !== 'object' || Array.isArray(taxonomy)) {
    return null;
  }
  const row = taxonomy as DocumentTaxonomyPipelineState;
  if (
    typeof row.documentCategory !== 'string' ||
    typeof row.documentSubtype !== 'string' ||
    typeof row.legacyDocumentType !== 'string'
  ) {
    return null;
  }
  return row;
}

export function mergeDocumentTaxonomyPipeline(
  plausibility: unknown,
  taxonomy: DocumentTaxonomy,
): Record<string, unknown> {
  return mergePipelinePlausibility(plausibility, {
    documentTaxonomy: buildDocumentTaxonomyPipelineState(taxonomy),
  });
}
