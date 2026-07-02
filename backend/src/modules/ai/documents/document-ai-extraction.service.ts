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

/**
 * Mistral-backed structured document extraction.
 * Produces review suggestions only — canonical data is applied after human confirmation.
 */
@Injectable()
export class DocumentAiExtractionService {
  private readonly logger = new Logger(DocumentAiExtractionService.name);

  constructor(
    private readonly llm: LlmGatewayService,
    @Optional()
    @Inject(documentExtractionConfig.KEY)
    private readonly conf?: ConfigType<typeof documentExtractionConfig>,
  ) {}

  isEnabled(): boolean {
    const enabled = this.conf?.aiExtractionEnabled ?? true;
    return enabled && this.llm.isConfigured();
  }

  async extract(input: DocumentAiExtractInput): Promise<DocumentAiExtractResult> {
    const dimoContextAvailable = typeof input.dimoTokenId === 'number';

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

    const { system, user } = buildDocumentExtractionPrompt({
      documentType: input.documentType,
      fields: input.fields,
      rawText: input.rawText,
      vehicleContext: input.vehicleContext,
    });

    this.logger.log(
      `[DocAI] extract documentType=${input.documentType} dimoContext=${dimoContextAvailable}`,
    );

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
          dimoContextAvailable,
          providerId: this.llm.activeProviderId,
        };
      }

      return {
        success: true,
        fields,
        recommendedHumanReviewNotes: notes,
        dimoContextAvailable,
        providerId: this.llm.activeProviderId,
      };
    } catch (err: unknown) {
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: [],
        dimoContextAvailable,
        error: this.sanitizeError(err),
      };
    }
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
      .slice(0, 300);
  }
}
