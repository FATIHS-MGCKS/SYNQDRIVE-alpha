import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';
import type { DocumentClassificationLlmResponse } from '@modules/ai/documents/document-classification.types';
import {
  buildDocumentClassificationContract,
  hasCompetingAlternativeCandidates,
  isGeneralCorrespondenceForcedAsService,
  isUnclearClassificationSubtype,
  normalizeClassificationAlternatives,
  sanitizeDetectedIdentifiers,
} from './document-classification-taxonomy.util';
import {
  CLEAR_FINE_NOTICE_FIXTURE,
  FORCED_SERVICE_GENERAL_LETTER_FIXTURE,
  GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE,
  HIGH_CONFIDENCE_SERVICE_WITH_ALTERNATIVE_FIXTURE,
  UNCLEAR_SUBTYPE_FIXTURE,
} from './__fixtures__/document-classification-fixtures';

const thresholds = {
  autoContinueMinConfidence: 0.85,
  suggestionMinConfidence: 0.55,
};

describe('document-classification-taxonomy.util', () => {
  describe('buildDocumentClassificationContract', () => {
    it('builds full contract from sanitized general correspondence fixture', () => {
      const contract = buildDocumentClassificationContract({
        raw: { ...GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE } as DocumentClassificationLlmResponse,
        allowed: SUPPORTED_DOCUMENT_TYPES,
        maxPage: 2,
        modelVersion: 'mistral-small',
      });

      expect(contract.contractVersion).toBe('2.0.0');
      expect(contract.category).toBe('CUSTOMER');
      expect(contract.subtype).toBe('CUSTOMER_CORRESPONDENCE');
      expect(contract.detectedDocumentType).toBe('OTHER');
      expect(contract.alternatives).toHaveLength(2);
      expect(contract.evidencePages).toEqual([1]);
      expect(contract.modelVersion).toBe('mistral-small');
      expect(contract.detectedIdentifiers.some((row) => row.identifierType === 'license_plate')).toBe(
        true,
      );
      expect(
        contract.detectedIdentifiers.find((row) => row.identifierType === 'license_plate')?.value,
      ).toContain('***');
    });

    it('maps clear fine notice without alternatives', () => {
      const contract = buildDocumentClassificationContract({
        raw: { ...CLEAR_FINE_NOTICE_FIXTURE } as DocumentClassificationLlmResponse,
        allowed: SUPPORTED_DOCUMENT_TYPES,
        maxPage: 1,
        modelVersion: 'mistral-small',
      });

      expect(contract.category).toBe('AUTHORITY');
      expect(contract.subtype).toBe('FINE_NOTICE');
      expect(contract.detectedDocumentType).toBe('FINE');
      expect(contract.alternatives).toHaveLength(0);
    });

    it('preserves competing alternatives for high-confidence service fixture', () => {
      const contract = buildDocumentClassificationContract({
        raw: { ...HIGH_CONFIDENCE_SERVICE_WITH_ALTERNATIVE_FIXTURE } as DocumentClassificationLlmResponse,
        allowed: SUPPORTED_DOCUMENT_TYPES,
        maxPage: 2,
        modelVersion: 'mistral-small',
      });

      expect(contract.subtype).toBe('SERVICE_REPORT');
      expect(contract.alternatives[0]?.subtype).toBe('INVOICE');
      expect(hasCompetingAlternativeCandidates(
        contract.confidence,
        contract.alternatives,
        contract.subtype,
      )).toBe(true);
    });
  });

  describe('sanitizeDetectedIdentifiers', () => {
    it('masks license plates and caps page numbers', () => {
      const rows = sanitizeDetectedIdentifiers(
        [
          { identifierType: 'license_plate', value: 'M-AB 1234', evidencePage: 1 },
          { identifierType: 'license_plate', value: 'KS-FH 660E', evidencePage: 99 },
        ],
        3,
      );
      expect(rows[0]?.value).toBe('M-***34');
      expect(rows[1]?.evidencePage).toBeNull();
    });
  });

  describe('taxonomy decision helpers', () => {
    it('flags unclear subtype for AWAITING_DOCUMENT_TYPE path', () => {
      const contract = buildDocumentClassificationContract({
        raw: { ...UNCLEAR_SUBTYPE_FIXTURE } as DocumentClassificationLlmResponse,
        allowed: SUPPORTED_DOCUMENT_TYPES,
        maxPage: null,
        modelVersion: 'mistral-small',
      });
      expect(
        isUnclearClassificationSubtype(
          contract.subtype,
          contract.confidence,
          thresholds.suggestionMinConfidence,
        ),
      ).toBe(true);
    });

    it('detects general letter forced as SERVICE', () => {
      const contract = buildDocumentClassificationContract({
        raw: { ...FORCED_SERVICE_GENERAL_LETTER_FIXTURE } as DocumentClassificationLlmResponse,
        allowed: SUPPORTED_DOCUMENT_TYPES,
        maxPage: 1,
        modelVersion: 'mistral-small',
      });
      expect(
        isGeneralCorrespondenceForcedAsService({
          category: contract.category,
          subtype: contract.subtype,
          legacyDocumentType: contract.legacyDocumentType,
          rationale: contract.rationale,
          alternatives: contract.alternatives,
        }),
      ).toBe(true);
    });

    it('does not flag genuine customer correspondence primary', () => {
      const alternatives = normalizeClassificationAlternatives(
        GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE.alternatives,
        new Set(SUPPORTED_DOCUMENT_TYPES),
      );
      expect(
        isGeneralCorrespondenceForcedAsService({
          category: 'CUSTOMER',
          subtype: 'CUSTOMER_CORRESPONDENCE',
          legacyDocumentType: 'OTHER',
          rationale: GENERAL_CORRESPONDENCE_CLASSIFICATION_FIXTURE.rationale,
          alternatives,
        }),
      ).toBe(false);
    });
  });
});
