import { randomUUID } from 'crypto';
import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';
import type { DocumentAiExtractResult } from '@modules/ai/documents/document-ai-extraction.types';
import type { FieldDef } from './document-extraction.schemas';
import { normalizeExtractedFieldValue } from '@modules/ai/documents/document-ai-extraction.schema.util';
import {
  mergePipelinePlausibility,
  readPipelinePayload,
  type PipelinePlausibilityPayload,
} from './document-content-cache.util';
import { makePlausibilityCheck } from './document-plausibility.types';
import type { PlausibilityCheck } from './document-plausibility.types';
import type {
  ResolvedExtractionSchema,
  StructuredExtractionPayload,
  StructuredExtractionRun,
  StructuredExtractionTrigger,
  StructuredFieldProvenance,
  StructuredFieldValue,
  SupersededStructuredExtractionRun,
} from './document-structured-extraction.types';
import { DOCUMENT_STRUCTURED_EXTRACTION_VERSION } from './document-structured-extraction.types';

function readNested(source: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return source[key];
  const [parent, child] = key.split('.');
  const obj = source[parent];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  return (obj as Record<string, unknown>)[child];
}

function setNested(target: Record<string, unknown>, key: string, value: unknown): void {
  if (!key.includes('.')) {
    target[key] = value;
    return;
  }
  const [parent, child] = key.split('.');
  const obj = (target[parent] as Record<string, unknown>) ?? {};
  obj[child] = value;
  target[parent] = obj;
}

function deriveFieldConfidence(evidence: FieldExtractionEvidence | undefined): number | null {
  if (!evidence) return null;
  if (evidence.conflict) return 0.45;
  if (evidence.candidateValues.length === 0) return null;
  if (evidence.candidateValues.length === 1) return 0.9;
  return 0.75;
}

function deriveProvenance(evidence: FieldExtractionEvidence | undefined): StructuredFieldProvenance {
  if (!evidence || evidence.candidateValues.length === 0) return 'missing';
  if (evidence.conflict) return 'conflict';
  if (evidence.candidateValues.length > 1) return 'merged';
  return 'llm';
}

function pickRawValue(evidence: FieldExtractionEvidence | undefined, normalized: unknown): unknown {
  if (!evidence || evidence.candidateValues.length === 0) return null;
  return evidence.candidateValues[0]?.value ?? normalized;
}

export function isFieldPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function collectMissingRequiredFields(
  requiredFields: readonly string[],
  normalizedFlat: Record<string, unknown>,
): string[] {
  return requiredFields.filter((key) => !isFieldPresent(readNested(normalizedFlat, key)));
}

export function buildNormalizedFlatFromSchema(
  schemaFields: FieldDef[],
  normalizedValues: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schemaFields) {
    const value = readNested(normalizedValues, field.key);
    setNested(out, field.key, normalizeExtractedFieldValue(value));
  }
  return out;
}

export function buildStructuredFieldValues(input: {
  schemaFields: FieldDef[];
  normalizedFlat: Record<string, unknown>;
  fieldEvidence?: FieldExtractionEvidence[];
}): StructuredFieldValue[] {
  const evidenceByKey = new Map(
    (input.fieldEvidence ?? []).map((row) => [row.key, row] as const),
  );

  return input.schemaFields.map((field) => {
    const evidence = evidenceByKey.get(field.key);
    const normalized = normalizeExtractedFieldValue(readNested(input.normalizedFlat, field.key));
    return {
      key: field.key,
      raw: pickRawValue(evidence, normalized),
      normalized,
      confidence: deriveFieldConfidence(evidence),
      sourcePages: evidence?.sourcePages ?? [],
      provenance: deriveProvenance(evidence),
      conflict: evidence?.conflict ?? false,
    };
  });
}

