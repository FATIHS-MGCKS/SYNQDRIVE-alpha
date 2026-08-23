import { Readable } from 'stream';
import type { DocumentStoragePort } from '../document-storage.interface';

const defaultPutResult = {
  objectKey: 'test/object-key',
  storageProvider: 'test',
  sizeBytes: 0,
  mimeType: 'application/octet-stream',
  contentHash: '0'.repeat(64),
  etag: null,
};

/** Minimal DocumentStoragePort double for unit/integration tests. */
export function createDocumentStoragePortMock(
  overrides: Partial<DocumentStoragePort> = {},
): DocumentStoragePort {
  return {
    provider: 'test',
    putObject: jest.fn().mockResolvedValue(defaultPutResult),
    putQuarantineObject: jest.fn().mockResolvedValue(defaultPutResult),
    promoteQuarantineToClean: jest.fn().mockResolvedValue(defaultPutResult),
    getObject: jest.fn().mockResolvedValue(Buffer.alloc(0)),
    getObjectStream: jest.fn().mockResolvedValue(Readable.from([])),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getInternalPath: jest.fn().mockReturnValue(null),
    checkHealth: jest.fn().mockResolvedValue({
      healthy: true,
      provider: 'test',
      checkedAt: new Date(),
    }),
    listObjectKeysForOrganization: jest.fn().mockResolvedValue({ keys: [], nextCursor: null }),
    ...overrides,
  };
}
