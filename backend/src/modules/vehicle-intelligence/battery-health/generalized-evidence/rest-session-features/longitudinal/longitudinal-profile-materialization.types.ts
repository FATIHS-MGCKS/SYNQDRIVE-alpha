import type { BatteryLongitudinalProfileRevision } from '@prisma/client';
import type { LongitudinalInputReadRejectReason } from './longitudinal-input.types';
import type { LongitudinalProfileAssemblyRejectReason } from './longitudinal-profile.types';

export type LongitudinalProfileMaterializationRequest = {
  organizationId: string;
  vehicleId: string;
  sessionLimit: number;
  /** Canonical UTC ISO envelope for D2 assembly only — not stored in scientific JSON. */
  profileGeneratedAt: string;
};

export type LongitudinalProfileMaterializationSuccessOutcome = {
  outcome: 'CREATED' | 'EXISTING';
  revisionId: string;
  canonicalProfileFingerprint: string;
  longitudinalProfileContractVersion: string;
  profilePolicyVersion: string;
  revision: BatteryLongitudinalProfileRevision;
};

export type LongitudinalProfileMaterializationRejectedOutcome =
  | { outcome: 'D1_REJECTED'; reason: LongitudinalInputReadRejectReason }
  | { outcome: 'D2_REJECTED'; reason: LongitudinalProfileAssemblyRejectReason };

export type LongitudinalProfileMaterializationOutcome =
  | LongitudinalProfileMaterializationSuccessOutcome
  | LongitudinalProfileMaterializationRejectedOutcome;

export type LongitudinalProfileMaterializationInsertOutcome = {
  persistenceOutcome: 'CREATED' | 'EXISTING';
  revision: BatteryLongitudinalProfileRevision;
};
