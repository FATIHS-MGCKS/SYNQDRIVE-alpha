import { evaluateClassificationDecision } from './document-classification-decision.util';
import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import { CLASSIFICATION_UNKNOWN } from '@modules/ai/documents/document-classification.types';

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
});
