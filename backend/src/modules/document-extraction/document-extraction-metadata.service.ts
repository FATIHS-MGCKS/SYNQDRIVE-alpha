import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentExtractionErrorPhase,
  DocumentExtractionStage,
  DocumentExtractionStatus,
} from '@prisma/client';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  AUTO_CLASSIFICATION_REQUEST,
  resolveMaxUploadBytes,
  SUPPORTED_DOCUMENT_TYPES,
} from './document-extraction.schemas';
import { DOCUMENT_UPLOAD_DUPLICATE_STATUSES } from './document-upload-duplicate.types';
import { DocumentExtractionMetadataDto } from './dto/document-extraction-metadata.dto';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SUBTYPES,
  DOCUMENT_TAXONOMY_VERSION,
} from './document-taxonomy.types';

const PUBLIC_STATUSES: DocumentExtractionStatus[] = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'AWAITING_DOCUMENT_TYPE',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
];

const PUBLIC_STAGES: DocumentExtractionStage[] = [
  'UPLOAD',
  'STORAGE',
  'QUEUE',
  'OCR',
  'CLASSIFICATION',
  'EXTRACTION',
  'VALIDATION',
  'REVIEW',
  'APPLY',
];

const PUBLIC_ERROR_PHASES: DocumentExtractionErrorPhase[] = [
  'UPLOAD',
  'STORAGE',
  'QUEUE',
  'OCR',
  'CLASSIFICATION',
  'EXTRACTION',
  'VALIDATION',
  'APPLY',
  'UNKNOWN',
];

@Injectable()
export class DocumentExtractionMetadataService {
  constructor(private readonly config: ConfigService) {}

  getMetadata(): DocumentExtractionMetadataDto {
    const maxUploadMb = this.config.get<number>('documentExtraction.maxUploadMb', 10);
    const maxUploadBytes = resolveMaxUploadBytes(maxUploadMb);

    return {
      documentTypes: SUPPORTED_DOCUMENT_TYPES.map((value) => ({
        value,
        labelKey: `documentExtraction.type.${value}`,
      })),
      documentCategories: DOCUMENT_CATEGORIES.map((value) => ({
        value,
        labelKey: `documentExtraction.category.${value}`,
      })),
      documentSubtypes: DOCUMENT_SUBTYPES.map((value) => ({
        value,
        labelKey: `documentExtraction.subtype.${value}`,
      })),
      taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
      classificationOptions: [
        {
          value: AUTO_CLASSIFICATION_REQUEST,
          labelKey: 'documentExtraction.classification.AUTO',
        },
      ],
      mimeTypes: [...ALLOWED_MIME_TYPES],
      extensions: [...ALLOWED_EXTENSIONS],
      maxUploadBytes,
      maxUploadMb,
      statuses: PUBLIC_STATUSES.map((value) => ({
        value,
        labelKey: `documentExtraction.status.${value}`,
      })),
      stages: PUBLIC_STAGES.map((value) => ({
        value,
        labelKey: `documentExtraction.stage.${value}`,
      })),
      errorPhases: PUBLIC_ERROR_PHASES.map((value) => ({
        value,
        labelKey: `documentExtraction.errorPhase.${value}`,
      })),
      uploadDuplicateStatuses: DOCUMENT_UPLOAD_DUPLICATE_STATUSES.map((value) => ({
        value,
        labelKey: `documentExtraction.uploadDuplicate.${value}`,
      })),
    };
  }
}
