import type { VehicleIdentityValueProvenance } from './vehicle-identity-review.types';

export const REGISTRATION_IDENTITY_CANONICAL_VERSION = 1;

export type RegistrationIdentityCanonicalFieldKey =
  | 'make'
  | 'model'
  | 'year'
  | 'vin'
  | 'displacementCc'
  | 'fuelType'
  | 'nominalMotorPowerKw'
  | 'powerKind'
  | 'electrificationGrade'
  | 'hsn'
  | 'tsn'
  | 'typeVariantVersion';

export type RegistrationIdentityCanonicalField = {
  key: RegistrationIdentityCanonicalFieldKey;
  value: string | number | null;
  provenance: VehicleIdentityValueProvenance;
  confirmationStatus: 'USER_CONFIRMED';
  documentExtractionId: string | null;
};

export type RegistrationIdentityCanonicalIdentity = {
  version: typeof REGISTRATION_IDENTITY_CANONICAL_VERSION;
  documentExtractionId: string | null;
  fields: RegistrationIdentityCanonicalField[];
};

export type RegistrationIdentityFieldProvenanceEntry = {
  value: string | number | boolean | null;
  provenance: VehicleIdentityValueProvenance;
  confirmationStatus: 'USER_CONFIRMED' | 'SUGGESTED' | 'UNCONFIRMED' | 'PROTECTED';
  confirmedAt: string | null;
  documentExtractionId: string | null;
};

export type RegistrationIdentityProvenanceDocument = {
  version: 1;
  updatedAt: string;
  fields: Partial<Record<RegistrationIdentityCanonicalFieldKey, RegistrationIdentityFieldProvenanceEntry>>;
};

export type VehicleIdentityAiV2PreviewResult = {
  ok: boolean;
  canonical: RegistrationIdentityCanonicalIdentity;
  aiSpecs: Record<string, string | number | boolean | null>;
  suggestedFields: Partial<
    Record<RegistrationIdentityCanonicalFieldKey | 'engineDisplacementCc' | 'systemMotorPowerKw' | 'resolvedVariant', RegistrationIdentityFieldProvenanceEntry>
  >;
  conflicts: Array<{ code: string; fieldKey: string; message: string }>;
  rejectedAiFields: string[];
  aiLiveInvoked: boolean;
};
