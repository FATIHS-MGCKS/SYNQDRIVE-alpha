import { normalizeExtractedFieldValue } from '@modules/ai/documents/document-ai-extraction.schema.util';
import type { DocumentPageBlock } from './document-page.types';
import { isSensitiveDocumentField } from './document-schema-registry.field-meta';
import {
  mergePipelinePlausibility,
  readPipelinePayload,
} from './document-content-cache.util';
import type { StructuredFieldValue } from './document-structured-extraction.types';
import type {
  DocumentFieldProvenance,
  DocumentFieldProvenanceRegistry,
  FieldProvenanceSourceType,
  PublicFieldProvenanceDto,
} from './document-field-provenance.types';
import { DOCUMENT_FIELD_PROVENANCE_VERSION } from './document-field-provenance.types';

const DEFAULT_TEXT_EVIDENCE_MAX = 120;

function readNested(source: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return source[key];
  const [parent, child] = key.split('.');
  const obj = source[parent];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  return (obj as Record<string, unknown>)[child];
}

function valuesEquivalent(a: unknown, b: unknown): boolean {
  const left = normalizeExtractedFieldValue(a);
  const right = normalizeExtractedFieldValue(b);
  if (left == null && right == null) return true;
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  return String(left) === String(right);
}

export function mapStructuredProvenanceToSourceType(
  provenance: StructuredFieldValue['provenance'],
): FieldProvenanceSourceType {
  switch (provenance) {
    case 'llm':
      return 'ai_extraction';
    case 'merged':
      return 'ai_merged';
    case 'conflict':
      return 'ai_conflict';
    default:
      return 'missing';
  }
}

export function sanitizeTextEvidence(
  value: string,
  sensitive: boolean,
  maxChars: number = DEFAULT_TEXT_EVIDENCE_MAX,
): string {
  let snippet = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (!snippet) return '';

  if (sensitive) {
    snippet = snippet
      .replace(/\b[A-Z]{1,3}[-\s]?[A-Z]{1,2}\s?\d{1,4}[A-Z]?\b/gi, '[plate]')
      .replace(/\b[A-HJ-NPR-Z0-9]{11,17}\b/g, '[vin]')
      .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, '[iban]')
      .replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, '[email]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]');
  }

  if (snippet.length > maxChars) {
    return `${snippet.slice(0, maxChars - 1)}…`;
  }
  return snippet;
}

export function extractTextEvidenceSnippet(input: {
  value: unknown;
  pages: DocumentPageBlock[];
  sourcePages: number[];
  fieldKey: string;
  maxChars?: number;
}): string | null {
  if (input.value == null) return null;
  const needle = String(input.value).trim();
  if (needle.length < 2) return null;

  const sensitive = isSensitiveDocumentField(input.fieldKey);
  const pagesToSearch =
    input.sourcePages.length > 0
      ? input.pages.filter(
          (page) => page.pageNumber != null && input.sourcePages.includes(page.pageNumber),
        )
      : input.pages;

  for (const page of pagesToSearch) {
    const text = page.text ?? '';
    const idx = text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx < 0) continue;
    const start = Math.max(0, idx - 24);
    const end = Math.min(text.length, idx + needle.length + 24);
    let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = `…${snippet}`;
    if (end < text.length) snippet = `${snippet}…`;
    const sanitized = sanitizeTextEvidence(snippet, sensitive, input.maxChars);
    return sanitized || null;
  }

  return null;
}

export function buildFieldProvenanceFromStructuredFields(input: {
  fields: StructuredFieldValue[];
  pages: DocumentPageBlock[];
}): DocumentFieldProvenanceRegistry {
  const provenanceFields: DocumentFieldProvenance[] = input.fields.map((field) => ({
    fieldKey: field.key,
    rawValue: field.raw,
    normalizedValue: field.normalized,
    confidence: field.confidence,
    page: field.sourcePages[0] ?? null,
    textEvidence: extractTextEvidenceSnippet({
      value: field.raw ?? field.normalized,
      pages: input.pages,
      sourcePages: field.sourcePages,
      fieldKey: field.key,
    }),
    sourceType: mapStructuredProvenanceToSourceType(field.provenance),
    manuallyEdited: false,
    confirmedValue: null,
    confirmedBy: null,
    confirmedAt: null,
  }));

  return {
    contractVersion: DOCUMENT_FIELD_PROVENANCE_VERSION,
    fields: provenanceFields,
    correctionCount: 0,
    correctedFieldKeys: [],
  };
}

