import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentExtractionConfig from '@config/document-extraction.config';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import {
  ApplyDocumentExtractionType,
  SUPPORTED_DOCUMENT_TYPES,
} from '@modules/document-extraction/document-extraction.schemas';
import {
  CLASSIFICATION_UNKNOWN,
  DocumentClassificationInput,
  DocumentClassificationLlmResponse,
  DocumentClassificationResult,
} from './document-classification.types';
import {
  buildClassificationAllowedTypes,
  buildDocumentClassificationPrompt,
  buildDocumentClassificationResponseSchema,
} from './document-classification.schema.util';
import { mapClassificationFailure } from '@modules/document-extraction/document-extraction.errors';
import { buildClassificationDocumentText } from './document-classification-text.util';
import { buildDocumentClassificationContract } from '@modules/document-extraction/document-classification-taxonomy.util';

function buildClassificationResult(
  base: {
    success: boolean;
    provider: string;
    model: string;
    processingDurationMs: number;
    error?: string;
  },
  contract: ReturnType<typeof buildDocumentClassificationContract>,
): DocumentClassificationResult {
  return {
    success: base.success,
    detectedDocumentType: contract.detectedDocumentType,
    confidence: contract.confidence,
    rationale: contract.rationale,
    sourcePages: contract.evidencePages,
    provider: base.provider,
    model: base.model,
    processingDurationMs: base.processingDurationMs,
    documentCategory: contract.category,
    documentSubtype: contract.subtype,
    taxonomyVersion: contract.taxonomyVersion,
    category: contract.category,
    subtype: contract.subtype,
    alternatives: contract.alternatives,
    evidencePages: contract.evidencePages,
    detectedIdentifiers: contract.detectedIdentifiers,
    modelVersion: contract.modelVersion,
    contractVersion: contract.contractVersion,
    contract,
    error: base.error,
  };
}

function buildEmptyContract(
  allowed: readonly ApplyDocumentExtractionType[],
  maxPage: number | null,
  modelVersion: string | null,
  rationale: string,
): ReturnType<typeof buildDocumentClassificationContract> {
  return buildDocumentClassificationContract({
    raw: {
      detectedDocumentType: CLASSIFICATION_UNKNOWN,
      confidence: 0,
      rationale,
      sourcePages: null,
      alternatives: [],
      detectedIdentifiers: [],
    },
    allowed,
    maxPage,
    modelVersion,
  });
}

@Injectable()
export class DocumentClassificationService {
  private readonly logger = new Logger(DocumentClassificationService.name);

  constructor(
    private readonly llm: LlmGatewayService,
    @Optional()
    @Inject(documentExtractionConfig.KEY)
    private readonly conf?: ConfigType<typeof documentExtractionConfig>,
  ) {}

  isEnabled(): boolean {
    const enabled = this.conf?.classificationEnabled ?? true;
    return enabled && this.llm.isConfigured();
  }

  async classify(input: DocumentClassificationInput): Promise<DocumentClassificationResult> {
    const startedAt = Date.now();
    const allowed =
      input.allowedDocumentTypes.length > 0
        ? buildClassificationAllowedTypes(input.allowedDocumentTypes)
        : [...SUPPORTED_DOCUMENT_TYPES];

    if (!this.isEnabled()) {
      const contract = buildEmptyContract(
        allowed,
        null,
        'unconfigured',
        'Classification is not configured',
      );
      return buildClassificationResult(
        {
          success: false,
          provider: this.llm.activeProviderId,
          model: 'unconfigured',
          processingDurationMs: Date.now() - startedAt,
          error:
            'Document classification is not configured (MISTRAL_API_KEY missing or DOCUMENT_CLASSIFICATION_ENABLED=false)',
        },
        contract,
      );
    }

    const maxChars = this.conf?.classificationMaxChars ?? 24_000;
    const sample = buildClassificationDocumentText({
      fullText: input.documentText,
      pages: input.pages,
      maxChars,
    });
    const documentText = sample.documentText;
    if (sample.truncated) {
      this.logger.debug(
        `[DocClassify] sampled ${sample.sampledPageNumbers.join(',') || 'head'} omitted=${sample.omittedPageNumbers.join(',') || 'n/a'} maxChars=${maxChars}`,
      );
    }
    const maxPage =
      input.pages?.reduce<number | null>((max, page) => {
        if (page.pageNumber == null) return max;
        return max == null ? page.pageNumber : Math.max(max, page.pageNumber);
      }, null) ?? null;

    const { system, user } = buildDocumentClassificationPrompt({
      allowedDocumentTypes: allowed,
      documentText,
      pages: input.pages,
      pageBoundaryReliable: input.pageBoundaryReliable,
      truncated: sample.truncated,
      omittedPageNumbers: sample.omittedPageNumbers,
    });

    try {
      const result = await this.llm.completeJson<DocumentClassificationLlmResponse>({
        purpose: 'json',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: buildDocumentClassificationResponseSchema(allowed),
        schemaName: 'synqdrive_document_classification',
        signal: this.buildAbortSignal(),
      });

      const contract = buildDocumentClassificationContract({
        raw: result.data,
        allowed,
        maxPage,
        modelVersion: result.model,
      });
      return buildClassificationResult(
        {
          success: true,
          provider: this.llm.activeProviderId,
          model: result.model,
          processingDurationMs: Date.now() - startedAt,
        },
        contract,
      );
    } catch (err: unknown) {
      const mapped = mapClassificationFailure(this.sanitizeError(err));
      this.logger.warn(
        `[DocClassify] failed provider=${this.llm.activeProviderId} code=${mapped.code}`,
      );
      const contract = buildEmptyContract(
        allowed,
        maxPage,
        'error',
        mapped.safeMessage,
      );
      return buildClassificationResult(
        {
          success: false,
          provider: this.llm.activeProviderId,
          model: 'error',
          processingDurationMs: Date.now() - startedAt,
          error: mapped.safeMessage,
        },
        contract,
      );
    }
  }

  private buildAbortSignal(): AbortSignal | undefined {
    const timeoutMs = this.conf?.classificationTimeoutMs;
    if (!timeoutMs || timeoutMs <= 0) return undefined;
    return AbortSignal.timeout(timeoutMs);
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
      .slice(0, 300);
  }
}