export function buildStructuredExtractionPayload(input: {
  resolvedSchema: ResolvedExtractionSchema;
  agentResult: Pick<
    DocumentAiExtractResult,
    'fields' | 'fieldEvidence' | 'extractionConflicts'
  >;
}): StructuredExtractionPayload {
  const normalizedFlat = buildNormalizedFlatFromSchema(
    input.resolvedSchema.fields,
    input.agentResult.fields ?? {},
  );
  const fields = buildStructuredFieldValues({
    schemaFields: input.resolvedSchema.fields,
    normalizedFlat,
    fieldEvidence: input.agentResult.fieldEvidence,
  });
  const missingFields = collectMissingRequiredFields(
    input.resolvedSchema.requiredFields,
    normalizedFlat,
  );
  const conflicts = (input.agentResult.extractionConflicts ?? []).map((row) => row.key);

  return {
    contractVersion: DOCUMENT_STRUCTURED_EXTRACTION_VERSION,
    schemaVersion: input.resolvedSchema.schemaVersion,
    documentSubtype: input.resolvedSchema.documentSubtype,
    legacyDocumentType: input.resolvedSchema.legacyDocumentType,
    fields,
    missingFields,
    conflicts,
    normalizedFlat,
  };
}

export function buildStructuredExtractionRun(input: {
  resolvedSchema: ResolvedExtractionSchema;
  structured: StructuredExtractionPayload;
  trigger: StructuredExtractionTrigger;
  startedAt: Date;
  completedAt: Date;
  provider: string | null;
  modelVersion: string | null;
}): StructuredExtractionRun {
  return {
    runId: randomUUID(),
    contractVersion: DOCUMENT_STRUCTURED_EXTRACTION_VERSION,
    schemaVersion: input.resolvedSchema.schemaVersion,
    documentSubtype: input.resolvedSchema.documentSubtype,
    legacyDocumentType: input.resolvedSchema.legacyDocumentType,
    trigger: input.trigger,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    provider: input.provider,
    modelVersion: input.modelVersion,
    fieldCount: input.structured.fields.length,
    missingFieldCount: input.structured.missingFields.length,
    conflictCount: input.structured.conflicts.length,
  };
}

export function collectMissingFieldPlausibilityChecks(
  missingFields: string[],
): Array<Omit<PlausibilityCheck, 'explanation'>> {
  return missingFields.map((fieldKey) =>
    makePlausibilityCheck({
      code: 'STRUCTURED_EXTRACTION_MISSING_REQUIRED',
      status: 'WARNING',
      explanation: `Required field "${fieldKey}" is missing or empty`,
      source: 'SYSTEM',
      fieldPaths: [fieldKey],
    }),
  );
}

export function readStructuredExtractionRun(
  plausibility: unknown,
): StructuredExtractionRun | null {
  const run = readPipelinePayload(plausibility).structuredExtractionRun;
  if (!run || typeof run !== 'object') return null;
  return run as StructuredExtractionRun;
}

export function readStructuredExtractionPayload(
  plausibility: unknown,
): StructuredExtractionPayload | null {
  const payload = readPipelinePayload(plausibility).structuredExtraction;
  if (!payload || typeof payload !== 'object') return null;
  return payload as StructuredExtractionPayload;
}

export function readSupersededExtractionRuns(
  plausibility: unknown,
): SupersededStructuredExtractionRun[] {
  const rows = readPipelinePayload(plausibility).supersededExtractionRuns;
  if (!Array.isArray(rows)) return [];
  return rows as SupersededStructuredExtractionRun[];
}

export function archiveSupersededExtractionRun(input: {
  plausibility: unknown;
  extractedData: unknown;
  supersededReason: 'type_change' | 'reextract';
  previousDocumentType: string | null;
  nextDocumentType: string;
}): Record<string, unknown> {
  const structured = readStructuredExtractionPayload(input.plausibility);
  const run = readStructuredExtractionRun(input.plausibility);
  if (!structured || !run) {
    return typeof input.plausibility === 'object' && input.plausibility && !Array.isArray(input.plausibility)
      ? (input.plausibility as Record<string, unknown>)
      : {};
  }

  const extractedData =
    input.extractedData &&
    typeof input.extractedData === 'object' &&
    !Array.isArray(input.extractedData)
      ? (input.extractedData as Record<string, unknown>)
      : structured.normalizedFlat;

  const superseded: SupersededStructuredExtractionRun = {
    run,
    structuredExtraction: structured,
    extractedData,
    supersededAt: new Date().toISOString(),
    supersededReason: input.supersededReason,
    previousDocumentType: input.previousDocumentType,
    nextDocumentType: input.nextDocumentType,
  };

  const current = readSupersededExtractionRuns(input.plausibility);
  return mergePipelinePlausibility(input.plausibility, {
    supersededExtractionRuns: [...current, superseded],
    structuredExtraction: null,
    structuredExtractionRun: null,
  });
}