export function applyFieldProvenanceConfirmations(input: {
  registry: DocumentFieldProvenanceRegistry;
  confirmedData: Record<string, unknown>;
  confirmedBy: string | null;
  confirmedAt: string;
  schemaFieldKeys: readonly string[];
}): DocumentFieldProvenanceRegistry {
  const byKey = new Map(input.registry.fields.map((row) => [row.fieldKey, { ...row }]));
  const correctedFieldKeys: string[] = [];

  for (const fieldKey of input.schemaFieldKeys) {
    const confirmedValue = readNested(input.confirmedData, fieldKey);
    const existing = byKey.get(fieldKey);
    if (!existing) {
      if (confirmedValue == null) continue;
      byKey.set(fieldKey, {
        fieldKey,
        rawValue: null,
        normalizedValue: null,
        confidence: null,
        page: null,
        textEvidence: null,
        sourceType: 'user_correction',
        manuallyEdited: true,
        confirmedValue: normalizeExtractedFieldValue(confirmedValue),
        confirmedBy: input.confirmedBy,
        confirmedAt: input.confirmedAt,
      });
      correctedFieldKeys.push(fieldKey);
      continue;
    }

    const normalizedConfirmed = normalizeExtractedFieldValue(confirmedValue);
    const changed = !valuesEquivalent(existing.normalizedValue, normalizedConfirmed);
    existing.confirmedValue = normalizedConfirmed;
    existing.confirmedBy = input.confirmedBy;
    existing.confirmedAt = input.confirmedAt;
    if (changed) {
      existing.manuallyEdited = true;
      existing.sourceType = 'user_correction';
      correctedFieldKeys.push(fieldKey);
    } else if (normalizedConfirmed != null) {
      existing.sourceType = 'user_confirmed';
    }
    byKey.set(fieldKey, existing);
  }

  const uniqueCorrected = [...new Set(correctedFieldKeys)];
  return {
    contractVersion: DOCUMENT_FIELD_PROVENANCE_VERSION,
    fields: [...byKey.values()].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey)),
    correctionCount: uniqueCorrected.length,
    correctedFieldKeys: uniqueCorrected,
  };
}

export function readFieldProvenanceRegistry(
  plausibility: unknown,
): DocumentFieldProvenanceRegistry | null {
  const registry = readPipelinePayload(plausibility).fieldProvenance;
  if (!registry || typeof registry !== 'object') return null;
  return registry as DocumentFieldProvenanceRegistry;
}

export function mergeFieldProvenancePipeline(
  plausibility: unknown,
  registry: DocumentFieldProvenanceRegistry,
): Record<string, unknown> {
  return mergePipelinePlausibility(plausibility, { fieldProvenance: registry });
}

export function toPublicFieldProvenance(
  registry: DocumentFieldProvenanceRegistry | null,
): PublicFieldProvenanceDto[] | null {
  if (!registry) return null;
  return registry.fields.map((field) => ({
    fieldKey: field.fieldKey,
    rawValue: field.rawValue,
    normalizedValue: field.normalizedValue,
    confidence: field.confidence,
    page: field.page,
    textEvidence: field.textEvidence,
    sourceType: field.sourceType,
    manuallyEdited: field.manuallyEdited,
    confirmedValue: field.confirmedValue,
    confirmedBy: field.confirmedBy,
    confirmedAt: field.confirmedAt,
  }));
}

export function resolveConfirmedValuesForActionPlan(
  confirmedData: Record<string, unknown>,
): Record<string, unknown> {
  return { ...confirmedData };
}
