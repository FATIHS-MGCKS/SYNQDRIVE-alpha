import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import type { ShadowPilotScopeGateReason } from './physical-state-shadow-pilot-scope.types';

/** Canonical gate path selected by latched authority mode — not by sub-flags. */
export enum PhysicalStateCanonicalGate {
  LEGACY = 'LEGACY',
  PHYSICAL = 'PHYSICAL',
}

export type AuthorityTransitionResult =
  | { allowed: true; from: DeviceConnectionPhysicalAuthorityMode; to: DeviceConnectionPhysicalAuthorityMode }
  | {
      allowed: false;
      from: DeviceConnectionPhysicalAuthorityMode;
      to: DeviceConnectionPhysicalAuthorityMode;
      reason: 'PHYSICAL_TO_LEGACY_FORBIDDEN' | 'NO_OP_TRANSITION' | 'UNSUPPORTED_TRANSITION';
    };

export type EffectivePhysicalStateRuntimePolicy = {
  authorityMode: DeviceConnectionPhysicalAuthorityMode;
  canonicalGate: PhysicalStateCanonicalGate;
  masterEnabled: boolean;
  projectionWriteEnabled: boolean;
  shadowCompareEnabled: boolean;
  authorityCutoverEnabled: boolean;
  sideEffectsEnabled: boolean;
  /** LEGACY + projection write + shadow compare + no side effects (P2.3 target). */
  statefulShadow: boolean;
  legacyGateAuthoritative: boolean;
  physicalGateAuthoritative: boolean;
  /** LEGACY pilot allowlist decision — PHYSICAL scopes bypass via BYPASSED_PHYSICAL_AUTHORITY. */
  pilotScopeAllowed: boolean;
  pilotGateReason: ShadowPilotScopeGateReason;
};
