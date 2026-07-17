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
  sanitizeClassificationSourcePages,
} from './document-classification.schema.util';
import { mapClassificationFailure } from '@modules/document-extraction/document-extraction.errors';
import { buildClassificationDocumentText } from './document-classification-text.util';
import { resolveDocumentTaxonomy } from '@modules/document-extraction/document-taxonomy.util';
import { DOCUMENT_TAXONOMY_VERSION } from '@modules/document-extraction/document-taxonomy.types';

function attachTaxonomyToClassificationResult(
  result: Omit<
    DocumentClassificationResult,
    'documentCategory' | 'documentSubtype' | 'taxonomyVersion'
  >,
): DocumentClassificationResult {
  const taxonomy = resolveDocumentTaxonomy({
    legacyDocumentType:
      result.detectedDocumentType === CLASSIFICATION_UNKNOWN
        ? 'OTHER'
        : result.detectedDocumentType,
    source: 'classification',
  });
  return {
    ...result,
    documentCategory: taxonomy.documentCategory,
    documentSubtype: taxonomy.documentSubtype,
    taxonomyVersion: DOCUMENT_TAXONOMY_VERSION,
  };
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
      return attachTaxonomyToClassificationResult({
        success: false,
        detectedDocumentType: CLASSIFICATION_UNKNOWN,
        confidence: 0,
        rationale: 'Classification is not configured',
        sourcePages: [],
        provider: this.llm.activeProviderId,
        model: 'unconfigured',
        processingDurationMs: Date.now() - startedAt,
        error:
          'Document classification is not configured (MISTRAL_API_KEY missing or DOCUMENT_CLASSIFICATION_ENABLED=false)',
      });
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

      const normalized = this.normalizeResponse(result.data, allowed, maxPage);
      return attachTaxonomyToClassificationResult({
        success: true,
        ...normalized,
        provider: this.llm.activeProviderId,
        model: result.model,
        processingDurationMs: Date.now() - startedAt,
      });
    } catch (err: unknown) {
      const mapped = mapClassificationFailure(this.sanitizeError(err));
      this.logger.warn(
        `[DocClassify] failed provider=${this.llm.activeProviderId} code=${mapped.code}`,
      );
      return attachTaxonomyToClassificationResult({
        success: false,
        detectedDocumentType: CLASSIFICATION_UNKNOWN,
        confidence: 0,
        rationale: mapped.safeMessage,
        sourcePages: [],
        provider: this.llm.activeProviderId,
        model: 'error',
        processingDurationMs: Date.now() - startedAt,
        error: mapped.safeMessage,
      });
    }
  }

  normalizeResponse(
    raw: DocumentClassificationLlmResponse | null | undefined,
    allowed: readonly ApplyDocumentExtractionType[],
    maxPage: number | null,
  ): Pick<
    DocumentClassificationResult,
    'detectedDocumentType' | 'confidence' | 'rationale' | 'sourcePages'
  > {
    const allowedSet = new Set(allowed);
    const detectedRaw = raw?.detectedDocumentType;
    const detectedDocumentType =
      typeof detectedRaw === 'string' &&
      detectedRaw !== CLASSIFICATION_UNKNOWN &&
      allowedSet.has(detectedRaw as ApplyDocumentExtractionType)
        ? (detectedRaw as ApplyDocumentExtractionType)
        : CLASSIFICATION_UNKNOWN;

    const confidence =
      typeof raw?.confidence === 'number' && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0;

    const rationale =
      typeof raw?.rationale === 'string'
        ? raw.rationale.replace(/[\r\n]+/g, ' ').trim().slice(0, 500)
        : '';

    const sourcePages = sanitizeClassificationSourcePages(raw?.sourcePages, maxPage);

    return {
      detectedDocumentType,
      confidence,
      rationale,
      sourcePages,
    };
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
