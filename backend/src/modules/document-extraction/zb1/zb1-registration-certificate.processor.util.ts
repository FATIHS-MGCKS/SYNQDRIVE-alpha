import type { DocumentAiExtractResult } from '@modules/ai/documents/document-ai-extraction.types';
import type { ResolvedExtractionSchema } from '../document-structured-extraction.types';
import { buildEmptyExtractedData } from '../document-extraction.schemas';
import { buildStructuredExtractionPayload } from '../document-structured-extraction.util';
import type { DocumentStructuredContent } from '../document-page.types';
import {
  parseZb1RegistrationCertificateFromOcr,
  zb1ExtractToStoredPayload,
} from './zb1-registration-certificate.parser';

/**
 * Build extraction artifacts for REGISTRATION_CERTIFICATE without Mistral JSON extraction.
 */
export function buildZb1RegistrationCertificateExtractionArtifacts(input: {
  resolvedSchema: ResolvedExtractionSchema;
  documentContent: DocumentStructuredContent;
}): {
  fields: Record<string, unknown>;
  agentResult: DocumentAiExtractResult;
  structuredExtraction: ReturnType<typeof buildStructuredExtractionPayload>;
} {
  const zb1 = parseZb1RegistrationCertificateFromOcr({
    text: input.documentContent.text,
    pages: input.documentContent.pages,
  });
  const fields = {
    ...buildEmptyExtractedData('REGISTRATION_CERTIFICATE', input.resolvedSchema.documentSubtype),
    ...zb1ExtractToStoredPayload(zb1),
  };

  const agentResult: DocumentAiExtractResult = {
    success: true,
    fields: {},
    recommendedHumanReviewNotes: zb1.warnings,
    dimoContextAvailable: false,
    extractionConflicts: [],
  };

  const structuredExtraction = buildStructuredExtractionPayload({
    resolvedSchema: input.resolvedSchema,
    agentResult,
  });

  return { fields, agentResult, structuredExtraction };
}
