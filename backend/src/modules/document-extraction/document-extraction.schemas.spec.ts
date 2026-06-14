import {
  DOCUMENT_FIELD_SCHEMAS,
  SUPPORTED_DOCUMENT_TYPES,
  isSupportedDocumentType,
  isAllowedMimeType,
  getFieldSchema,
  buildEmptyExtractedData,
} from './document-extraction.schemas';

describe('document-extraction.schemas', () => {
  describe('isSupportedDocumentType', () => {
    it('accepts every declared SynqDrive document type', () => {
      for (const t of SUPPORTED_DOCUMENT_TYPES) {
        expect(isSupportedDocumentType(t)).toBe(true);
      }
      // Spot-check the product-required set explicitly.
      for (const t of [
        'SERVICE',
        'OIL_CHANGE',
        'TIRE',
        'BRAKE',
        'BATTERY',
        'TUV_REPORT',
        'BOKRAFT_REPORT',
        'VEHICLE_CONDITION',
        'INVOICE',
        'DAMAGE',
        'ACCIDENT',
        'OTHER',
      ]) {
        expect(isSupportedDocumentType(t)).toBe(true);
      }
    });

    it('rejects unknown / non-string values', () => {
      expect(isSupportedDocumentType('NONSENSE')).toBe(false);
      expect(isSupportedDocumentType('service')).toBe(false); // case-sensitive
      expect(isSupportedDocumentType(undefined)).toBe(false);
      expect(isSupportedDocumentType(42)).toBe(false);
      expect(isSupportedDocumentType(null)).toBe(false);
    });
  });

  describe('isAllowedMimeType', () => {
    it('accepts the allowed upload mime types (case-insensitive)', () => {
      for (const m of [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        'APPLICATION/PDF',
      ]) {
        expect(isAllowedMimeType(m)).toBe(true);
      }
    });

    it('rejects disallowed or missing mime types', () => {
      expect(isAllowedMimeType('application/zip')).toBe(false);
      expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
      expect(isAllowedMimeType(undefined)).toBe(false);
      expect(isAllowedMimeType('')).toBe(false);
    });
  });

  describe('getFieldSchema', () => {
    it('returns the schema for a known type', () => {
      const schema = getFieldSchema('SERVICE');
      const keys = schema.map((f) => f.key);
      expect(keys).toEqual(expect.arrayContaining(['eventDate', 'odometerKm', 'costCents']));
    });

    it('declares schemas for every DocumentExtractionType', () => {
      for (const t of SUPPORTED_DOCUMENT_TYPES) {
        expect(Array.isArray(DOCUMENT_FIELD_SCHEMAS[t])).toBe(true);
        expect(DOCUMENT_FIELD_SCHEMAS[t].length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildEmptyExtractedData', () => {
    it('produces a flat null shape with nested measurement objects', () => {
      const empty = buildEmptyExtractedData('TIRE');
      expect(empty.eventDate).toBeNull();
      expect(empty.season).toBeNull();
      // treadDepthMm.{fl,fr,rl,rr} must be nested, not dotted keys.
      expect(empty.treadDepthMm).toEqual({ fl: null, fr: null, rl: null, rr: null });
      expect(empty['treadDepthMm.fl']).toBeUndefined();
    });
  });
});
