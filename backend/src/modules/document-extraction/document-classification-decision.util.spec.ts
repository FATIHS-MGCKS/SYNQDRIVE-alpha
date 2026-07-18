import { evaluateClassificationDecision } from './document-classification-decision.util';
import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';
import { buildDocumentClassificationContract } from './document-classification-taxonomy.util';
import {
  CLEAR_FINE_NOTICE_FIXTURE,
  FORCED_SERVICE_GENERAL_LETTER_FIXTURE,
  HIGH_CONFIDENCE_SERVICE_WITH_ALTERNATIVE_FIXTURE,
  UNCLEAR_SUBTYPE_FIXTURE,
} from './__fixtures__/document-classification-fixtures';
import type { DocumentClassificationLlmResponse } from '@modules/ai/documents/document-classification.types';

const thresholds = {
  autoContinueMinConfidence: 0.85,
  suggestionMinConfidence: 0.55,
};

describe('evaluateClassificationDecision', () => {
  it('auto-continues on high confidence with evidence', () => {
    const decision = evaluateClassificationDecision({
      detectedDocumentType: 'SERVICE',
      confidence: 0.9,
      rationale: 'Workshop maintenance items and service stamp on page 1',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
    });
    expect(decision.action).toBe('AUTO_CONTINUE');
    if (decision.action === 'AUTO_CONTINUE') {
      expect(decision.effectiveType).toBe('SERVICE');
    }
  });

  it('awaits user with suggestion on medium confidence', () => {
    const decision = evaluateClassificationDecision({
      detectedDocumentType: 'INVOICE',
      confidence: 0.65,
      rationale: 'Contains invoice number and total amount fields',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
    });
    expect(decision.action).toBe('AWAIT_USER');
    expect(decision.hasSuggestion).toBe(true);
    expect(decision.detectedType).toBe('INVOICE');
    expect(decision.effectiveType).toBeNull();
  });

  it('requires manual selection on low confidence without suggestion', () => {
    const decision = evaluateClassificationDecision({
      detectedDocumentType: 'BOKRAFT_REPORT',
      confidence: 0.4,
      rationale: 'Mentions emissions but evidence is weak overall',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
    });
    expect(decision.action).toBe('AWAIT_USER');
    expect(decision.hasSuggestion).toBe(false);
    expect(decision.detectedType).toBeNull();
  });

  it('treats UNKNOWN as no suggestion', () => {
    const decision = evaluateClassificationDecision({
      detectedDocumentType: CLASSIFICATION_UNKNOWN,
      confidence: 0.2,
      rationale: 'Document content is too generic to classify',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
    });
    expect(decision.hasSuggestion).toBe(false);
    expect(decision.detectedType).toBeNull();
  });

  it('rejects invalid model type even with high confidence', () => {
    const decision = evaluateClassificationDecision({
      detectedDocumentType: 'Service Record',
      confidence: 0.95,
      rationale: 'Looks like a service record from the workshop',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
    });
    expect(decision.hasSuggestion).toBe(false);
    expect(decision.detectedType).toBeNull();
  });

  it('rejects high confidence without substantive rationale', () => {
    const decision = evaluateClassificationDecision({
      detectedDocumentType: 'DAMAGE',
      confidence: 0.95,
      rationale: 'unclear',
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
    });
    expect(decision.hasSuggestion).toBe(false);
  });

  it('auto-continues clear fine notice from fixture', () => {
    const contract = buildDocumentClassificationContract({
      raw: { ...CLEAR_FINE_NOTICE_FIXTURE } as DocumentClassificationLlmResponse,
      allowed: SUPPORTED_DOCUMENT_TYPES,
      maxPage: 1,
      modelVersion: 'mistral-small',
    });
    const decision = evaluateClassificationDecision({
      detectedDocumentType: contract.detectedDocumentType,
      confidence: contract.confidence,
      rationale: contract.rationale,
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
      category: contract.category,
      subtype: contract.subtype,
      legacyDocumentType: contract.legacyDocumentType,
      alternatives: contract.alternatives,
    });
    expect(decision.action).toBe('AUTO_CONTINUE');
    expect(decision.effectiveType).toBe('FINE');
  });

  it('awaits user when high-confidence primary has competing alternative', () => {
    const contract = buildDocumentClassificationContract({
      raw: { ...HIGH_CONFIDENCE_SERVICE_WITH_ALTERNATIVE_FIXTURE } as DocumentClassificationLlmResponse,
      allowed: SUPPORTED_DOCUMENT_TYPES,
      maxPage: 2,
      modelVersion: 'mistral-small',
    });
    const decision = evaluateClassificationDecision({
      detectedDocumentType: contract.detectedDocumentType,
      confidence: contract.confidence,
      rationale: contract.rationale,
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
      category: contract.category,
      subtype: contract.subtype,
      legacyDocumentType: contract.legacyDocumentType,
      alternatives: contract.alternatives,
    });
    expect(decision.action).toBe('AWAIT_USER');
    expect(decision.hasSuggestion).toBe(true);
    expect(decision.detectedType).toBe('SERVICE');
  });

  it('awaits user for unclear subtype fixture', () => {
    const contract = buildDocumentClassificationContract({
      raw: { ...UNCLEAR_SUBTYPE_FIXTURE } as DocumentClassificationLlmResponse,
      allowed: SUPPORTED_DOCUMENT_TYPES,
      maxPage: null,
      modelVersion: 'mistral-small',
    });
    const decision = evaluateClassificationDecision({
      detectedDocumentType: contract.detectedDocumentType,
      confidence: contract.confidence,
      rationale: contract.rationale,
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
      category: contract.category,
      subtype: contract.subtype,
      legacyDocumentType: contract.legacyDocumentType,
      alternatives: contract.alternatives,
    });
    expect(decision.action).toBe('AWAIT_USER');
    expect(decision.hasSuggestion).toBe(false);
  });

  it('awaits user when general letter is forced as SERVICE', () => {
    const contract = buildDocumentClassificationContract({
      raw: { ...FORCED_SERVICE_GENERAL_LETTER_FIXTURE } as DocumentClassificationLlmResponse,
      allowed: SUPPORTED_DOCUMENT_TYPES,
      maxPage: 1,
      modelVersion: 'mistral-small',
    });
    const decision = evaluateClassificationDecision({
      detectedDocumentType: contract.detectedDocumentType,
      confidence: contract.confidence,
      rationale: contract.rationale,
      allowedDocumentTypes: SUPPORTED_DOCUMENT_TYPES,
      thresholds,
      category: contract.category,
      subtype: contract.subtype,
      legacyDocumentType: contract.legacyDocumentType,
      alternatives: contract.alternatives,
    });
    expect(decision.action).toBe('AWAIT_USER');
    expect(decision.hasSuggestion).toBe(true);
  });
});
