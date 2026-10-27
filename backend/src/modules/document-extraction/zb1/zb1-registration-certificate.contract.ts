/**
 * Canonical Zulassungsbescheinigung Teil I extraction contract (Germany).
 * Versioned separately from generic document-extraction field schemas.
 */
export const ZB1_REGISTRATION_CERTIFICATE_SCHEMA_VERSION = 'zb1_v1' as const;

export const ZB1_DOCUMENT_FIELD_CODES = [
  'D.1',
  'D.2',
  'D.3',
  'E',
  'P.1',
  'P.2',
  'P.3',
  '2.1',
  '2.2',
  'F.1',
  'G',
  'TIRE',
] as const;

export type Zb1DocumentFieldCode = (typeof ZB1_DOCUMENT_FIELD_CODES)[number];

export const ZB1_EXTRACTION_STATUSES = [
  'EXTRACTED',
  'MISSING',
  'UNREADABLE',
  'AMBIGUOUS',
  'INVALID',
] as const;

export type Zb1ExtractionStatus = (typeof ZB1_EXTRACTION_STATUSES)[number];

/** P1: only document OCR path — never USER_CONFIRMED or MANUFACTURER_CONFIRMED. */
export const ZB1_FIELD_PROVENANCE = 'DOCUMENT_EXTRACTED' as const;

export type Zb1FieldProvenance = typeof ZB1_FIELD_PROVENANCE;

export type Zb1ScalarValue = string | number | null;

export interface Zb1ExtractedField<T extends Zb1ScalarValue = Zb1ScalarValue> {
  documentFieldCode: Zb1DocumentFieldCode;
  value: T;
  extractionStatus: Zb1ExtractionStatus;
  /** Null unless a deterministic validator provides a justified score (e.g. none in P1 OCR-only). */
  confidence: number | null;
  provenance: Zb1FieldProvenance;
}

export type Zb1RegistrationCertificateFieldMap = {
  d1Manufacturer: Zb1ExtractedField<string | null>;
  d2TypeVariantVersion: Zb1ExtractedField<string | null>;
  d3TradeName: Zb1ExtractedField<string | null>;
  eVin: Zb1ExtractedField<string | null>;
  p1DisplacementCc: Zb1ExtractedField<number | null>;
  p2NominalPowerKw: Zb1ExtractedField<number | null>;
  p3FuelOrEnergy: Zb1ExtractedField<string | null>;
  hsnCode21: Zb1ExtractedField<string | null>;
  tsnCode22: Zb1ExtractedField<string | null>;
  f1PermissibleTotalMassKg: Zb1ExtractedField<number | null>;
  gKerbMassKg: Zb1ExtractedField<number | null>;
  registeredTireDimensions: Zb1ExtractedField<string | null>[];
};

/**
 * P.2 from ZB-I is nominal power per registration document — not hybrid system/traction power.
 */
export const ZB1_P2_SEMANTICS = {
  code: 'ZB1_P2_NOMINAL_POWER_NOT_SYSTEM_POWER',
  message:
    'P.2 is Zulassungsbescheinigung nominal power (kW). Do not map automatically to systemMotorPowerKw without variant review.',
} as const;

export interface Zb1RegistrationCertificateExtract {
  schemaVersion: typeof ZB1_REGISTRATION_CERTIFICATE_SCHEMA_VERSION;
  fields: Zb1RegistrationCertificateFieldMap;
  p2PowerSemantics: typeof ZB1_P2_SEMANTICS;
  warnings: string[];
}

export function emptyZb1Field(
  documentFieldCode: Zb1DocumentFieldCode,
  status: Zb1ExtractionStatus = 'MISSING',
): Zb1ExtractedField<null> {
  return {
    documentFieldCode,
    value: null,
    extractionStatus: status,
    confidence: null,
    provenance: ZB1_FIELD_PROVENANCE,
  };
}

export function zb1Field<T extends Zb1ScalarValue>(
  documentFieldCode: Zb1DocumentFieldCode,
  value: T,
  status: Zb1ExtractionStatus,
): Zb1ExtractedField<T> {
  return {
    documentFieldCode,
    value,
    extractionStatus: status,
    confidence: null,
    provenance: ZB1_FIELD_PROVENANCE,
  };
}

export function buildEmptyZb1RegistrationCertificateExtract(): Zb1RegistrationCertificateExtract {
  return {
    schemaVersion: ZB1_REGISTRATION_CERTIFICATE_SCHEMA_VERSION,
    fields: {
      d1Manufacturer: emptyZb1Field('D.1'),
      d2TypeVariantVersion: emptyZb1Field('D.2'),
      d3TradeName: emptyZb1Field('D.3'),
      eVin: emptyZb1Field('E'),
      p1DisplacementCc: emptyZb1Field('P.1'),
      p2NominalPowerKw: emptyZb1Field('P.2'),
      p3FuelOrEnergy: emptyZb1Field('P.3'),
      hsnCode21: emptyZb1Field('2.1'),
      tsnCode22: emptyZb1Field('2.2'),
      f1PermissibleTotalMassKg: emptyZb1Field('F.1'),
      gKerbMassKg: emptyZb1Field('G'),
      registeredTireDimensions: [],
    },
    p2PowerSemantics: ZB1_P2_SEMANTICS,
    warnings: [],
  };
}
