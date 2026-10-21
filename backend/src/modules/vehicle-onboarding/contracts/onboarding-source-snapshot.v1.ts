import { ONBOARDING_SOURCE_SNAPSHOT_VERSION } from './vo-document-versions';

export type OnboardingProviderType = 'DIMO' | 'HIGH_MOBILITY' | 'MANUAL';

/** Governed normalized provider snapshot — not full raw provider payload. */
export interface OnboardingSourceSnapshotV1 {
  version: typeof ONBOARDING_SOURCE_SNAPSHOT_VERSION;
  providerType: OnboardingProviderType;
  connectionScope: string | null;
  externalVehicleIdentity: string;
  sourceMirrorTable: string | null;
  sourceMirrorId: string | null;
  observedAt: string;
  vin: string | null;
  vinProvenance: 'PROVIDER' | 'MANUAL' | null;
  vinVerificationState: 'UNVERIFIED' | 'VERIFIED' | 'CONFLICT' | null;
  make: string | null;
  model: string | null;
  year: number | null;
  fuelTypeHint: string | null;
  capabilityHints: string[];
  sourceEvidence: Record<string, unknown>;
  bindingMetadata: Record<string, unknown>;
}
