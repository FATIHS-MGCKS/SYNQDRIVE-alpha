import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import type { PhysicalEffectiveState } from './device-connection-physical-state.types';
import type { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import type { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import type {
  CurrentPhysicalStateProjection,
  IncomingPhysicalStateEvidence,
} from './device-connection-physical-state.types';
import type { PhysicalStateShadowComparisonDomain } from './physical-state-shadow-comparison-domain';
import type { ProvenSameStateProvenanceRefreshProof } from './physical-state-same-state-admissibility';
import type { SameStateProofParentSource } from './physical-state-same-state-proof-parent';

export type ShadowLegacyGateDecision = {
  accepted: boolean;
  reason?: string | null;
  gate: PhysicalStateCanonicalGate.LEGACY;
};

export type ShadowPhysicalGateDecision = {
  accepted: boolean;
  reason?: string | null;
  gate: PhysicalStateCanonicalGate.PHYSICAL;
  transitionDecision?: DeviceConnectionPhysicalTransitionDecision | null;
  effectiveState?: PhysicalEffectiveState | null;
};

export type PhysicalStateShadowComparisonInput = {
  scope: PhysicalAuthorityScope;
  authorityMode?: DeviceConnectionPhysicalAuthorityMode;
  bindingKey?: string | null;
  legacyBindingKey?: string | null;
  physicalBindingKey?: string | null;
  legacyDecision: ShadowLegacyGateDecision;
  physicalDecision: ShadowPhysicalGateDecision;
  legacyEffectivePlugState?: 'plugged' | 'unplugged' | 'unknown' | null;
  evidenceObservedAt?: Date | string | null;
  legacyEvidenceObservedAt?: Date | string | null;
  correlationId?: string | null;
  evidenceReferenceId?: string | null;
  /**
   * When true, OLD_REJECT + NEW_ACCEPT is classified as EXPECTED_FIX (GT-R1 class).
   * P2.2 unit tests set this explicitly; P2.3 sequence proof supplies runtime context.
   */
  provenExpectedFix?: boolean;
  bindingDivergenceExplained?: boolean;
  equalTimeOpposingState?: boolean;
  /** Runtime comparison timestamp; defaults to injectable wall clock when omitted. */
  comparisonObservedAt?: Date | string | null;
  /**
   * Projection + incoming evidence at comparison time (online admissibility inputs).
   */
  sameStateRefresh?: {
    previousProjection: CurrentPhysicalStateProjection | null;
    incoming: IncomingPhysicalStateEvidence;
    parentSource?: SameStateProofParentSource;
  };
  provenSameStateRefresh?: ProvenSameStateProvenanceRefreshProof | null;
};

export type PhysicalStateShadowComparisonResult = {
  classification: PhysicalStateShadowClassification;
  correctnessBlocking: boolean;
  authorityMode: DeviceConnectionPhysicalAuthorityMode;
  legacyDecision: ShadowLegacyGateDecision;
  physicalDecision: ShadowPhysicalGateDecision;
  scope: PhysicalAuthorityScope;
  bindingKey: string | null;
  legacyReason: string | null;
  physicalReason: string | null;
  legacyEffectivePlugState: 'plugged' | 'unplugged' | 'unknown' | null;
  physicalEffectiveState: PhysicalEffectiveState | null;
  evidenceObservedAt: string | null;
  legacyEvidenceObservedAt: string | null;
  correlationId: string | null;
  evidenceReferenceId: string | null;
  observedAt: string;
  comparisonDomain: PhysicalStateShadowComparisonDomain;
  provenSameStateRefreshVariant: string | null;
};
