import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import { documentSchemaRegistry } from './document-schema-registry';
import { readDocumentTaxonomyPipelineState } from './document-taxonomy.util';
import type { DocumentSubtype } from './document-taxonomy.types';
import { normalizeDocumentSubtype } from './document-taxonomy.util';
import type { ResolvedExtractionSchema } from './document-structured-extraction.types';
import { readPublicTypeAudit } from './document-content-cache.util';

const HIGH_CONFIDENCE_CLASSIFICATION_MIN = 0.85;

function readClassificationSubtype(plausibility: unknown): DocumentSubtype | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const classification = (plausibility as Record<string, unknown>).classification;
  if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
    return null;
  }
  const row = classification as Record<string, unknown>;
  const confidence =
    typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? row.confidence : 0;
  if (confidence < HIGH_CONFIDENCE_CLASSIFICATION_MIN) {
    return null;
  }
  const subtype =
    typeof row.subtype === 'string'
      ? row.subtype
      : typeof row.documentSubtype === 'string'
        ? row.documentSubtype
        : null;
  return normalizeDocumentSubtype(subtype);
}

export function resolveExtractionSchema(input: {
  legacyDocumentType: ApplyDocumentExtractionType;
  plausibility?: unknown;
}): ResolvedExtractionSchema {
  const taxonomySubtype = readDocumentTaxonomyPipelineState(input.plausibility)?.documentSubtype ?? null;
  const classificationSubtype = readClassificationSubtype(input.plausibility);
  const documentSubtype = taxonomySubtype ?? classificationSubtype;

  const registryEntry = documentSchemaRegistry.resolve({
    legacyDocumentType: input.legacyDocumentType,
    documentSubtype,
  });

  const fields = documentSchemaRegistry.getExtractionFields({
    legacyDocumentType: input.legacyDocumentType,
    documentSubtype,
  });

  return {
    legacyDocumentType: input.legacyDocumentType,
    documentSubtype: documentSubtype ?? registryEntry?.subtype ?? null,
    schemaVersion: registryEntry?.schemaVersion ?? '1.0.0',
    fields,
    requiredFields: registryEntry?.requiredFields ?? [],
  };
}

export function resolveExtractionTrigger(plausibility: unknown): import('./document-structured-extraction.types').StructuredExtractionTrigger {
  const audit = readPublicTypeAudit(plausibility);
  const last = audit[audit.length - 1];
  if (!last) return 'auto';
  if (last.reason === 'user_corrected_document_type_reextract') return 'reextract';
  if (
    last.reason === 'user_selected_document_type' ||
    last.reason === 'user_set_document_type_retry'
  ) {
    return 'type_change';
  }
  return 'auto';
}
