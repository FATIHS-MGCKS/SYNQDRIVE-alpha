import { DocumentClassificationService } from './document-classification.service';
import { CLASSIFICATION_UNKNOWN } from './document-classification.types';
import { SUPPORTED_DOCUMENT_TYPES } from '@modules/document-extraction/document-extraction.schemas';
import { buildDocumentClassificationContract } from '@modules/document-extraction/document-classification-taxonomy.util';
import { GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE } from '@modules/document-extraction/__fixtures__/document-classification-fixtures';

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
    expect(result.contractVersion).toBe('2.0.0');
    expect(llm.completeJson).not.toHaveBeenCalled();
  });

  it('classifies a clear service record with taxonomy contract', async () => {
    const { service, llm } = makeService({
      llm: {
        completeJson: jest.fn().mockResolvedValue({
          data: {
            detectedDocumentType: 'SERVICE',
            documentCategory: 'TECHNICAL',
            documentSubtype: 'SERVICE_REPORT',
            confidence: 0.92,
            rationale: 'Contains workshop maintenance items and service date',
            sourcePages: [1],
            alternatives: [],
            detectedIdentifiers: [],
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
    expect(result.category).toBe('TECHNICAL');
    expect(result.subtype).toBe('SERVICE_REPORT');
    expect(result.contractVersion).toBe('2.0.0');
    expect(result.modelVersion).toBe('mistral-small');
    expect(result.evidencePages).toEqual([1]);
    expect(result.provider).toBe('mistral');
    expect(llm.completeJson).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'synqdrive_document_classification',
        temperature: 0,
      }),
    );
  });

  it('returns taxonomy contract with alternatives from fixture-shaped response', async () => {
    const { service } = makeService({
      llm: {
        completeJson: jest.fn().mockResolvedValue({
          data: { ...GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE },
          model: 'mistral-small',
        }),
      },
    });

    const result = await service.classify({
      documentText: 'Customer letter without workshop evidence',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
    });

    expect(result.category).toBe('CUSTOMER');
    expect(result.subtype).toBe('CUSTOMER_CORRESPONDENCE');
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.detectedIdentifiers.length).toBeGreaterThan(0);
    expect(result.contract.alternatives[0]?.subtype).toBe('SERVICE_REPORT');
  });

  it('maps invalid model legacy type to UNKNOWN when taxonomy is absent', () => {
    const contract = buildDocumentClassificationContract({
      raw: {
        detectedDocumentType: 'NOT_A_REAL_TYPE' as any,
        confidence: 0.99,
        rationale: 'bogus classification attempt',
        sourcePages: null,
      },
      allowed: SUPPORTED_DOCUMENT_TYPES,
      maxPage: 3,
      modelVersion: 'mistral-small',
    });
    expect(contract.detectedDocumentType).toBe(CLASSIFICATION_UNKNOWN);
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
              documentCategory: 'FINANCE',
              documentSubtype: 'INVOICE',
              confidence: 0.88,
              rationale: 'Invoice number and total amount due',
              sourcePages: [1],
              alternatives: [],
              detectedIdentifiers: [],
            },
            model: 'mistral-small',
          })
          .mockResolvedValueOnce({
            data: {
              detectedDocumentType: 'TUV_REPORT',
              documentCategory: 'COMPLIANCE',
              documentSubtype: 'TUV_REPORT',
              confidence: 0.91,
              rationale: 'Hauptuntersuchung HU Prüfbericht',
              sourcePages: [1],
              alternatives: [],
              detectedIdentifiers: [],
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
    expect(invoice.subtype).toBe('INVOICE');
    expect(tuv.detectedDocumentType).toBe('TUV_REPORT');
    expect(tuv.subtype).toBe('TUV_REPORT');
    expect(llm.completeJson).toHaveBeenCalledTimes(2);
  });
});
