import { MistralError } from '@mistralai/mistralai/models/errors/mistralerror.js';
import { RequestTimeoutError } from '@mistralai/mistralai/models/errors/httpclienterrors.js';
import { TableFormat } from '@mistralai/mistralai/models/components';
import { MistralOcrService } from './mistral-ocr.service';
import { MistralSdkClientProvider } from './mistral-sdk-client.provider';
import { MISTRAL_OCR_ERROR_CODES } from './mistral-ocr.errors';

function makeMistralHttpError(statusCode: number, message: string): MistralError {
  const response = new Response(message, { status: statusCode });
  return new MistralError(message, {
    response,
    request: new Request('https://api.mistral.ai/v1/ocr'),
    body: message,
  });
}

describe('MistralOcrService', () => {
  const baseConfig = {
    provider: 'mistral' as const,
    mistralApiKey: 'test-key',
    mistralBaseUrl: undefined,
    mistralRouterModel: 'router-model',
    mistralChatModel: 'chat-model',
    mistralJsonModel: 'json-model',
    mistralReasoningModel: 'reasoning-model',
    mistralOcrModel: 'mistral-ocr-latest',
    mistralOcrTimeoutMs: 30_000,
    mistralOcrMaxFileBytes: 1024,
    streamingEnabled: true,
    externalActionsRequireApproval: true,
  };

  function makeService(overrides?: {
    config?: Partial<typeof baseConfig>;
    processImpl?: jest.Mock;
    configured?: boolean;
  }) {
    const process = overrides?.processImpl ?? jest.fn();
    const clientProvider = {
      isConfigured: jest.fn().mockReturnValue(overrides?.configured ?? true),
      getClient: jest.fn().mockReturnValue({ ocr: { process } }),
    } as unknown as MistralSdkClientProvider;
    const config = { ...baseConfig, ...overrides?.config };
    const svc = new MistralOcrService(clientProvider, config as any);
    return { svc, process, clientProvider, config };
  }

  it('reports configured when API key is present', () => {
    const { svc } = makeService();
    expect(svc.isConfigured()).toBe(true);
    expect(svc.resolveModel()).toBe('mistral-ocr-latest');
  });

  it('uses OCR model from configuration', async () => {
    const process = jest.fn().mockResolvedValue({
      model: 'custom-ocr-model',
      pages: [{ index: 0, markdown: 'Page', images: [], dimensions: null }],
      usageInfo: { pagesProcessed: 1 },
    });
    const { svc } = makeService({
      config: { mistralOcrModel: 'custom-ocr-model' },
      processImpl: process,
    });

    await svc.process({
      buffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
    });

    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-ocr-model' }),
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });

  it('processes a multi-page PDF via private base64 document_url', async () => {
    const process = jest.fn().mockResolvedValue({
      model: 'mistral-ocr-latest',
      pages: [
        { index: 0, markdown: 'One', images: [], dimensions: null },
        { index: 1, markdown: 'Two', images: [], dimensions: null },
      ],
      usageInfo: { pagesProcessed: 2, docSizeBytes: 100 },
    });
    const { svc } = makeService({ processImpl: process });
    const buffer = Buffer.from('%PDF');

    const result = await svc.process({
      buffer,
      mimeType: 'application/pdf',
      originalName: 'fleet.pdf',
      extractionId: 'ext-1',
    });

    const request = process.mock.calls[0][0];
    expect(request.document.type).toBe('document_url');
    expect(request.document.documentUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(request.includeImageBase64).toBe(false);
    expect(request.tableFormat).toBe(TableFormat.Markdown);
    expect(result.pageCount).toBe(2);
    expect(result.fullText).toContain('--- PAGE 1 ---');
    expect(result.fullText).toContain('--- PAGE 2 ---');
    expect(result.provider).toBe('mistral');
  });

  it('processes an image via image_url data URL', async () => {
    const process = jest.fn().mockResolvedValue({
      model: 'mistral-ocr-latest',
      pages: [{ index: 0, markdown: 'Plate', images: [], dimensions: null }],
      usageInfo: { pagesProcessed: 1 },
    });
    const { svc } = makeService({ processImpl: process });

    await svc.process({ buffer: Buffer.from('img'), mimeType: 'image/png' });

    const request = process.mock.calls[0][0];
    expect(request.document.type).toBe('image_url');
    expect(request.document.imageUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('rejects missing API key configuration', async () => {
    const { svc } = makeService({ configured: false });
    await expect(
      svc.process({ buffer: Buffer.from('x'), mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_NOT_CONFIGURED,
      retryable: false,
    });
  });

  it('rejects unsupported mime types', async () => {
    const { svc } = makeService();
    await expect(
      svc.process({ buffer: Buffer.from('x'), mimeType: 'application/zip' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_UNSUPPORTED_MIME,
      retryable: false,
    });
  });

  it('rejects files larger than configured max bytes', async () => {
    const { svc } = makeService({ config: { mistralOcrMaxFileBytes: 4 } });
    await expect(
      svc.process({ buffer: Buffer.from('toolarge'), mimeType: 'image/png' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_FILE_TOO_LARGE,
      retryable: false,
    });
  });

  it('maps empty provider responses to OCR_EMPTY_RESULT', async () => {
    const process = jest.fn().mockResolvedValue({
      model: 'mistral-ocr-latest',
      pages: [],
      usageInfo: { pagesProcessed: 0 },
    });
    const { svc } = makeService({ processImpl: process });
    await expect(
      svc.process({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_EMPTY_RESULT,
      retryable: false,
    });
  });

  it('maps timeout errors as retryable OCR_TIMEOUT', async () => {
    const process = jest.fn().mockRejectedValue(new RequestTimeoutError('timeout'));
    const { svc } = makeService({ processImpl: process });
    await expect(
      svc.process({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_TIMEOUT,
      retryable: true,
    });
  });

  it('maps 429 responses as retryable OCR_RATE_LIMITED', async () => {
    const process = jest
      .fn()
      .mockRejectedValue(makeMistralHttpError(429, 'too many requests'));
    const { svc } = makeService({ processImpl: process });
    await expect(
      svc.process({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_RATE_LIMITED,
      retryable: true,
    });
  });

  it('maps 503 responses as retryable OCR_PROVIDER_UNAVAILABLE', async () => {
    const process = jest.fn().mockRejectedValue(makeMistralHttpError(503, 'down'));
    const { svc } = makeService({ processImpl: process });
    await expect(
      svc.process({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_PROVIDER_UNAVAILABLE,
      retryable: true,
    });
  });

  it('maps authentication failures as non-retryable OCR_AUTHENTICATION_FAILED', async () => {
    const process = jest.fn().mockRejectedValue(makeMistralHttpError(401, 'bad key'));
    const { svc } = makeService({ processImpl: process });
    await expect(
      svc.process({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: MISTRAL_OCR_ERROR_CODES.OCR_AUTHENTICATION_FAILED,
      retryable: false,
    });
  });

  it('does not expose base64 payloads in safe error messages', async () => {
    const secret = Buffer.from('secret-pdf').toString('base64');
    const process = jest
      .fn()
      .mockRejectedValue(new Error(`failed for data:application/pdf;base64,${secret}`));
    const { svc } = makeService({ processImpl: process });
    try {
      await svc.process({ buffer: Buffer.from('pdf'), mimeType: 'application/pdf' });
      throw new Error('expected rejection');
    } catch (err: any) {
      expect(err.code).toBe(MISTRAL_OCR_ERROR_CODES.OCR_UNKNOWN_ERROR);
      expect(err.safeMessage).not.toContain(secret);
      expect(err.safeMessage).not.toContain('test-key');
    }
  });
});
