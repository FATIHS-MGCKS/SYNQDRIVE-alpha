import {
  FIXTURE_CORRUPT_PDF,
  FIXTURE_MULTI_PAGE_PDF,
  FIXTURE_PASSWORD_PDF,
  FIXTURE_SCANNED_PDF,
  buildComplexPdfFixture,
} from '@modules/document-extraction/__fixtures__/document-fixtures';
import { probeLegalPdfSecurity } from './legal-document-pdf-security-probe.util';
import { LegalDocumentPdfValidationService } from './legal-document-pdf-validation.service';
import { LEGAL_DOCUMENT_VALIDATION_ERROR_CODES } from './legal-document-scan-status.constants';

/** Minimal valid PDF that survives magic-byte probe and pdf-parse v2. */
export const FIXTURE_VALID_LEGAL_PDF = Buffer.from(`%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 50 100 Td (Hello) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000370 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
459
%%EOF`);


function buildPdfWithJavaScript(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Page/Parent 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[1 0 R]/Count 1>>endobj\n3 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj\ntrailer<</Root 2 0 R>>\n%%EOF\n',
    'ascii',
  );
}

function buildPdfWithLaunchAction(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Page/Parent 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[1 0 R]/Count 1>>endobj\n3 0 obj<</OpenAction<</S/Launch/F(test.exe)>>>>endobj\ntrailer<</Root 2 0 R>>\n%%EOF\n',
    'ascii',
  );
}

function buildPdfWithEmbeddedFile(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Page/Parent 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[1 0 R]/Count 1>>endobj\n3 0 obj<</Type/Filespec/EF<</F 4 0 R>>>>endobj\ntrailer<</Root 2 0 R>>\n%%EOF\n',
    'ascii',
  );
}

describe('legal-document-pdf-security-probe.util', () => {
  it('detects JavaScript, launch actions, and embedded files', () => {
    expect(probeLegalPdfSecurity(buildPdfWithJavaScript()).hasJavaScript).toBe(true);
    expect(probeLegalPdfSecurity(buildPdfWithLaunchAction()).hasLaunchActions).toBe(true);
    expect(probeLegalPdfSecurity(buildPdfWithEmbeddedFile()).hasEmbeddedFiles).toBe(true);
    expect(probeLegalPdfSecurity(FIXTURE_SCANNED_PDF).activeContentReasons).toEqual([]);
  });
});

describe('LegalDocumentPdfValidationService', () => {
  const config = {
    maxLegalUploadMb: 1,
    legalPdfValidationTimeoutMs: 5_000,
    legalPdfMaxPages: 2,
    legalPdfMaxObjects: 5_000,
    legalPdfMaxStreams: 2_000,
    legalPdfMaxDecompressedBytes: 80 * 1024 * 1024,
  };
  const svc = new LegalDocumentPdfValidationService(config as any);

  it('rejects fake .pdf content (not a real PDF)', async () => {
    const result = await svc.validate({
      buffer: Buffer.from('not a pdf at all', 'utf8'),
      mimeType: 'application/pdf',
      fileName: 'fake.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.NOT_PDF);
    }
  });

  it('rejects corrupted PDF', async () => {
    const result = await svc.validate({
      buffer: FIXTURE_CORRUPT_PDF,
      mimeType: 'application/pdf',
      fileName: 'broken.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.CORRUPT);
    }
  });

  it('rejects encrypted/password-protected PDF', async () => {
    const result = await svc.validate({
      buffer: FIXTURE_PASSWORD_PDF,
      mimeType: 'application/pdf',
      fileName: 'locked.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.PASSWORD_PROTECTED);
    }
  });

  it('rejects PDF with active JavaScript', async () => {
    const result = await svc.validate({
      buffer: buildPdfWithJavaScript(),
      mimeType: 'application/pdf',
      fileName: 'active.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.ACTIVE_JAVASCRIPT);
    }
  });

  it('rejects PDF with launch actions', async () => {
    const result = await svc.validate({
      buffer: buildPdfWithLaunchAction(),
      mimeType: 'application/pdf',
      fileName: 'launch.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.ACTIVE_LAUNCH_ACTION);
    }
  });

  it('rejects PDF with embedded files', async () => {
    const result = await svc.validate({
      buffer: buildPdfWithEmbeddedFile(),
      mimeType: 'application/pdf',
      fileName: 'embedded.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.EMBEDDED_FILES);
    }
  });

  it('rejects PDF exceeding size limit', async () => {
    const strictSvc = new LegalDocumentPdfValidationService({
      ...config,
      maxLegalUploadMb: 0.000001,
    } as any);
    const result = await strictSvc.validate({
      buffer: FIXTURE_SCANNED_PDF,
      mimeType: 'application/pdf',
      fileName: 'big.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.FILE_TOO_LARGE);
    }
  });

  it('rejects PDF with too many pages', async () => {
    const result = await svc.validate({
      buffer: FIXTURE_MULTI_PAGE_PDF,
      mimeType: 'application/pdf',
      fileName: 'many-pages.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.TOO_MANY_PAGES);
    }
  });

  it('rejects overly complex PDF structures', async () => {
    const strictSvc = new LegalDocumentPdfValidationService({
      ...config,
      legalPdfMaxDecompressedBytes: 10,
    } as any);
    const result = await strictSvc.validate({
      buffer: buildComplexPdfFixture(1_000_000),
      mimeType: 'application/pdf',
      fileName: 'complex.pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.TOO_COMPLEX);
    }
  });

  it('accepts a valid minimal PDF when parse succeeds', async () => {
    const relaxedSvc = new LegalDocumentPdfValidationService({
      ...config,
      legalPdfMaxPages: 10,
    } as any);
    jest.spyOn(relaxedSvc as any, 'parsePdf').mockResolvedValue({ ok: true, pageCount: 1 });
    const result = await relaxedSvc.validate({
      buffer: FIXTURE_VALID_LEGAL_PDF,
      mimeType: 'application/pdf',
      fileName: 'valid.pdf',
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        pageCount: 1,
        sizeBytes: FIXTURE_VALID_LEGAL_PDF.length,
      }),
    );
  });
});
