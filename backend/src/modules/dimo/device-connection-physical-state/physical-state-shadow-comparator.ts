import {
  DeviceConnectionPhysicalAuthorityMode,
  DeviceConnectionPhysicalTransitionDecision,
} from '@prisma/client';
import { defaultAuthorityMode } from './physical-state-authority.state-machine';
import type { PhysicalEffectiveState } from './device-connection-physical-state.types';
import {
  isShadowClassificationCorrectnessBlocking,
  PhysicalStateShadowClassification,
} from './physical-state-shadow.classification';
import type {
  PhysicalStateShadowComparisonInput,
  PhysicalStateShadowComparisonResult,
} from './physical-state-shadow-comparator.types';
import { inferPhysicalStateShadowComparisonDomain } from './physical-state-shadow-comparison-domain';
import {
  isProvenNonIsomorphicSameStateRefresh,
  proveNonIsomorphicSameStateProvenanceRefresh,
} from './physical-state-same-state-admissibility';
import { getShadowComparisonObservedAt } from './physical-state-shadow-comparison.clock';

const LEGACY_STALE_LAST_EVENT_REASONS: ReadonlySet<string> = new Set([
  'no_state_change',
  'baseline_already_plugged',
]);

const EXPECTED_PHYSICAL_REJECT_DECISIONS: ReadonlySet<DeviceConnectionPhysicalTransitionDecision> =
  new Set([
    DeviceConnectionPhysicalTransitionDecision.DUPLICATE,
    DeviceConnectionPhysicalTransitionDecision.STALE,
    DeviceConnectionPhysicalTransitionDecision.CONFLICT,
    DeviceConnectionPhysicalTransitionDecision.INSUFFICIENT_EVIDENCE,
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

function timestampsDiffer(input: PhysicalStateShadowComparisonInput): boolean {
  const legacyTs = toIso(input.legacyEvidenceObservedAt);
  const physicalTs = toIso(input.evidenceObservedAt);
  return Boolean(legacyTs && physicalTs && legacyTs !== physicalTs);
}

/**
 * Canonical physical effective-state source: physicalDecision.effectiveState only.
 */
export function resolvePhysicalEffectiveState(
  input: PhysicalStateShadowComparisonInput,
): PhysicalEffectiveState | null {
  return input.physicalDecision.effectiveState ?? null;
}

/** Diagnostic helper — legacy reason metadata only; does not establish independent proof. */
export function isGtR1ExpectedFixLegacyReason(reason: string | null | undefined): boolean {
  const normalized = normalizeReason(reason);
  return normalized != null && LEGACY_STALE_LAST_EVENT_REASONS.has(normalized);
}

function plugStatesAlign(
  legacy: 'plugged' | 'unplugged' | 'unknown' | null | undefined,
  physical: PhysicalEffectiveState | null,
): boolean {
  if (!legacy || !physical) return legacy == null && physical == null;
  if (legacy === 'unknown') return false;
  const mapped =
    physical === 'PLUGGED' ? 'plugged' : physical === 'UNPLUGGED' ? 'unplugged' : null;
  return mapped === legacy;
}

function resolveComparatorLegacyBinding(
  input: PhysicalStateShadowComparisonInput,
): string | null {
  if (input.legacyBindingKey !== undefined) {
    return input.legacyBindingKey;
  }
  return input.bindingKey ?? null;
}

function resolveComparatorPhysicalBinding(
  input: PhysicalStateShadowComparisonInput,
): string | null {
  return input.physicalBindingKey ?? input.bindingKey ?? null;
}

function classifyBindingDivergence(
  input: PhysicalStateShadowComparisonInput,
): PhysicalStateShadowClassification | null {
  const legacyBinding = resolveComparatorLegacyBinding(input);
  const physicalBinding = resolveComparatorPhysicalBinding(input);
  if (legacyBinding && physicalBinding && legacyBinding !== physicalBinding) {
    return PhysicalStateShadowClassification.BINDING_DIVERGENCE;
  }
  return null;
}

function isStrictStateTransitionComparison(input: PhysicalStateShadowComparisonInput): boolean {
  const transition = input.physicalDecision.transitionDecision ?? null;
  if (
    transition !== DeviceConnectionPhysicalTransitionDecision.APPLIED &&
    transition !== DeviceConnectionPhysicalTransitionDecision.ESTABLISHED
  ) {
    return false;
  }

  const refresh = input.sameStateRefresh;
  if (!refresh) return true;

  const previous = refresh.previousProjection?.effectiveState ?? null;
  const candidate = refresh.incoming.candidateState;
  if (previous == null) return true;
  return previous !== candidate;
}

function resolveProvenSameStateRefresh(input: PhysicalStateShadowComparisonInput) {
  if (input.provenSameStateRefresh && isProvenNonIsomorphicSameStateRefresh(input.provenSameStateRefresh)) {
    return input.provenSameStateRefresh;
  }
  if (!input.sameStateRefresh) return null;
  return proveNonIsomorphicSameStateProvenanceRefresh({
    comparison: input,
    previousProjection: input.sameStateRefresh.previousProjection,
    incoming: input.sameStateRefresh.incoming,
  });
}

function classifyDecisionPair(input: PhysicalStateShadowComparisonInput): PhysicalStateShadowClassification {
  const legacyAccepted = input.legacyDecision.accepted;
  const physicalAccepted = input.physicalDecision.accepted;
  const physicalEffectiveState = resolvePhysicalEffectiveState(input);
  const transition = input.physicalDecision.transitionDecision ?? null;

  // 1. Equal-time opposing state / physical CONFLICT
  if (input.equalTimeOpposingState) {
    return PhysicalStateShadowClassification.CONFLICT;
  }
  if (transition === DeviceConnectionPhysicalTransitionDecision.CONFLICT) {
    return PhysicalStateShadowClassification.CONFLICT;
  }

  // 2. Binding mismatch
  const bindingClassification = classifyBindingDivergence(input);
  if (bindingClassification) {
    return bindingClassification;
  }

  // 3. Real state transitions — strict legacy vs physical (GT-R1 expected-fix path)
  if (isStrictStateTransitionComparison(input)) {
    if (!legacyAccepted && physicalAccepted) {
      if (input.provenExpectedFix === true) {
        return PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT;
      }
      return PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT;
    }

    if (legacyAccepted && !physicalAccepted) {
      if (transition && EXPECTED_PHYSICAL_REJECT_DECISIONS.has(transition)) {
        return PhysicalStateShadowClassification.OLD_ACCEPT_NEW_REJECT_EXPECTED;
      }
      return PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT;
    }

    if (legacyAccepted && physicalAccepted) {
      if (!plugStatesAlign(input.legacyEffectivePlugState, physicalEffectiveState)) {
        return PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN;
      }
      if (timestampsDiffer(input)) {
        return PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE;
      }
      return PhysicalStateShadowClassification.MATCH;
    }

    if (timestampsDiffer(input)) {
      return PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE;
    }
    return PhysicalStateShadowClassification.MATCH;
  }

  // 4. Proven same-state provenance refresh (non-isomorphic domains)
  const sameStateProof = resolveProvenSameStateRefresh(input);
  if (
    transition === DeviceConnectionPhysicalTransitionDecision.PROVENANCE_REFRESH &&
    sameStateProof &&
    isProvenNonIsomorphicSameStateRefresh(sameStateProof)
  ) {
    return PhysicalStateShadowClassification.NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH;
  }

  // 5. Standard decision-pair classification (includes unproven same-state refresh)
  if (!legacyAccepted && physicalAccepted) {
    if (input.provenExpectedFix === true) {
      return PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT;
    }
    return PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT;
  }

  if (legacyAccepted && !physicalAccepted) {
    if (transition && EXPECTED_PHYSICAL_REJECT_DECISIONS.has(transition)) {
      return PhysicalStateShadowClassification.OLD_ACCEPT_NEW_REJECT_EXPECTED;
    }
    return PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT;
  }

  if (legacyAccepted && physicalAccepted) {
    if (!plugStatesAlign(input.legacyEffectivePlugState, physicalEffectiveState)) {
      return PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN;
    }
    if (timestampsDiffer(input)) {
      return PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE;
    }
    return PhysicalStateShadowClassification.MATCH;
  }

  // 6. Both reject — timestamp metadata
  if (timestampsDiffer(input)) {
    return PhysicalStateShadowClassification.TIMESTAMP_DIVERGENCE;
  }

  return PhysicalStateShadowClassification.MATCH;
}

/**
 * Pure, side-effect-free shadow comparator.
 * OLD (legacy) decision remains authoritative during P2.2.
 */
export function comparePhysicalStateShadowDecisions(
  input: PhysicalStateShadowComparisonInput,
): PhysicalStateShadowComparisonResult {
  const provenSameStateRefresh = resolveProvenSameStateRefresh(input);
  const enrichedInput: PhysicalStateShadowComparisonInput = {
    ...input,
    provenSameStateRefresh,
  };
  const classification = classifyDecisionPair(enrichedInput);
  const physicalEffectiveState = resolvePhysicalEffectiveState(input);
  const comparisonDomain = inferPhysicalStateShadowComparisonDomain(enrichedInput);
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
    physicalEffectiveState,
    evidenceObservedAt: toIso(input.evidenceObservedAt),
    legacyEvidenceObservedAt: toIso(input.legacyEvidenceObservedAt),
    correlationId: input.correlationId ?? null,
    evidenceReferenceId: input.evidenceReferenceId ?? null,
    observedAt: toIso(input.comparisonObservedAt) ?? getShadowComparisonObservedAt().toISOString(),
    comparisonDomain,
    provenSameStateRefreshVariant: provenSameStateRefresh?.variant ?? null,
  };
}
