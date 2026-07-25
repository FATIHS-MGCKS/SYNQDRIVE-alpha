import { describe, expect, it } from 'vitest';
import {
  createClientUploadId,
  hasBlockingUploads,
  isTerminalUploadStatus,
  mapServerUploadStatus,
  NON_RETRYABLE_ERROR_CODES,
} from './operatorUploadQueue.types';
import { dataUrlToBlob } from './operatorUploadQueue.utils';

describe('operatorUploadQueue.types', () => {
  it('creates unique client upload ids', () => {
    const a = createClientUploadId();
    const b = createClientUploadId();
    expect(a).not.toBe(b);
    expect(a.startsWith('op-upload-')).toBe(true);
  });

  it('maps server statuses', () => {
    expect(mapServerUploadStatus('UPLOADED')).toBe('uploaded');
    expect(mapServerUploadStatus('FAILED')).toBe('failed');
  });

  it('detects blocking required uploads', () => {
    expect(
      hasBlockingUploads([
        {
          clientUploadId: 'a',
          kind: 'DAMAGE_IMAGE',
          status: 'pending',
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          required: true,
          progressPercent: 0,
          retryable: true,
          attemptCount: 0,
          maxAttempts: 5,
          errorMessage: null,
          targetRefType: null,
          targetRefId: null,
          blobKey: null,
          abortController: null,
        },
      ]),
    ).toBe(true);
    expect(
      hasBlockingUploads([
        {
          clientUploadId: 'a',
          kind: 'DAMAGE_IMAGE',
          status: 'uploaded',
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          required: true,
          progressPercent: 100,
          retryable: true,
          attemptCount: 1,
          maxAttempts: 5,
          errorMessage: null,
          targetRefType: null,
          targetRefId: null,
          blobKey: null,
          abortController: null,
        },
      ]),
    ).toBe(false);
  });

  it('treats validation errors as non-retryable', () => {
    expect(NON_RETRYABLE_ERROR_CODES.has('OPERATOR_UPLOAD_VALIDATION')).toBe(true);
  });

  it('recognizes terminal statuses', () => {
    expect(isTerminalUploadStatus('uploaded')).toBe(true);
    expect(isTerminalUploadStatus('pending')).toBe(false);
  });
});

describe('operatorUploadQueue.utils', () => {
  it('converts data url to blob', () => {
    const blob = dataUrlToBlob('data:image/png;base64,aa==');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('image/png');
  });
});
