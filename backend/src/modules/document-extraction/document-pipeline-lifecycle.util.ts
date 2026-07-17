import { PIPELINE_PLAUSIBILITY_KEY, readPipelinePayload } from './document-content-cache.util';
import type {
  DocumentLegalHoldState,
  DocumentMistralDataTransferState,
  DocumentPipelineLifecyclePayload,
  DocumentRetentionState,
  DocumentStorageCapabilities,
} from './document-storage-lifecycle.types';

export function readPipelineLifecycle(plausibility: unknown): DocumentPipelineLifecyclePayload {
  return readPipelinePayload(plausibility).lifecycle ?? {};
}

export function isDocumentLegalHoldActive(plausibility: unknown): boolean {
  return readPipelineLifecycle(plausibility).legalHold?.active === true;
}

export function mergePipelineLifecycle(
  existing: unknown,
  patch: DocumentPipelineLifecyclePayload,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const current = readPipelinePayload(existing);
  const lifecycle = current.lifecycle ?? {};
  base[PIPELINE_PLAUSIBILITY_KEY] = {
    ...current,
    lifecycle: {
      ...lifecycle,
      ...patch,
      storage: patch.storage ?? lifecycle.storage,
      retention: patch.retention ?? lifecycle.retention,
      legalHold: patch.legalHold ?? lifecycle.legalHold,
      mistralTransfer: patch.mistralTransfer ?? lifecycle.mistralTransfer,
    },
  };
  return base;
}

export function buildInitialLifecycleSnapshot(input: {
  storageCapabilities: DocumentStorageCapabilities;
  policyVersion: string;
}): DocumentPipelineLifecyclePayload {
  return {
    storage: input.storageCapabilities,
    retention: {
      policyVersion: input.policyVersion,
    },
    legalHold: { active: false },
    mistralTransfer: {
      provider: 'mistral',
      status: 'not_sent',
      includesDocumentBytes: false,
      includesImageBase64: false,
    },
  };
}

export function stripSensitiveOcrFromPlausibility(plausibility: unknown): Record<string, unknown> {
  const base =
    plausibility && typeof plausibility === 'object' && !Array.isArray(plausibility)
      ? { ...(plausibility as Record<string, unknown>) }
      : {};
  const current = readPipelinePayload(plausibility);
  if (!current.contentCache) return base;
  const { contentCache: _removed, ...restPipeline } = current;
  base[PIPELINE_PLAUSIBILITY_KEY] = restPipeline;
  return base;
}

export function patchRetentionState(
  plausibility: unknown,
  patch: Partial<DocumentRetentionState>,
): Record<string, unknown> {
  const lifecycle = readPipelineLifecycle(plausibility);
  return mergePipelineLifecycle(plausibility, {
    retention: {
      policyVersion: lifecycle.retention?.policyVersion ?? patch.policyVersion ?? 'unknown',
      ...lifecycle.retention,
      ...patch,
    },
  });
}

export function patchLegalHoldState(
  plausibility: unknown,
  legalHold: DocumentLegalHoldState,
): Record<string, unknown> {
  return mergePipelineLifecycle(plausibility, { legalHold });
}

export function patchMistralTransferState(
  plausibility: unknown,
  mistralTransfer: DocumentMistralDataTransferState,
): Record<string, unknown> {
  return mergePipelineLifecycle(plausibility, { mistralTransfer });
}
