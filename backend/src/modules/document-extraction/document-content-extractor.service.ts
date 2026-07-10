import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import documentExtractionConfig from '@config/document-extraction.config';
import { MistralOcrService } from '@modules/ai/providers/mistral/mistral-ocr.service';
import { MISTRAL_OCR_ERROR_CODES, MistralOcrError } from '@modules/ai/providers/mistral/mistral-ocr.errors';
import {
  DocumentFileIdentificationService,
  IdentifiedDocumentFile,
} from './document-file-identification.service';
import { DocumentTextExtractorService } from './document-text-extractor.service';
import {
  DOCUMENT_PIPELINE_ERROR_CODES,
  DocumentExtractionPipelineError,
} from './document-extraction.errors';
import {
  DocumentContentExtractionInput,
  DocumentContentExtractionResult,
  DocumentTextSourceMethod,
} from './document-content-extraction.types';
import { DocumentPageBlock } from './document-page.types';
import { evaluatePdfTextQuality } from './pdf-text-quality.util';

@Injectable()
export class DocumentContentExtractorService {
  private readonly logger = new Logger(DocumentContentExtractorService.name);

  constructor(
    private readonly fileIdentification: DocumentFileIdentificationService,
    private readonly localExtractor: DocumentTextExtractorService,
    private readonly mistralOcr: MistralOcrService,
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
  ) {}

  async extractContent(input: DocumentContentExtractionInput): Promise<DocumentContentExtractionResult> {
    const identified = await this.fileIdentification.identify({
      buffer: input.buffer,
      clientMimeType: input.mimeType,
      originalName: input.fileName,
    });

    this.logger.log(
      `[DocContent] route kind=${identified.detectedKind} bytes=${identified.sizeBytes} extractionId=${input.extractionId ?? 'n/a'}`,
    );

    switch (identified.detectedKind) {
      case 'plain-text':
        return this.extractPlainText(input.buffer, identified);
      case 'pdf':
        return this.extractPdf(input, identified);
      case 'jpeg':
      case 'png':
      case 'webp':
        return this.extractViaOcr(input, identified);
      default:
        throw new DocumentExtractionPipelineError({
          code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
          safeMessage: 'This file type is not supported for document upload',
          stage: 'UPLOAD',
        });
    }
  }

