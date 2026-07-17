import type {
  DocumentUploadDuplicateStatus,
  PipelineUploadDuplicatePayload,
  PublicUploadDuplicateDto,
  UploadDuplicateBusinessMatch,
  UploadDuplicateExistingExtraction,
} from '../document-upload-duplicate.types';
import { readPipelinePayload } from '../document-content-cache.util';

export type { PublicUploadDuplicateDto };

export function readPipelineUploadDuplicate(plausibility: unknown): PipelineUploadDuplicatePayload | null {
  const payload = readPipelinePayload(plausibility).uploadDuplicate;
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as PipelineUploadDuplicatePayload;
  if (!row.status) return null;
  return row;
}

export function buildPublicUploadDuplicateDto(input: {
  status: DocumentUploadDuplicateStatus | string | null | undefined;
  relatedExtractionId?: string | null;
  reuploadReason?: string | null;
  existingExtraction?: UploadDuplicateExistingExtraction | null;
  businessMatch?: UploadDuplicateBusinessMatch | null;
  plausibility?: unknown;
}): PublicUploadDuplicateDto | null {
  if (!input.status) return null;
  const pipeline = readPipelineUploadDuplicate(input.plausibility);
  return {
    status: input.status as DocumentUploadDuplicateStatus,
    relatedExtractionId: input.relatedExtractionId ?? pipeline?.relatedExtractionId ?? null,
    reuploadReason: input.reuploadReason ?? null,
    existingExtraction: input.existingExtraction ?? pipeline?.existingExtraction ?? null,
    businessMatch: input.businessMatch ?? pipeline?.businessMatch ?? null,
  };
}
