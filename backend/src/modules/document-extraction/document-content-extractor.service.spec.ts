import { DocumentContentExtractorService } from './document-content-extractor.service';
import { DocumentTextExtractorService } from './document-text-extractor.service';
import { DocumentFileIdentificationService } from './document-file-identification.service';
import { DOCUMENT_PIPELINE_ERROR_CODES } from './document-extraction.errors';
import {
  FIXTURE_DIGITAL_PDF_TEXT,
  FIXTURE_JPEG,
  FIXTURE_SCANNED_PDF,
  FIXTURE_TXT,
} from './__fixtures__/document-fixtures';

describe('DocumentContentExtractorService', () => {
  const config = {
    maxUploadMb: 10,
    pdfMinTextChars: 20,
    pdfMinSensibleCharRatio: 0.45,
    pdfMaxRepeatedLineRatio: 0.7,
  };

  function makeService(overrides?: {
    tryExtractPdfText?: jest.Mock;
    ocrProcess?: jest.Mock;
    ocrConfigured?: boolean;
  }) {
    const localExtractor = {
      extractPlainText: jest.fn((buffer: Buffer) => new DocumentTextExtractorService().extractPlainText(buffer)),
      tryExtractPdfText: overrides?.tryExtractPdfText ?? jest.fn().mockResolvedValue(null),
    } as unknown as DocumentTextExtractorService;

    const mistralOcr = {
      isConfigured: jest.fn().mockReturnValue(overrides?.ocrConfigured ?? true),
      process: overrides?.ocrProcess ?? jest.fn(),
    };

    const svc = new DocumentContentExtractorService(
      new DocumentFileIdentificationService(config as any),
      localExtractor,
      mistralOcr as any,
      config as any,
    );

    return { svc, localExtractor, mistralOcr };
  }

  it('routes TXT directly', async () => {
    const { svc } = makeService();
    const result = await svc.extractContent({
      buffer: FIXTURE_TXT,
      mimeType: 'text/plain',
      fileName: 'note.txt',
    });
    expect(result.sourceMethod).toBe('TXT_DIRECT');
    expect(result.text).toContain('Km-Stand');
  });

  it('uses PDF text layer when quality is sufficient', async () => {
    const { svc, mistralOcr } = makeService({
      tryExtractPdfText: jest.fn().mockResolvedValue({
        text: FIXTURE_DIGITAL_PDF_TEXT,
        pages: [{ pageNumber: 1, text: FIXTURE_DIGITAL_PDF_TEXT }],
        pageBoundaryReliable: true,
      }),
    });
    const result = await svc.extractContent({
      buffer: FIXTURE_SCANNED_PDF,
      mimeType: 'application/pdf',
    });
    expect(result.sourceMethod).toBe('TEXT_LAYER');
    expect(mistralOcr.process).not.toHaveBeenCalled();
  });

  it('falls back to OCR for scanned PDFs without a text layer', async () => {
    const ocrProcess = jest.fn().mockResolvedValue({
      normalizedMarkdown: '--- PAGE 1 ---\nScanned invoice text',
      pageCount: 1,
      provider: 'mistral',
      model: 'mistral-ocr-latest',
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          markdown: 'Scanned invoice text',
          header: null,
          footer: null,
        },
      ],
    });
    const { svc } = makeService({
      tryExtractPdfText: jest.fn().mockResolvedValue(null),
      ocrProcess,
    });
    const result = await svc.extractContent({
      buffer: FIXTURE_SCANNED_PDF,
      mimeType: 'application/pdf',
      extractionId: 'ext-1',
    });
    expect(result.sourceMethod).toBe('OCR');
    expect(result.text).toContain('--- PAGE 1 ---');
    expect(ocrProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'application/pdf',
        extractionId: 'ext-1',
      }),
    );
  });

  it('routes images to OCR', async () => {
    const ocrProcess = jest.fn().mockResolvedValue({
      normalizedMarkdown: '--- PAGE 1 ---\nPlate ABC-123',
      pageCount: 1,
      provider: 'mistral',
      model: 'mistral-ocr-latest',
      pages: [
        {
          pageIndex: 0,
          pageNumber: 1,
          markdown: 'Plate ABC-123',
          header: null,
          footer: null,
        },
      ],
    });
    const { svc } = makeService({ ocrProcess });
    const result = await svc.extractContent({
      buffer: FIXTURE_JPEG,
      mimeType: 'image/jpeg',
    });
    expect(result.sourceMethod).toBe('OCR');
    expect(result.ocrProvider).toBe('mistral');
  });

  it('maps empty OCR output to OCR_EMPTY_RESULT', async () => {
    const ocrProcess = jest.fn().mockResolvedValue({
      normalizedMarkdown: '   ',
      pageCount: 0,
      provider: 'mistral',
      model: 'mistral-ocr-latest',
    });
    const { svc } = makeService({ ocrProcess });
    await expect(
      svc.extractContent({ buffer: FIXTURE_JPEG, mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_EMPTY_RESULT });
  });

  it('maps OCR provider failures to OCR_FAILED', async () => {
    const { MistralOcrError, MISTRAL_OCR_ERROR_CODES } = require('@modules/ai/providers/mistral/mistral-ocr.errors');
    const ocrProcess = jest.fn().mockRejectedValue(
      new MistralOcrError({
        code: MISTRAL_OCR_ERROR_CODES.OCR_PROVIDER_UNAVAILABLE,
        safeMessage: 'OCR provider is temporarily unavailable',
        retryable: true,
      }),
    );
    const { svc } = makeService({ ocrProcess });
    await expect(
      svc.extractContent({ buffer: FIXTURE_JPEG, mimeType: 'image/jpeg' }),
    ).rejects.toMatchObject({ code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED, retryable: true });
  });
});
