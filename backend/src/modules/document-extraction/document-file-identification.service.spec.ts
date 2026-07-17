import { DocumentFileIdentificationService } from './document-file-identification.service';
import { DOCUMENT_PIPELINE_ERROR_CODES } from './document-extraction.errors';
import { DOCUMENT_FILE_IDENTIFICATION_STATUSES } from './document-file-identification-status.types';
import {
  buildComplexPdfFixture,
  FIXTURE_CORRUPT_JPEG,
  FIXTURE_CORRUPT_PDF,
  FIXTURE_JPEG,
  FIXTURE_JPEG_ROTATED,
  FIXTURE_MULTI_PAGE_PDF,
  FIXTURE_PASSWORD_PDF,
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
    identifyTimeoutMs: 5_000,
    identifyMaxPdfPages: 50,
    identifyMaxImagePixels: 40_000_000,
    identifyMaxDecompressedBytes: 80 * 1024 * 1024,
    identifyMaxPdfObjects: 5_000,
    identifyMaxPdfStreams: 2_000,
  };
  const svc = new DocumentFileIdentificationService(config as any);

  it('identifies plain text without magic bytes', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_TXT,
      clientMimeType: 'text/plain',
      originalName: 'notes.txt',
    });
    expect(identified.detectedKind).toBe('plain-text');
    expect(identified.identificationStatus).toBe(DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED);
    expect(identified.displayFileName).toBe('notes.txt');
  });

  it('identifies JPEG, PNG, and WebP from magic bytes', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_JPEG, clientMimeType: 'image/jpeg' }),
    ).resolves.toMatchObject({
      detectedKind: 'jpeg',
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED,
      pixelCount: 1,
    });
    await expect(
      svc.identify({ buffer: FIXTURE_PNG, clientMimeType: 'image/png' }),
    ).resolves.toMatchObject({ detectedKind: 'png', pixelCount: 1 });
    await expect(
      svc.identify({ buffer: FIXTURE_WEBP, clientMimeType: 'image/webp' }),
    ).resolves.toMatchObject({ detectedKind: 'webp' });
  });

  it('identifies PDF from magic bytes with page count', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_SCANNED_PDF,
      clientMimeType: 'application/pdf',
      originalName: 'scan.pdf',
    });
    expect(identified.detectedKind).toBe('pdf');
    expect(identified.pageCount).toBe(1);
    expect(identified.identificationStatus).toBe(DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED);
  });

  it('accepts multi-page PDFs within the page limit', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_MULTI_PAGE_PDF,
      clientMimeType: 'application/pdf',
    });
    expect(identified.pageCount).toBe(3);
    expect(identified.identificationStatus).toBe(DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED);
  });

  it('flags rotated JPEG as OCR_REQUIRED without rejecting upload', async () => {
    const identified = await svc.identify({
      buffer: FIXTURE_JPEG_ROTATED,
      clientMimeType: 'image/jpeg',
    });
    expect(identified.identificationStatus).toBe(DOCUMENT_FILE_IDENTIFICATION_STATUSES.OCR_REQUIRED);
    expect(identified.rotationDegrees).toBe(90);
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

  it('rejects corrupt PDF declared as application/pdf', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_CORRUPT_PDF, clientMimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_CORRUPTED,
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_CORRUPT,
    });
  });

  it('rejects password-protected PDF without attempting decryption', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_PASSWORD_PDF, clientMimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: DOCUMENT_PIPELINE_ERROR_CODES.PDF_PASSWORD_REQUIRED,
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.REQUIRES_PASSWORD,
    });
  });

  it('rejects PDFs exceeding the configured page limit', async () => {
    const strictSvc = new DocumentFileIdentificationService({
      ...config,
      identifyMaxPdfPages: 2,
    } as any);
    await expect(
      strictSvc.identify({ buffer: FIXTURE_MULTI_PAGE_PDF, clientMimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_MANY_PAGES,
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_TOO_MANY_PAGES,
    });
  });

  it('rejects overly complex PDF structures (decompressed byte estimate)', async () => {
    const strictSvc = new DocumentFileIdentificationService({
      ...config,
      identifyMaxDecompressedBytes: 100,
    } as any);
    await expect(
      strictSvc.identify({
        buffer: buildComplexPdfFixture(10_000),
        clientMimeType: 'application/pdf',
      }),
    ).rejects.toMatchObject({
      code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_COMPLEX,
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_TOO_COMPLEX,
    });
  });

  it('rejects corrupt JPEG structure after magic-byte detection', async () => {
    await expect(
      svc.identify({ buffer: FIXTURE_CORRUPT_JPEG, clientMimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({
      code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_CORRUPTED,
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_CORRUPT,
    });
  });
});
