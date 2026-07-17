import { describe, expect, it } from 'vitest';
import {
  buildRecognitionReasonKeys,
  formatRecognitionReasonList,
  parseDocumentClassificationResult,
  resolveClassificationConfidenceBand,
  resolveClassificationDisplayLabel,
} from './document-classification-result';

const FINE_CLASSIFICATION = {
  contractVersion: '2.0.0',
  category: 'AUTHORITY',
  subtype: 'FINE_NOTICE',
  confidence: 0.96,
  rationale: 'Authority penalty notice with offense and payable amount',
  alternatives: [],
  detectedIdentifiers: [
    { identifierType: 'fine_number', value: 'VB-2026-1199', evidencePage: 1 },
    { identifierType: 'license_plate', value: 'M-SY 1010', evidencePage: 1 },
  ],
  modelVersion: 'mistral-small-latest',
  decisionAction: 'AUTO_CONTINUE',
  legacyDocumentType: 'FINE',
  detectedDocumentType: 'FINE',
};

describe('document-classification-result', () => {
  it('parses fine notice classification from plausibility contract', () => {
    const result = parseDocumentClassificationResult({
      plausibility: { classification: FINE_CLASSIFICATION },
      documentCategory: 'AUTHORITY',
      documentSubtype: 'FINE_NOTICE',
      classificationConfidence: 0.96,
      detectedDocumentType: 'FINE',
      effectiveDocumentType: 'FINE',
      documentType: 'FINE',
      classificationMode: 'AUTO',
    });

    expect(result).not.toBeNull();
    expect(result?.subtype).toBe('FINE_NOTICE');
    expect(result?.confidenceBand).toBe('high');
    expect(result?.recognitionReasonKeys).toContain('docUpload.classificationReason.fineNumber');
    expect(result?.recognitionReasonKeys).toContain('docUpload.classificationReason.authority');
  });

  it('marks uncertain when awaiting user with competing alternatives', () => {
    const result = parseDocumentClassificationResult({
      plausibility: {
        classification: {
          ...FINE_CLASSIFICATION,
          confidence: 0.72,
          decisionAction: 'AWAIT_USER',
          alternatives: [
            {
              category: 'FINANCE',
              subtype: 'INVOICE',
              legacyDocumentType: 'INVOICE',
              confidence: 0.66,
            },
          ],
        },
      },
      documentCategory: 'AUTHORITY',
      documentSubtype: 'FINE_NOTICE',
      classificationConfidence: 0.72,
      detectedDocumentType: 'FINE',
      effectiveDocumentType: null,
      documentType: null,
      classificationMode: 'AUTO',
    });

    expect(result?.isUncertain).toBe(true);
    expect(result?.alternatives).toHaveLength(1);
    expect(resolveClassificationConfidenceBand(result?.confidence ?? null)).toBe('medium');
  });

  it('builds German recognition reason list', () => {
    const keys = buildRecognitionReasonKeys({
      category: 'AUTHORITY',
      subtype: 'FINE_NOTICE',
      rationale: FINE_CLASSIFICATION.rationale,
      detectedIdentifiers: FINE_CLASSIFICATION.detectedIdentifiers,
    });
    const list = formatRecognitionReasonList(keys, (key) => {
      const map: Record<string, string> = {
        'docUpload.classificationReason.fineNumber': 'Aktenzeichen',
        'docUpload.classificationReason.licensePlate': 'Kennzeichen',
        'docUpload.classificationReason.authority': 'Behoerde',
        'docUpload.classificationReason.offenseDate': 'Tatdatum',
      };
      return map[key] ?? key;
    }, 'de');
    expect(list).toContain('Aktenzeichen');
    expect(list).toContain('und');
  });

  it('prefers subtype label for display headline', () => {
    const label = resolveClassificationDisplayLabel({
      subtype: 'FINE_NOTICE',
      legacyDocumentType: 'FINE',
      typeLabel: (key, fallback) => (key.endsWith('FINE_NOTICE') ? 'Bussgeldbescheid' : fallback ?? key),
    });
    expect(label).toBe('Bussgeldbescheid');
  });
});
