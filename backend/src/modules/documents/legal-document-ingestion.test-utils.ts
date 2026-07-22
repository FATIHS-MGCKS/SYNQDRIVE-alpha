import { LegalDocumentIngestionService } from './legal-document-ingestion.service';

export function createNoopLegalDocumentIngestionService(): Pick<
  LegalDocumentIngestionService,
  'ingest'
> {
  return {
    ingest: jest.fn(async (input) => ({
      ok: true as const,
      objectKey: 'test/object-key.pdf',
      storageProvider: 'local',
      sizeBytes: input.buffer.length,
      mimeType: 'application/pdf',
      checksum: 'test-checksum',
      pageCount: 1,
      scanStatus: 'SCAN_PASSED',
      validatedAt: new Date(),
      malwareScannedAt: null,
      malwareScannerId: null,
      quarantineObjectKey: null,
    })),
  };
}
