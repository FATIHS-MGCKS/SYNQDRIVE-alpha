import type { Zb1RegistrationCertificateExtract } from '@modules/document-extraction/zb1/zb1-registration-certificate.contract';

export const VEHICLE_IDENTITY_REVIEW_FIELD_CODES = [
  'd1Manufacturer',
  'd3TradeName',
  'd2TypeVariantVersion',
  'eVin',
  'p1DisplacementCc',
  'p2NominalPowerKw',
  'p3FuelOrEnergy',
  'hsnCode21',
  'tsnCode22',
  'manualPowerKind',
  'manualElectrificationGrade',
] as const;

export type VehicleIdentityReviewFieldCode = (typeof VEHICLE_IDENTITY_REVIEW_FIELD_CODES)[number];

export type VehicleIdentityValueProvenance =
  | 'DOCUMENT_EXTRACTED'
  | 'DIMO_PROVIDER'
  | 'MANUAL_ENTRY'
  | 'USER_CONFIRMED'
  | 'UNAVAILABLE'
  | 'CONFLICT';

export type VehicleIdentityReviewFieldState = {
  fieldCode: VehicleIdentityReviewFieldCode;
  documentFieldCode: string | null;
  labelKey: string;
  value: string | number | null;
  displayValue: string | null;
  provenance: VehicleIdentityValueProvenance;
  extractionStatus: string | null;
  conflict: boolean;
  dimoValue: string | number | null;
  documentValue: string | number | null;
  manualValue: string | number | null;
  userConfirmed: boolean;
  editable: boolean;
};

export type VehicleIdentityManualDraftInput = {
  displacementCc?: number | null;
  motorPowerKw?: number | null;
  fuelType?: string | null;
  powerKind?: 'COMBUSTION' | 'ELECTRIC_DRIVE' | 'COMBINED_SYSTEM' | null;
  electrificationGrade?: string | null;
};

export type VehicleIdentityFieldConfirmationInput = {
  fieldCode: VehicleIdentityReviewFieldCode;
  confirmed: boolean;
  correctedValue?: string | number | null;
};

export type VehicleIdentityReviewSnapshot = {
  p2PowerSemanticsWarning: string;
  fields: VehicleIdentityReviewFieldState[];
  vinMismatchBlocked: boolean;
  vinMismatchAcknowledged: boolean;
  documentExtractionId: string | null;
  zb1SchemaVersion: string | null;
  capabilities: {
    p2Enabled: boolean;
    zb1UploadEnabled: boolean;
    documentStoragePolicyAcknowledged: boolean;
  };
};

export type Zb1ExtractPayload = Zb1RegistrationCertificateExtract;
