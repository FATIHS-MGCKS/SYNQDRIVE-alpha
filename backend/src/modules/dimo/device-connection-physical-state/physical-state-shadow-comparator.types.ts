import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import type { PhysicalAuthorityScope } from './device-connection-physical-authority-cutover.repository';
import type { PhysicalEffectiveState } from './device-connection-physical-state.types';
import type { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import type { PhysicalStateCanonicalGate } from './physical-state-authority.types';

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
  physicalEffectiveState?: PhysicalEffectiveState | null;
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
};
