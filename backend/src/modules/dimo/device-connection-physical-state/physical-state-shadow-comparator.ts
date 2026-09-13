import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import { defaultAuthorityMode } from './physical-state-authority.state-machine';
import {
  isShadowClassificationCorrectnessBlocking,
  PhysicalStateShadowClassification,
} from './physical-state-shadow.classification';
import type {
  PhysicalStateShadowComparisonInput,
  PhysicalStateShadowComparisonResult,
} from './physical-state-shadow-comparator.types';

const EXPECTED_PHYSICAL_REJECT_DECISIONS: ReadonlySet<DeviceConnectionPhysicalTransitionDecision> =
  new Set([
    DeviceConnectionPhysicalTransitionDecision.DUPLICATE,
    DeviceConnectionPhysicalTransitionDecision.STALE,
    DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
  ]);

const LEGACY_STALE_LAST_EVENT_REASONS: ReadonlySet<string> = new Set([
  'no_state_change',
  'baseline_already_plugged',
]);

function normalizeReason(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function plugStatesAlign(
  legacy: 'plugged' | 'unplugged' | 'unknown' | null | undefined,
  physical: string | null | undefined,
): boolean {
  if (!legacy || !physical) return legacy == null && physical == null;
  if (legacy === 'unknown') return false;
  const mapped =
    physical === 'PLUGGED' ? 'plugged' : physical === 'UNPLUGGED' ? 'unplugged' : null;
  return mapped === legacy;
}

export function isGtR1ExpectedFixLegacyReason(reason: string | null | undefined): boolean {
  const normalized = normalizeReason(reason);
  return normalized != null && LEGACY_STALE_LAST_EVENT_REASONS.has(normalized);
}

function classifyDecisionPair(input: PhysicalStateShadowComparisonInput): PhysicalStateShadowClassification {
  const legacyAccepted = input.legacyDecision.accepted;
  const physicalAccepted = input.physicalDecision.accepted;

  if (input.equalTimeOpposingState) {
    return PhysicalStateShadowClassification.CONFLICT;
  }

  const legacyBinding = input.legacyBindingKey ?? input.bindingKey ?? null;
  const physicalBinding = input.physicalBindingKey ?? input.bindingKey ?? null;
  if (
    legacyBinding &&
    physicalBinding &&
    legacyBinding !== physicalBinding
  ) {
    return PhysicalStateShadowClassification.BINDING_DIVERGENCE;
  }

  const legacyTs = toIso(input.legacyEvidenceObservedAt);
  const physicalTs = toIso(input.evidenceObservedAt);
  if (
    legacyTs &&
    physicalTs &&
    legacyTs !== physicalTs &&
    legacyAccepted === physicalAccepted
  ) {
    return PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE;
  }

  if (!legacyAccepted && physicalAccepted) {
    if (
      input.provenExpectedFix ||
      isGtR1ExpectedFixLegacyReason(input.legacyDecision.reason)
    ) {
      return PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT;
    }
    return PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT;
  }

  if (legacyAccepted && !physicalAccepted) {
    const transitionDecision = input.physicalDecision.transitionDecision;
    if (
      transitionDecision &&
      EXPECTED_PHYSICAL_REJECT_DECISIONS.has(transitionDecision)
    ) {
      return PhysicalStateShadowClassification.OLD_ACCEPT_NEW_REJECT_EXPECTED;
    }
    return PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT;
  }

  if (legacyAccepted && physicalAccepted) {
    if (
      !plugStatesAlign(input.legacyEffectivePlugState, input.physicalEffectiveState ?? null)
    ) {
      return PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN;
    }
    return PhysicalStateShadowClassification.MATCH;
  }

  // Both rejected — MATCH when reasons align; otherwise unexplained divergence.
  const legacyReason = normalizeReason(input.legacyDecision.reason);
  const physicalReason = normalizeReason(input.physicalDecision.reason);
  if (legacyReason === physicalReason) {
    return PhysicalStateShadowClassification.MATCH;
  }

  return PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT;
}

/**
 * Pure, side-effect-free shadow comparator.
 * OLD (legacy) decision remains authoritative during P2.2.
 */
export function comparePhysicalStateShadowDecisions(
  input: PhysicalStateShadowComparisonInput,
): PhysicalStateShadowComparisonResult {
  const classification = classifyDecisionPair(input);
  const correctnessBlocking = isShadowClassificationCorrectnessBlocking(classification, {
    bindingDivergenceUnexplained: input.bindingDivergenceExplained !== true,
  });

  return {
    classification,
    correctnessBlocking,
    authorityMode: input.authorityMode ?? defaultAuthorityMode(),
    legacyDecision: input.legacyDecision,
    physicalDecision: input.physicalDecision,
    scope: input.scope,
    bindingKey: input.bindingKey ?? input.physicalBindingKey ?? input.legacyBindingKey ?? null,
    legacyReason: normalizeReason(input.legacyDecision.reason),
    physicalReason: normalizeReason(input.physicalDecision.reason),
    legacyEffectivePlugState: input.legacyEffectivePlugState ?? null,
    physicalEffectiveState: input.physicalEffectiveState ?? null,
    evidenceObservedAt: toIso(input.evidenceObservedAt),
    legacyEvidenceObservedAt: toIso(input.legacyEvidenceObservedAt),
    correlationId: input.correlationId ?? null,
    evidenceReferenceId: input.evidenceReferenceId ?? null,
    observedAt: new Date().toISOString(),
  };
}
