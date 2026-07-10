import { ConfigService } from '@nestjs/config';
import { DocumentExtractionMetadataService } from './document-extraction-metadata.service';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  AUTO_CLASSIFICATION_REQUEST,
  SUPPORTED_DOCUMENT_TYPES,
} from './document-extraction.schemas';

describe('DocumentExtractionMetadataService', () => {
  it('returns canonical upload metadata without storage secrets', () => {
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    const service = new DocumentExtractionMetadataService(config);
    const metadata = service.getMetadata();

    expect(metadata.documentTypes.map((t) => t.value)).toEqual(SUPPORTED_DOCUMENT_TYPES);
    expect(metadata.classificationOptions[0].value).toBe(AUTO_CLASSIFICATION_REQUEST);
    expect(metadata.mimeTypes).toEqual([...ALLOWED_MIME_TYPES]);
    expect(metadata.extensions).toEqual([...ALLOWED_EXTENSIONS]);
    expect(metadata.maxUploadMb).toBe(10);
    expect(metadata.maxUploadBytes).toBe(10 * 1024 * 1024);
    expect(metadata.statuses.some((s) => s.value === 'AWAITING_DOCUMENT_TYPE')).toBe(true);
    expect(metadata.stages.some((s) => s.value === 'CLASSIFICATION')).toBe(true);
    expect(metadata.errorPhases.some((s) => s.value === 'OCR')).toBe(true);
    expect(metadata).not.toHaveProperty('storageProvider');
    expect(metadata).not.toHaveProperty('objectKey');
  });
});
