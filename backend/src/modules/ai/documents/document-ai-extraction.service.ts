import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentExtractionConfig from '@config/document-extraction.config';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import type {
  DocumentAiExtractInput,
  DocumentAiExtractResult,
  DocumentAiExtractionResponse,
} from './document-ai-extraction.types';
import {
  buildDocumentExtractionPrompt,
  buildDocumentExtractionResponseSchema,
  buildEmptyFieldShape,
  mapExtractedFields,
} from './document-ai-extraction.schema.util';
import { DocumentChunkingService } from './document-chunking.service';
import {
  ChunkExtractionPayload,
  DocumentExtractionMergeService,
} from './document-extraction-merge.service';
import { DocumentTextChunk } from './document-chunking.types';
import { ExternalAccessEnforcementService } from '@modules/data-authorizations/external-access-enforcement/external-access-enforcement.service';
import { sanitizeAiPromptContext } from '@modules/data-authorizations/external-access-enforcement/external-access-data-minimizer';

/**
 * Mistral-backed structured document extraction with page-aware chunking
 * and deterministic merge across chunks.
 */
@Injectable()
export class DocumentAiExtractionService {
  private readonly logger = new Logger(DocumentAiExtractionService.name);

  constructor(
    private readonly llm: LlmGatewayService,
    private readonly chunking: DocumentChunkingService,
    private readonly mergeService: DocumentExtractionMergeService,
    @Optional()
    @Inject(documentExtractionConfig.KEY)
    private readonly conf?: ConfigType<typeof documentExtractionConfig>,
    @Optional() private readonly externalAccess?: ExternalAccessEnforcementService,
  ) {}

  isEnabled(): boolean {
    const enabled = this.conf?.aiExtractionEnabled ?? true;
    return enabled && this.llm.isConfigured();
  }

  async extract(input: DocumentAiExtractInput): Promise<DocumentAiExtractResult> {
    const startedAt = Date.now();
    const dimoContextAvailable = typeof input.dimoTokenId === 'number';

    if (input.organizationId && this.externalAccess) {
      const auth = await this.externalAccess.checkUseForAi({
        organizationId: input.organizationId,
        channelKey: 'document_ai_extraction',
        correlationId: `document-ai:${input.organizationId}:${input.documentId ?? 'unknown'}`,
      });
      if (!auth.mayProceed) {
        return {
          success: false,
          fields: {},
          recommendedHumanReviewNotes: [],
          dimoContextAvailable,
          error: 'AI document extraction is not authorized for this organization.',
        };
      }
    }

    if (!this.isEnabled()) {
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: [],
        dimoContextAvailable,
        error:
          'AI document extraction is not configured (MISTRAL_API_KEY missing, AI provider disabled, or DOCUMENT_AI_EXTRACTION_ENABLED=false)',
      };
    }

    const structured = this.resolveStructuredContent(input);
    const minimizationSpec = this.externalAccess?.resolveChannelSpec('document_ai_extraction')?.minimization;
    const vehicleContext = input.vehicleContext
      ? (sanitizeAiPromptContext(
          input.vehicleContext as Record<string, unknown>,
          minimizationSpec,
        ) as DocumentAiExtractInput['vehicleContext'])
      : undefined;
    const extractionInput = vehicleContext ? { ...input, vehicleContext } : input;
    const chunking = this.chunking.chunk({
      pages: structured.pages,
      limits: {
        targetChars: this.conf?.chunkTargetChars ?? 6000,
        maxChars: this.conf?.chunkMaxChars ?? 8000,
        maxPages: this.conf?.chunkMaxPages ?? 200,
        maxChunks: this.conf?.chunkMaxChunks ?? 12,
        overlapChars: this.conf?.chunkOverlapChars ?? 0,
      },
    });

