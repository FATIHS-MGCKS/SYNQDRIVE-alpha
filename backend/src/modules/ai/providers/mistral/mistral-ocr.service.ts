import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TableFormat } from '@mistralai/mistralai/models/components';
import aiConfig from '@config/ai.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  bucketFileSizeBytes,
  formatDocumentExtractionLog,
  mimeCategoryFromMime,
} from '@modules/observability/document-extraction-log.util';
import { MistralSdkClientProvider } from './mistral-sdk-client.provider';
import { mapMistralOcrProviderError, redactOcrLogText } from './mistral-ocr-error.mapper';
import {
  buildOcrDocument,
  isSupportedOcrMimeType,
  normalizeOcrResponse,
} from './mistral-ocr.mapper';
import {
  MISTRAL_OCR_ERROR_CODES,
  MistralOcrError,
} from './mistral-ocr.errors';
import type { MistralOcrInput, MistralOcrOutput } from './mistral-ocr.types';

@Injectable()
export class MistralOcrService {
  private readonly logger = new Logger(MistralOcrService.name);

  constructor(
    private readonly clientProvider: MistralSdkClientProvider,
    @Inject(aiConfig.KEY)
    private readonly config: ConfigType<typeof aiConfig>,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  isConfigured(): boolean {
    return this.clientProvider.isConfigured();
  }

  resolveModel(): string {
    return this.config.mistralOcrModel;
  }

  async process(input: MistralOcrInput): Promise<MistralOcrOutput> {
    if (!this.isConfigured()) {
      throw new MistralOcrError({
        code: MISTRAL_OCR_ERROR_CODES.OCR_NOT_CONFIGURED,
        safeMessage: 'OCR is not configured — set MISTRAL_API_KEY on the server',
        retryable: false,
      });
    }

    if (!isSupportedOcrMimeType(input.mimeType)) {
      throw new MistralOcrError({
        code: MISTRAL_OCR_ERROR_CODES.OCR_UNSUPPORTED_MIME,
        safeMessage: `Unsupported OCR file type: ${input.mimeType}`,
        retryable: false,
      });
    }

    if (input.buffer.byteLength > this.config.mistralOcrMaxFileBytes) {
      throw new MistralOcrError({
        code: MISTRAL_OCR_ERROR_CODES.OCR_FILE_TOO_LARGE,
        safeMessage: 'Document exceeds the maximum OCR file size',
        retryable: false,
      });
    }

    const model = this.resolveModel();
    const startedAt = Date.now();
    const mimeCategory = mimeCategoryFromMime(input.mimeType);
    const fileSizeBucket = bucketFileSizeBytes(input.buffer.byteLength);
    const extractionId = input.extractionId ?? 'n/a';

    this.logger.log(
      formatDocumentExtractionLog({
        extractionId,
        stage: 'OCR',
        status: 'started',
        mimeCategory,
        fileSizeBucket,
        provider: 'mistral',
        model,
      }),
    );

    try {
      const client = this.clientProvider.getClient();
      const response = await client.ocr.process(
        {
          model,
          document: buildOcrDocument(input),
          pages: input.pageIndexes?.length ? input.pageIndexes : undefined,
          includeImageBase64: false,
          tableFormat: TableFormat.Markdown,
          extractHeader: true,
          extractFooter: true,
        },
        { timeoutMs: this.config.mistralOcrTimeoutMs },
      );

      const durationMs = Date.now() - startedAt;

      if (!response.pages?.length) {
        throw new MistralOcrError({
          code: MISTRAL_OCR_ERROR_CODES.OCR_EMPTY_RESULT,
          safeMessage: 'OCR returned no pages for this document',
          retryable: false,
        });
      }

      const output = normalizeOcrResponse({
        response,
        provider: 'mistral',
        modelFallback: model,
        processingDurationMs: durationMs,
      });

      this.logger.log(
        formatDocumentExtractionLog({
          extractionId,
          stage: 'OCR',
          status: 'completed',
          mimeCategory,
          fileSizeBucket,
          pageCount: output.pageCount,
          provider: output.provider,
          model: output.model,
          durationMs,
        }),
      );
      this.metrics?.documentExtractionDuration.observe({ stage: 'OCR' }, durationMs / 1000);
      this.metrics?.documentExtractionPages.inc({ method: 'OCR' }, output.pageCount);

      return output;
    } catch (err: unknown) {
      const mapped = mapMistralOcrProviderError(err);
      const durationMs = Date.now() - startedAt;
      this.logger.warn(
        formatDocumentExtractionLog({
          extractionId,
          stage: 'OCR',
          status: 'failed',
          mimeCategory,
          fileSizeBucket,
          errorCode: mapped.code,
          provider: 'mistral',
          model,
          durationMs,
        }),
      );
      this.metrics?.documentExtractionFailures.inc({
        stage: 'OCR',
        error_code: mapped.code,
        retryable: mapped.retryable ? 'true' : 'false',
      });
      if (mapped.cause instanceof Error) {
        this.logger.debug(`[MistralOCR] cause: ${redactOcrLogText(mapped.cause.message)}`);
      }
      throw mapped;
    }
  }
}
