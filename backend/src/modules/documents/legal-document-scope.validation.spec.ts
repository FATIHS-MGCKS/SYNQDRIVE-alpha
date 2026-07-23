import {
  LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS,
  deriveJurisdictionFromLanguageCode,
  deriveNoticePurpose,
} from './legal-document-scope.constants';
import {
  LegalScopeValidationError,
  validateJurisdictionCountry,
  validateLanguageCode,
  validateLegalScopeInput,
  validatePriority,
} from './legal-document-scope.validation';

describe('legal-document-scope.validation', () => {
  describe('validateLanguageCode', () => {
    it('accepts ISO 639-1 codes', () => {
      expect(validateLanguageCode('de')).toBe('de');
      expect(validateLanguageCode('de-DE')).toBe('de-DE');
    });

    it('rejects invalid language codes', () => {
      expect(() => validateLanguageCode('german', false)).toThrow(LegalScopeValidationError);
      expect(() => validateLanguageCode('de_de', false)).toThrow(/ISO 639-1/);
      expect(() => validateLanguageCode('', false)).toThrow();
    });

    it('defaults empty to de for legacy compatibility', () => {
      expect(validateLanguageCode('', true)).toBe('de');
    });
  });

  describe('validateJurisdictionCountry', () => {
    it('accepts ISO 3166-1 alpha-2 codes', () => {
      expect(validateJurisdictionCountry('de')).toBe('DE');
      expect(validateJurisdictionCountry('AT')).toBe('AT');
    });

    it('rejects invalid country codes', () => {
      expect(() => validateJurisdictionCountry('Germany')).toThrow(/ISO 3166-1/);
      expect(() => validateJurisdictionCountry('DEU')).toThrow(/ISO 3166-1/);
      expect(() => validateJurisdictionCountry('D')).toThrow(/ISO 3166-1/);
    });
  });

  describe('validatePriority', () => {
    it('rejects out-of-range priorities', () => {
      expect(() => validatePriority(-1)).toThrow(/priority/);
      expect(() => validatePriority(1001)).toThrow(/priority/);
    });
  });

  describe('validateLegalScopeInput', () => {
    it('applies documented legacy defaults for German documents', () => {
      const result = validateLegalScopeInput({ language: 'de' });
      expect(result.language).toBe('de');
      expect(result.jurisdictionCountry).toBe('DE');
      expect(result.customerSegment).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.customerSegment);
      expect(result.bookingChannel).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.bookingChannel);
      expect(result.stationScopeMode).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.stationScopeMode);
      expect(result.priority).toBe(LEGAL_DOCUMENT_LEGACY_SCOPE_DEFAULTS.priority);
      expect(result.isMandatory).toBe(true);
    });

    it('derives AT jurisdiction from Austrian language codes', () => {
      expect(deriveJurisdictionFromLanguageCode('at')).toBe('AT');
      expect(validateLegalScopeInput({ language: 'at' }).jurisdictionCountry).toBe('AT');
    });

    it('requires stationIds for STATION_SPECIFIC scope', () => {
      expect(() =>
        validateLegalScopeInput({
          stationScopeMode: 'STATION_SPECIFIC',
          stationIds: [],
        }),
      ).toThrow(/stationIds/);
    });

    it('rejects overlapping validFrom and validUntil', () => {
      expect(() =>
        validateLegalScopeInput({
          validFrom: '2026-12-01T00:00:00.000Z',
          validUntil: '2026-01-01T00:00:00.000Z',
        }),
      ).toThrow(/validFrom/);
    });

    it('derives notice purpose from document context when not provided', () => {
      expect(deriveNoticePurpose('TERMS_AND_CONDITIONS', null)).toBe('TERMS_AND_CONDITIONS');
      expect(deriveNoticePurpose('CONSUMER_INFORMATION', 'WITHDRAWAL_RIGHT_NOTICE')).toBe(
        'WITHDRAWAL_RIGHT_NOTICE',
      );
    });
  });
});
