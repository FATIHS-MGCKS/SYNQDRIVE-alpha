import { describe, expect, it } from 'vitest';
import {
  DocumentIdentificationRejectedError,
  parseNestedUploadErrorMessage,
  parseUploadIdentificationError,
} from './document-upload-identification';

describe('document-upload-identification', () => {
  it('parses nested Nest BadRequest identification errors', () => {
    const err = parseUploadIdentificationError({
      statusCode: 400,
      message: {
        message: 'Password-protected PDFs are not supported',
        errorCode: 'PDF_PASSWORD_REQUIRED',
        stage: 'UPLOAD',
        identificationStatus: 'REQUIRES_PASSWORD',
      },
    });
    expect(err).not.toBeNull();
    expect(err).toBeInstanceOf(DocumentIdentificationRejectedError);
    expect(err!.payload.errorCode).toBe('PDF_PASSWORD_REQUIRED');
    expect(err!.payload.identificationStatus).toBe('REQUIRES_PASSWORD');
    expect(err!.payload.message).toContain('Passwortgeschützte PDFs');
  });

  it('returns null for unrelated upload errors', () => {
    expect(parseUploadIdentificationError({ message: 'nope', errorCode: 'OTHER' })).toBeNull();
  });

  it('reads nested safe messages for generic upload failures', () => {
    expect(
      parseNestedUploadErrorMessage({
        message: { message: 'File content does not match the declared file type', errorCode: 'MIME_MISMATCH' },
      }),
    ).toBe('File content does not match the declared file type');
  });
});
