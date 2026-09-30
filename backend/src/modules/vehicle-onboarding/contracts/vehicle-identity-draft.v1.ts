import { VEHICLE_IDENTITY_DRAFT_VERSION } from './vo-document-versions';

export interface VehicleIdentityDraftV1 {
  version: typeof VEHICLE_IDENTITY_DRAFT_VERSION;
  vin: string | null;
  vinProvenance: 'PROVIDER' | 'MANUAL' | 'DOCUMENT' | null;
  vinVerificationState: 'UNVERIFIED' | 'VERIFIED' | 'CONFLICT' | null;
  make: string | null;
  model: string | null;
  year: number | null;
  fuelType: string | null;
  sourceEvidenceRefs: Array<{ provider: string; sourceMirrorId: string | null }>;
}
