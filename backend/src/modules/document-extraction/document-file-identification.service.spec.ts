import { DocumentFileIdentificationService } from './document-file-identification.service';
import { DOCUMENT_PIPELINE_ERROR_CODES } from './document-extraction.errors';
import {
  FIXTURE_CORRUPT_JPEG,
  FIXTURE_CORRUPT_PDF,
  FIXTURE_JPEG,
  FIXTURE_PNG,
  FIXTURE_SCANNED_PDF,
  FIXTURE_TXT,
  FIXTURE_WEBP,
} from './__fixtures__/document-fixtures';

describe('DocumentFileIdentificationService', () => {
  const config = {
    maxUploadMb: 10,
    pdfMinTextChars: 40,
    pdfMinSensibleCharRatio: 0.45,
    pdfMaxRepeatedLineRatio: 0.7,
  };
  const svc = new DocumentFileIdentificationService(config as any);

  it('identifies plain text without magic bytes', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_TXT,
      clientMimeType: 'text/plain',
      originalName: 'notes.txt',
    });
    expect(identified.detectedKind).toBe('plain-text');
    expect(identified.displayFileName).toBe('notes.txt');
  });

  it('identifies JPEG, PNG, and WebP from magic bytes', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_JPEG, clientMimeType: 'image/jpeg' }),
    ).resolves.toMatchObject({ detectedKind: 'jpeg' });
    await expect(
      svc.identify({ buffer: FIXTURE_PNG, clientMimeType: 'image/png' }),
    ).resolves.toMatchObject({ detectedKind: 'png' });
    await expect(
      svc.identify({ buffer: FIXTURE_WEBP, clientMimeType: 'image/webp' }),
    ).resolves.toMatchObject({ detectedKind: 'webp' });
  });

  it('identifies PDF from magic bytes', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_SCANNED_PDF,
      clientMimeType: 'application/pdf',
      originalName: 'scan.pdf',
    });
    expect(identified.detectedKind).toBe('pdf');
  });

  it('rejects empty files', async () => {
    await expect(
      svc.identify({ buffer: Buffer.alloc(0), clientMimeType: 'text/plain' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_EMPTY });
  });

  it('rejects files over the configured limit', async () => {
    const smallLimitSvc = new DocumentFileIdentificationService({ maxUploadMb: 0.00001 } as any);
    await expect(
      smallLimitSvc.identify({ buffer: FIXTURE_TXT, clientMimeType: 'text/plain' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_LARGE });
  });

  it('rejects unsupported client mime types', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_TXT, clientMimeType: 'application/zip' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED });
  });

  it('rejects MIME spoofing (PDF declared, JPEG content)', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_JPEG, clientMimeType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_MISMATCH });
  });

  it('rejects path traversal in filenames', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_TXT,
      clientMimeType: 'text/plain',
      originalName: '../../etc/passwd',
    });
    expect(identified.displayFileName).toBe('passwd');
  });

  it('rejects binary content declared as plain text', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_JPEG, clientMimeType: 'text/plain' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_MISMATCH });
  });

  it('accepts harmless image/jpg alias for JPEG content', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_JPEG,
      clientMimeType: 'image/jpg',
    });
    expect(identified.detectedMime).toBe('image/jpeg');
  });

  it('flags corrupt PDF magic with mismatched declaration when content is not text', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_CORRUPT_PDF, clientMimeType: 'application/zip' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED });
  });

  it('detects JPEG magic even for corrupt trailing bytes', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_CORRUPT_JPEG,
      clientMimeType: 'image/jpeg',
    });
    expect(identified.detectedKind).toBe('jpeg');
  });
});
