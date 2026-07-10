import {
  DOCUMENT_EXTRACTION_ERROR_CODES,
  deriveClassificationMode,
  requireApplyDocumentType,
  resolveEffectiveDocumentType,
} from './document-extraction-lifecycle.util';
import { BadRequestException } from '@nestjs/common';

describe('document-extraction-lifecycle.util', () => {
  describe('resolveEffectiveDocumentType', () => {
    it('prefers effectiveDocumentType over legacy documentType', () => {
      expect(
        resolveEffectiveDocumentType({
          effectiveDocumentType: 'BRAKE',
          documentType: 'SERVICE',
        }),
      ).toBe('BRAKE');
    });

    it('falls back to legacy documentType for backward compatibility', () => {
      expect(resolveEffectiveDocumentType({ documentType: 'SERVICE' })).toBe('SERVICE');
    });

    it('returns null for AUTO request without resolved type', () => {
      expect(
        resolveEffectiveDocumentType({
          effectiveDocumentType: null,
          documentType: null,
        }),
      ).toBeNull();
    });

    it('never returns AUTO as an apply type', () => {
      expect(
        resolveEffectiveDocumentType({
          effectiveDocumentType: 'AUTO',
          documentType: 'AUTO',
        }),
      ).toBeNull();
    });
  });

  describe('requireApplyDocumentType', () => {
    it('throws when type is unresolved', () => {
      expect(() => requireApplyDocumentType({ documentType: null })).toThrow(BadRequestException);
    });
  });

  describe('deriveClassificationMode', () => {
    it('returns AUTO for AUTO requests', () => {
      expect(deriveClassificationMode('AUTO')).toBe('AUTO');
    });

    it('returns MANUAL for explicit document types', () => {
      expect(deriveClassificationMode('SERVICE')).toBe('MANUAL');
    });
  });

  describe('DOCUMENT_EXTRACTION_ERROR_CODES', () => {
    it('exposes stable machine-readable codes', () => {
      expect(DOCUMENT_EXTRACTION_ERROR_CODES.OCR_NOT_CONFIGURED).toBe('OCR_NOT_CONFIGURED');
      expect(DOCUMENT_EXTRACTION_ERROR_CODES.CLASSIFICATION_REQUIRED).toBe('CLASSIFICATION_REQUIRED');
    });
  });
});
