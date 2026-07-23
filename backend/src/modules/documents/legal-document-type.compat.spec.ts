import { DOCUMENT_TYPE } from './documents.constants';
import {
  CONSUMER_INFORMATION_VARIANT,
  isAcceptedLegalDocumentTypeInput,
  isConsumerInformationVariant,
  LEGACY_DOCUMENT_TYPE_ALIASES,
  normalizeLegalDocumentType,
  resolveLegalVariantInput,
  toLegacyDocumentType,
  hasOrgActiveLegalDocument,
  legalDocumentLookupKeys,
} from './legal-document-type.compat';

describe('legal-document-type.compat', () => {
  describe('normalizeLegalDocumentType (legacy mapping)', () => {
    it('maps WITHDRAWAL_INFORMATION to CONSUMER_INFORMATION', () => {
      expect(normalizeLegalDocumentType(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION)).toBe(
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
      );
    });

    it('passes through canonical types unchanged', () => {
      expect(normalizeLegalDocumentType(DOCUMENT_TYPE.TERMS_AND_CONDITIONS)).toBe(
        DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      );
      expect(normalizeLegalDocumentType(DOCUMENT_TYPE.CONSUMER_INFORMATION)).toBe(
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
      );
    });
  });

  describe('resolveLegalVariantInput', () => {
    it('defaults legacy WITHDRAWAL_INFORMATION to WITHDRAWAL_RIGHT_NOTICE', () => {
      expect(resolveLegalVariantInput(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, null)).toBe(
        CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
      );
    });

    it('accepts explicit variants for CONSUMER_INFORMATION', () => {
      expect(
        resolveLegalVariantInput(
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
          CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE,
        ),
      ).toBe(CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE);
    });

    it('returns null for non-consumer types', () => {
      expect(resolveLegalVariantInput(DOCUMENT_TYPE.PRIVACY_POLICY, null)).toBeNull();
    });

    it('rejects unknown variants', () => {
      expect(() =>
        resolveLegalVariantInput(DOCUMENT_TYPE.CONSUMER_INFORMATION, 'INVALID'),
      ).toThrow(/Invalid consumer information variant/);
    });
  });

  describe('toLegacyDocumentType (API compatibility)', () => {
    it('exposes WITHDRAWAL_INFORMATION for legacy withdrawal variant', () => {
      expect(
        toLegacyDocumentType(
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
          CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
        ),
      ).toBe(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
    });

    it('does not expose legacy alias for other variants', () => {
      expect(
        toLegacyDocumentType(
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
          CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE,
        ),
      ).toBeNull();
    });
  });

  describe('isAcceptedLegalDocumentTypeInput', () => {
    it('accepts canonical and legacy upload types', () => {
      expect(isAcceptedLegalDocumentTypeInput(DOCUMENT_TYPE.CONSUMER_INFORMATION)).toBe(true);
      expect(isAcceptedLegalDocumentTypeInput(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION)).toBe(true);
      expect(isAcceptedLegalDocumentTypeInput('NOT_A_TYPE')).toBe(false);
    });
  });

  describe('legalDocumentLookupKeys (historical resolution)', () => {
    it('includes legacy key for migrated consumer-information rows', () => {
      const keys = legalDocumentLookupKeys(
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
      );
      expect(keys).toContain(DOCUMENT_TYPE.CONSUMER_INFORMATION);
      expect(keys).toContain(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
    });

    it('maps legacy input to consumer key', () => {
      expect(legalDocumentLookupKeys(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, null)).toContain(
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
      );
    });

    it('resolves org maps keyed by legacy WITHDRAWAL_INFORMATION', () => {
      expect(
        hasOrgActiveLegalDocument(
          { [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]: { id: 'w1' } },
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
        ),
      ).toBe(true);
    });
  });

  describe('migration defaults', () => {
    it('defines legacy alias table for WITHDRAWAL_INFORMATION', () => {
      expect(LEGACY_DOCUMENT_TYPE_ALIASES[DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]).toBe(
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
      );
    });

    it('recognizes all consumer variants', () => {
      for (const v of Object.values(CONSUMER_INFORMATION_VARIANT)) {
        expect(isConsumerInformationVariant(v)).toBe(true);
      }
    });
  });

  describe('API compatibility (read path)', () => {
    it('maps migrated rows to legacy documentType for withdrawal variant clients', () => {
      const legacy = toLegacyDocumentType(
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
      );
      expect(legacy).toBe(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
      expect(
        legalDocumentLookupKeys(DOCUMENT_TYPE.CONSUMER_INFORMATION, CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE),
      ).toContain(DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
    });
  });

  describe('new variants', () => {
    it('supports NO_WITHDRAWAL_RIGHT_NOTICE without legacy alias', () => {
      expect(
        resolveLegalVariantInput(
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
          CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE,
        ),
      ).toBe(CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE);
      expect(
        toLegacyDocumentType(
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
          CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE,
        ),
      ).toBeNull();
    });
  });
});