    if (chunking.chunks.length === 0) {
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: chunking.warnings,
        dimoContextAvailable,
        error: chunking.limitMessage ?? 'Document could not be chunked for extraction',
        chunking: this.toChunkMetadata(chunking, Date.now() - startedAt),
      };
    }

    this.logger.log(
      `[DocAI] extract documentType=${input.documentType} chunks=${chunking.chunks.length} pages=${chunking.totalPages} dimoContext=${dimoContextAvailable}`,
    );

    const chunkPayloads: ChunkExtractionPayload[] = [];
    let modelId: string | undefined;
    const providerId = this.llm.activeProviderId;

    for (const chunk of chunking.chunks) {
      const chunkResult = await this.extractChunk(extractionInput, chunk, chunking.chunks.length);
      if (!chunkResult.success) {
        return {
          ...chunkResult,
          chunking: this.toChunkMetadata(chunking, Date.now() - startedAt),
        };
      }
      modelId = chunkResult.modelId ?? modelId;
      chunkPayloads.push({
        chunkIndex: chunk.chunkIndex,
        pageNumbers: chunk.pageNumbers,
        fields: chunkResult.fields,
        recommendedHumanReviewNotes: chunkResult.recommendedHumanReviewNotes,
      });
    }

    const merged = this.mergeService.merge(extractionInput.fields, chunkPayloads);
    const notes = [
      ...chunking.warnings,
      ...merged.recommendedHumanReviewNotes,
    ].slice(0, 30);

    return {
      success: true,
      fields: merged.fields,
      fieldEvidence: merged.fieldEvidence,
      extractionConflicts: merged.conflicts,
      recommendedHumanReviewNotes: notes,
      dimoContextAvailable,
      providerId,
      modelId,
      chunking: this.toChunkMetadata(chunking, Date.now() - startedAt),
    };
  }

  private async extractChunk(
    input: DocumentAiExtractInput,
    chunk: DocumentTextChunk,
    chunkCount: number,
  ): Promise<DocumentAiExtractResult> {
    const { system, user } = buildDocumentExtractionPrompt({
      documentType: input.documentType,
      fields: input.fields,
      rawText: chunk.text,
      chunkIndex: chunk.chunkIndex,
      chunkCount,
      pageNumbers: chunk.pageNumbers,
      pageBoundaryReliable: chunk.pageBoundaryReliable,
      vehicleContext: input.vehicleContext,
    });

    try {
      const result = await this.llm.completeJson<DocumentAiExtractionResponse>({
        purpose: 'json',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: buildDocumentExtractionResponseSchema(input.fields),
        schemaName: 'synqdrive_document_extraction',
      });

      const parsed = result.data;
      const fields = mapExtractedFields(parsed?.fields, input.fields);
      const notes = Array.isArray(parsed?.recommendedHumanReviewNotes)
        ? parsed.recommendedHumanReviewNotes
            .filter((note): note is string => typeof note === 'string')
            .slice(0, 20)
        : [];

      if (!parsed || Object.keys(fields).length === 0) {
        return {
          success: true,
          fields: buildEmptyFieldShape(input.fields),
          recommendedHumanReviewNotes: notes,
          dimoContextAvailable: typeof input.dimoTokenId === 'number',
          providerId: this.llm.activeProviderId,
          modelId: result.model,
        };
      }

      return {
        success: true,
        fields,
        recommendedHumanReviewNotes: notes,
        dimoContextAvailable: typeof input.dimoTokenId === 'number',
        providerId: this.llm.activeProviderId,
        modelId: result.model,
      };
    } catch (err: unknown) {
      const mapped = mapAiExtractionFailure(this.sanitizeError(err));
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: [],
        dimoContextAvailable: typeof input.dimoTokenId === 'number',
        error: mapped.safeMessage,
      };
    }
  }

  private resolveStructuredContent(input: DocumentAiExtractInput) {
    if (input.documentContent?.pages?.length) {
      return input.documentContent;
    }
    const text = input.documentContent?.text ?? input.rawText ?? '';
    return {
      text,
      pageBoundaryReliable: input.documentContent?.pageBoundaryReliable ?? false,
      pages: [
        {
          pageNumber: null,
          text,
          sourceMethod: 'TXT_DIRECT' as const,
          hasReliablePageBoundaries: false,
        },
      ],
    };
  }

  private toChunkMetadata(
    chunking: ReturnType<DocumentChunkingService['chunk']>,
    durationMs: number,
  ) {
    return {
      chunkCount: chunking.chunks.length,
      totalPages: chunking.totalPages,
      totalChars: chunking.totalChars,
      limitExceeded: chunking.limitExceeded,
      limitCode: chunking.limitCode,
      uncoveredPageNumbers: chunking.uncoveredPageNumbers,
      durationMs,
    };
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
      .slice(0, 300);
  }
}
