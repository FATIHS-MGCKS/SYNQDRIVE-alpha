import { NotFoundException } from '@nestjs/common';
import { Readable } from 'stream';
import { LegalDocumentChecksumVerificationService } from './legal-document-checksum-verification.service';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from './legal-document-integrity.constants';
import type { DocumentStoragePort } from '../storage/document-storage.interface';

function storageStub(overrides: Partial<DocumentStoragePort> = {}): DocumentStoragePort {
  return {
    provider: 'local',
    putObject: jest.fn(),
    putQuarantineObject: jest.fn(),
    promoteQuarantineToClean: jest.fn(),
    getObject: jest.fn(),
    getObjectStream: jest.fn(),
    deleteObject: jest.fn(),
    getInternalPath: jest.fn(),
    checkHealth: jest.fn(),
    listObjectKeysForOrganization: jest.fn(),
    ...overrides,
  } as DocumentStoragePort;
}

describe('LegalDocumentChecksumVerificationService', () => {
  const input = {
    organizationId: 'org-1',
    legalDocumentId: 'doc-1',
    objectKey: 'organizations/org-1/legal/x.pdf',
    checksum: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    sizeBytes: 3,
  };

  it('returns VERIFIED when metadata hash matches', async () => {
    const storage = storageStub({
      getObjectMetadata: jest.fn().mockResolvedValue({
        objectKey: input.objectKey,
        sizeBytes: 3,
        mimeType: 'application/pdf',
        contentHash: input.checksum,
        etag: input.checksum,
      }),
    });
    const svc = new LegalDocumentChecksumVerificationService(storage);
    const result = await svc.verify(input);
    expect(result.status).toBe(LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED);
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it('returns CHECKSUM_MISMATCH when streamed hash differs', async () => {
    const storage = storageStub({
      getObjectMetadata: jest.fn().mockResolvedValue({
        objectKey: input.objectKey,
        sizeBytes: 3,
        mimeType: 'application/pdf',
        contentHash: null,
        etag: null,
      }),
      getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('bad')])),
    });
    const svc = new LegalDocumentChecksumVerificationService(storage);
    const result = await svc.verify(input);
    expect(result.status).toBe(LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH);
  });

  it('returns MISSING_OBJECT when storage throws NotFoundException', async () => {
    const storage = storageStub({
      getObjectMetadata: jest.fn().mockRejectedValue(new NotFoundException()),
      getObjectStream: jest.fn().mockRejectedValue(new NotFoundException()),
    });
    const svc = new LegalDocumentChecksumVerificationService(storage);
    const result = await svc.verify(input);
    expect(result.status).toBe(LEGAL_DOCUMENT_INTEGRITY_STATUS.MISSING_OBJECT);
  });
});
