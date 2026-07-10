import { DocumentClassificationService } from './document-classification.service';
import { CLASSIFICATION_UNKNOWN } from './document-classification.types';
import { SUPPORTED_DOCUMENT_TYPES } from '@modules/document-extraction/document-extraction.schemas';

describe('DocumentClassificationService', () => {
  function makeService(overrides: Record<string, unknown> = {}) {
    const llm = {
      isConfigured: jest.fn().mockReturnValue(true),
      activeProviderId: 'mistral',
      completeJson: jest.fn(),
      ...(overrides.llm as object),
    };
    const conf = {
      classificationEnabled: true,
      classificationMaxChars: 24000,
      classificationTimeoutMs: 45000,
      ...(overrides.conf as object),
    };
    const service = new DocumentClassificationService(llm as any, conf as any);
    return { service, llm, conf };
  }

  it('skips LLM when classification is disabled', async () => {
    const { service, llm } = makeService({
      conf: { classificationEnabled: false },
    });
    const result = await service.classify({
      documentText: 'Wartungsnachweis Werkstatt',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
    });
    expect(result.success).toBe(false);
    expect(result.detectedDocumentType).toBe(CLASSIFICATION_UNKNOWN);
    expect(llm.completeJson).not.toHaveBeenCalled();
  });

  it('classifies a clear service record', async () => {
    const { service, llm } = makeService({
      llm: {
        completeJson: jest.fn().mockResolvedValue({
          data: {
            detectedDocumentType: 'SERVICE',
            confidence: 0.92,
            rationale: 'Contains workshop maintenance items and service date',
            sourcePages: [1],
          },
          model: 'mistral-small',
        }),
      },
    });

    const result = await service.classify({
      documentText: 'Wartungsnachweis Inspektion Ölwechsel',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      pages: [{ pageNumber: 1, charCount: 120 }],
      pageBoundaryReliable: true,
    });

    expect(result.success).toBe(true);
    expect(result.detectedDocumentType).toBe('SERVICE');
    expect(result.confidence).toBe(0.92);
    expect(result.provider).toBe('mistral');
    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'synqdrive_document_classification',
        temperature: 0,
      }),
    );
  });

  it('maps invalid model type to UNKNOWN', () => {
    const { service } = makeService();
    const normalized = service.normalizeResponse(
      {
        detectedDocumentType: 'NOT_A_REAL_TYPE' as any,
        confidence: 0.99,
        rationale: 'bogus',
        sourcePages: null,
      },
      SUPPORTED_DOCUMENT_TYPES,
      3,
    );
    expect(normalized.detectedDocumentType).toBe(CLASSIFICATION_UNKNOWN);
  });

  it('returns UNKNOWN on invalid JSON provider failure', async () => {
    const { service } = makeService({
      llm: {
        completeJson: jest.fn().mockRejectedValue(new Error('Unexpected JSON token')),
      },
    });
    const result = await service.classify({
      documentText: 'random',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
    });
    expect(result.success).toBe(false);
    expect(result.detectedDocumentType).toBe(CLASSIFICATION_UNKNOWN);
    expect(result.error).toContain('JSON');
  });

  it('handles provider timeout as retryable classification failure', async () => {
    const { service } = makeService({
      llm: {
        completeJson: jest.fn().mockRejectedValue(new Error('Request timed out')),
      },
    });
    const result = await service.classify({
      documentText: 'TÜV Hauptuntersuchung',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
    });
    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain('timed out');
  });

  it('classifies invoice and TÜV distinctly', async () => {
    const { service, llm } = makeService({
      llm: {
        completeJson: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              detectedDocumentType: 'INVOICE',
              confidence: 0.88,
              rationale: 'Invoice number and total amount due',
              sourcePages: [1],
            },
            model: 'mistral-small',
          })
          .mockResolvedValueOnce({
            data: {
              detectedDocumentType: 'TUV_REPORT',
              confidence: 0.91,
              rationale: 'Hauptuntersuchung HU Prüfbericht',
              sourcePages: [1],
            },
            model: 'mistral-small',
          }),
      },
    });

    const invoice = await service.classify({
      documentText: 'Rechnung Nr. 1001 Gesamtbetrag',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
    });
    const tuv = await service.classify({
      documentText: 'TÜV Bericht Hauptuntersuchung HU',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
    });

    expect(invoice.detectedDocumentType).toBe('INVOICE');
    expect(tuv.detectedDocumentType).toBe('TUV_REPORT');
    expect(llm.completeJson).toHaveBeenCalledTimes(2);
  });
});
