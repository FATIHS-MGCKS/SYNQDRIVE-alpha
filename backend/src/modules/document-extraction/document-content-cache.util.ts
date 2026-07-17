import { DocumentStructuredContent } from './document-page.types';

export const PIPELINE_PLAUSIBILITY_KEY = '_pipeline' as const;

export interface DocumentContentCacheEntry extends DocumentStructuredContent {
  objectKey: string;
  cachedAt: string;
  ocrProvider?: string | null;
  ocrModel?: string | null;
}

export interface PipelinePlausibilityPayload {
  contentCache?: DocumentContentCacheEntry;
  documentTypeAudit?: DocumentTypeAuditEntry[];
  actionAudit?: ExtractionActionAuditEntry[];
  actionPlan?: import('./document-action-plan.types').DocumentActionPlan;
  actionPlanExecution?: import('./document-action.types').DocumentActionPlanExecution;
  actionPlanApplyLifecycle?: import('./document-action-plan.state-machine').DocumentActionPlanApplyLifecycle;
  fileFingerprint?: import('./document-extraction-fingerprint.types').DocumentExtractionFileFingerprint;
  uploadDuplicate?: import('./document-upload-duplicate.types').PipelineUploadDuplicatePayload;
}

export interface DocumentTypeAuditEntry {
  from: string | null;
  to: string;
  at: string;
  userId?: string | null;
  reason: string;
}

export interface ExtractionActionAuditEntry {
  action: string;
  at: string;
  userId?: string | null;
  details?: Record<string, unknown>;
}

export function readPipelinePayload(plausibility: unknown): PipelinePlausibilityPayload {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return {};
  }
  const root = plausibility as Record<string, unknown>;
  const pipeline = root[PIPELINE_PLAUSIBILITY_KEY];
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return {};
  }
  return pipeline as PipelinePlausibilityPayload;
}

export function readContentCache(
  plausibility: unknown,
  objectKey: string,
): DocumentContentCacheEntry | null {
  const cache = readPipelinePayload(plausibility).contentCache;
  if (!cache || cache.objectKey !== objectKey) return null;
  if (!cache.text || !Array.isArray(cache.pages)) return null;
  return cache;
}

export function buildContentCacheEntry(
  content: DocumentStructuredContent & {
    ocrProvider?: string | null;
    ocrModel?: string | null;
  },
  objectKey: string,
): DocumentContentCacheEntry {
  return {
    ...content,
    objectKey,
    cachedAt: new Date().toISOString(),
    ocrProvider: content.ocrProvider ?? null,
    ocrModel: content.ocrModel ?? null,
  };
}

export function mergePipelinePlausibility(
  existing: unknown,
  patch: PipelinePlausibilityPayload,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const current = readPipelinePayload(existing);
  base[PIPELINE_PLAUSIBILITY_KEY] = {
    ...current,
    ...patch,
    documentTypeAudit: patch.documentTypeAudit ?? current.documentTypeAudit,
    actionAudit: patch.actionAudit ?? current.actionAudit,
    contentCache: patch.contentCache ?? current.contentCache,
    actionPlan: patch.actionPlan ?? current.actionPlan,
    actionPlanExecution: patch.actionPlanExecution ?? current.actionPlanExecution,
    actionPlanApplyLifecycle: patch.actionPlanApplyLifecycle ?? current.actionPlanApplyLifecycle,
    fileFingerprint: patch.fileFingerprint ?? current.fileFingerprint,
  };
  return base;
}

export function stripPipelineFromPlausibility(plausibility: unknown): unknown {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return plausibility;
  }
  const copy = { ...(plausibility as Record<string, unknown>) };
  delete copy[PIPELINE_PLAUSIBILITY_KEY];
  return copy;
}

export function appendDocumentTypeAudit(
  plausibility: unknown,
  entry: DocumentTypeAuditEntry,
): Record<string, unknown> {
  const current = readPipelinePayload(plausibility);
  const audit = [...(current.documentTypeAudit ?? []), entry];
  return mergePipelinePlausibility(plausibility, { documentTypeAudit: audit });
}

export function appendExtractionActionAudit(
  plausibility: unknown,
  entry: ExtractionActionAuditEntry,
): Record<string, unknown> {
  const current = readPipelinePayload(plausibility);
  const audit = [...(current.actionAudit ?? []), entry].slice(-50);
  return mergePipelinePlausibility(plausibility, { actionAudit: audit });
}

export function readPublicActionAudit(plausibility: unknown): ExtractionActionAuditEntry[] {
  return readPipelinePayload(plausibility).actionAudit ?? [];
}

export function readPublicTypeAudit(plausibility: unknown): DocumentTypeAuditEntry[] {
  return readPipelinePayload(plausibility).documentTypeAudit ?? [];
}