  private extractPlainText(
    buffer: Buffer,
    identified: IdentifiedDocumentFile,
  ): DocumentContentExtractionResult {
    const text = this.localExtractor.extractPlainText(buffer);
    if (!text.trim()) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_EMPTY,
        safeMessage: 'The uploaded text file is empty',
        stage: 'OCR',
      });
    }

    const pages = this.buildTxtLogicalPages(text, 'TXT_DIRECT');
    return {
      text,
      pages,
      pageBoundaryReliable: false,
      sourceMethod: 'TXT_DIRECT',
      normalizedMimeType: identified.detectedMime,
      displayFileName: identified.displayFileName,
      pageCount: pages.length,
    };
  }

  private async extractPdf(
    input: DocumentContentExtractionInput,
    identified: IdentifiedDocumentFile,
  ): Promise<DocumentContentExtractionResult> {
    const local = await this.localExtractor.tryExtractPdfText(input.buffer);
    if (local) {
      const quality = evaluatePdfTextQuality(local.text, {
        minTextChars: this.config.pdfMinTextChars,
        minSensibleCharRatio: this.config.pdfMinSensibleCharRatio,
        maxRepeatedLineRatio: this.config.pdfMaxRepeatedLineRatio,
      });
      if (quality.usable) {
        this.logger.log(
          `[DocContent] pdf-text-layer extractionId=${input.extractionId ?? 'n/a'} chars=${quality.charCount} pages=${local.pages.length}`,
        );
        const pages: DocumentPageBlock[] = local.pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: p.text,
          sourceMethod: 'TEXT_LAYER',
          hasReliablePageBoundaries: local.pageBoundaryReliable,
        }));
        return {
          text: local.text,
          pages,
          pageBoundaryReliable: local.pageBoundaryReliable,
          sourceMethod: 'TEXT_LAYER',
          normalizedMimeType: identified.detectedMime,
          displayFileName: identified.displayFileName,
          pageCount: pages.length,
        };
      }
      this.logger.log(
        `[DocContent] pdf-text-layer-insufficient extractionId=${input.extractionId ?? 'n/a'} chars=${quality.charCount} ratio=${quality.sensibleCharRatio.toFixed(2)}`,
      );
    } else {
      this.logger.log(
        `[DocContent] pdf-text-layer-unavailable extractionId=${input.extractionId ?? 'n/a'}`,
      );
    }

    return this.extractViaOcr(input, identified);
  }

  private async extractViaOcr(
    input: DocumentContentExtractionInput,
    identified: IdentifiedDocumentFile,
  ): Promise<DocumentContentExtractionResult> {
    if (!this.mistralOcr.isConfigured()) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_NOT_CONFIGURED,
        safeMessage: 'OCR is not configured on the server',
        stage: 'OCR',
      });
    }

    try {
      const ocr = await this.mistralOcr.process({
        buffer: input.buffer,
        mimeType: identified.detectedMime,
        originalName: identified.displayFileName,
        extractionId: input.extractionId,
      });

      if (!ocr.normalizedMarkdown.trim()) {
        throw new DocumentExtractionPipelineError({
          code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_EMPTY_RESULT,
          safeMessage: 'OCR returned no readable text for this document',
          stage: 'OCR',
        });
      }

      const pages: DocumentPageBlock[] = ocr.pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: this.composeOcrPageText(page),
        sourceMethod: 'OCR' as DocumentTextSourceMethod,
        hasReliablePageBoundaries: true,
      }));

      return {
        text: ocr.normalizedMarkdown,
        pages,
        pageBoundaryReliable: true,
        sourceMethod: 'OCR',
        normalizedMimeType: identified.detectedMime,
        displayFileName: identified.displayFileName,
        pageCount: ocr.pageCount,
        ocrProvider: ocr.provider,
        ocrModel: ocr.model,
      };
    } catch (err) {
      if (err instanceof DocumentExtractionPipelineError) {
        throw err;
      }
      if (err instanceof MistralOcrError) {
        throw this.mapMistralOcrError(err);
      }
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED,
        safeMessage: 'OCR processing failed for this document',
        retryable: false,
        stage: 'OCR',
        cause: err,
      });
    }
  }

  private composeOcrPageText(page: {
    markdown: string;
    header?: string | null;
    footer?: string | null;
    tables?: Array<{ content: string }>;
  }): string {
    const parts = [
      page.header?.trim() ?? '',
      page.markdown?.trim() ?? '',
      ...(page.tables?.map((t) => t.content.trim()).filter(Boolean) ?? []),
      page.footer?.trim() ?? '',
    ].filter(Boolean);
    return parts.join('\n\n');
  }

  private buildTxtLogicalPages(text: string, sourceMethod: DocumentTextSourceMethod): DocumentPageBlock[] {
    const sections = text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (sections.length === 0) {
      return [
        {
          pageNumber: null,
          text: text.trim(),
          sourceMethod,
          hasReliablePageBoundaries: false,
        },
      ];
    }
    return sections.map((section) => ({
      pageNumber: null,
      text: section,
      sourceMethod,
      hasReliablePageBoundaries: false,
    }));
  }

  private mapMistralOcrError(err: MistralOcrError): DocumentExtractionPipelineError {
    if (err.code === MISTRAL_OCR_ERROR_CODES.OCR_EMPTY_RESULT) {
      return new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_EMPTY_RESULT,
        safeMessage: err.safeMessage,
        retryable: err.retryable,
        stage: 'OCR',
        cause: err,
      });
    }
    if (err.code === MISTRAL_OCR_ERROR_CODES.OCR_NOT_CONFIGURED) {
      return new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_NOT_CONFIGURED,
        safeMessage: err.safeMessage,
        retryable: err.retryable,
        stage: 'OCR',
        cause: err,
      });
    }
    if (err.code === MISTRAL_OCR_ERROR_CODES.OCR_FILE_TOO_LARGE) {
      return new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_LARGE,
        safeMessage: err.safeMessage,
        retryable: err.retryable,
        stage: 'OCR',
        cause: err,
      });
    }
    if (err.code === MISTRAL_OCR_ERROR_CODES.OCR_UNSUPPORTED_MIME) {
      return new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
        safeMessage: err.safeMessage,
        retryable: err.retryable,
        stage: 'OCR',
        cause: err,
      });
    }
    return new DocumentExtractionPipelineError({
      code: DOCUMENT_PIPELINE_ERROR_CODES.OCR_FAILED,
      safeMessage: err.safeMessage,
      retryable: err.retryable,
      stage: 'OCR',
      cause: err,
    });
  }
}
