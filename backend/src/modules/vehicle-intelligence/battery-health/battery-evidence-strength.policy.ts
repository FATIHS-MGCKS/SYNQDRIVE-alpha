import { BatteryEvidenceScope, BatteryEvidenceSourceType } from '@prisma/client';
import { BATTERY_FRESHNESS_THRESHOLDS_MS } from './battery-freshness.policy';
import {
  buildObservationFreshness,
  observationFreshnessIsDecisionFresh,
} from './battery-freshness.policy';
import {
  BatteryDiagnosticEvidenceKind,
  BatteryEvidenceStrength,
  BatteryEvidenceStrengthTier,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  type BatteryMeasurementScope,
} from './battery-v2-domain';
import {
  isCrankMeasurementType,
  isRestMeasurementType,
  LV_WORKSHOP_MEASUREMENT_TYPES,
} from '../battery-policy-profile/battery-policy-profile.measurement-sets';

/** Documented central evidence-strength contract — bump when tier/capability rules change. */
export const BATTERY_EVIDENCE_STRENGTH_POLICY_VERSION = '1.0.0';

const WORKSHOP_TYPES = new Set<BatteryMeasurementType>(LV_WORKSHOP_MEASUREMENT_TYPES);

/** Higher rank = stronger tier (base priority before freshness adjustment). */
const TIER_RANK: Record<BatteryEvidenceStrengthTier, number> = {
  [BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED]: 9,
  [BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED]: 8,
  [BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH]: 7,
  [BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE]: 6,
  [BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL]: 5,
  [BatteryEvidenceStrengthTier.ESTIMATED]: 4,
  [BatteryEvidenceStrengthTier.PROXY]: 3,
  [BatteryEvidenceStrengthTier.LIVE_TELEMETRY]: 2,
  [BatteryEvidenceStrengthTier.UNKNOWN]: 1,
};

/** Penalty applied to stale evidence when competing within the same scope. */
const STALE_TIER_PENALTY = 3;

export interface BatteryEvidenceCapabilities {
  canAffectAssessment: boolean;
  canPublish: boolean;
  canAffectReadiness: boolean;
  canTriggerAlert: boolean;
  canCreateTask: boolean;
  /** Proxy/shadow never veto stronger publication or readiness paths. */
  neverHardBlock: boolean;
}

export interface BatteryEvidenceConflictCandidate {
  id: string;
  tier: BatteryEvidenceStrengthTier;
  scope: BatteryMeasurementScope;
  observedAt?: Date | string | null;
  freshnessMaxAgeMs?: number;
  diagnosticKind?: BatteryDiagnosticEvidenceKind | null;
  traceability?: {
    sourceType?: string | null;
    serviceEventId?: string | null;
    documentExtractionId?: string | null;
    measurementId?: string | null;
  };
}

export interface BatteryEvidenceConflictResolution {
  policyVersion: string;
  winner: BatteryEvidenceConflictCandidate | null;
  supplementary: BatteryEvidenceConflictCandidate[];
  outOfScope: BatteryEvidenceConflictCandidate[];
  diagnostics: BatteryEvidenceConflictCandidate[];
  resolutionReason: string;
}

export function tierRank(tier: BatteryEvidenceStrengthTier): number {
  return TIER_RANK[tier] ?? 0;
}

export function strongerTier(
  a: BatteryEvidenceStrengthTier,
  b: BatteryEvidenceStrengthTier,
): BatteryEvidenceStrengthTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

export function aggregateEvidenceStrengthTier(
  tiers: BatteryEvidenceStrengthTier[],
): BatteryEvidenceStrengthTier {
  if (tiers.length === 0) {
    return BatteryEvidenceStrengthTier.UNKNOWN;
  }
  return tiers.reduce((best, tier) => strongerTier(best, tier));
}

export function getEvidenceCapabilities(
  tier: BatteryEvidenceStrengthTier,
): BatteryEvidenceCapabilities {
  switch (tier) {
    case BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED:
    case BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED:
    case BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH:
      return {
        canAffectAssessment: true,
        canPublish: true,
        canAffectReadiness: true,
        canTriggerAlert: true,
        canCreateTask: true,
        neverHardBlock: false,
      };
    case BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE:
      return {
        canAffectAssessment: true,
        canPublish: true,
        canAffectReadiness: true,
        canTriggerAlert: true,
        canCreateTask: false,
        neverHardBlock: false,
      };
    case BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL:
      return {
        canAffectAssessment: true,
        canPublish: false,
        canAffectReadiness: false,
        canTriggerAlert: true,
        canCreateTask: false,
        neverHardBlock: false,
      };
    case BatteryEvidenceStrengthTier.ESTIMATED:
      return {
        canAffectAssessment: true,
        canPublish: false,
        canAffectReadiness: false,
        canTriggerAlert: true,
        canCreateTask: false,
        neverHardBlock: true,
      };
    case BatteryEvidenceStrengthTier.PROXY:
      return {
        canAffectAssessment: true,
        canPublish: false,
        canAffectReadiness: false,
        canTriggerAlert: true,
        canCreateTask: false,
        neverHardBlock: true,
      };
    case BatteryEvidenceStrengthTier.LIVE_TELEMETRY:
      return {
        canAffectAssessment: false,
        canPublish: false,
        canAffectReadiness: false,
        canTriggerAlert: false,
        canCreateTask: false,
        neverHardBlock: true,
      };
    case BatteryEvidenceStrengthTier.UNKNOWN:
    default:
      return {
        canAffectAssessment: false,
        canPublish: false,
        canAffectReadiness: false,
        canTriggerAlert: false,
        canCreateTask: false,
        neverHardBlock: true,
      };
  }
}

export function getDiagnosticEvidenceCapabilities(
  kind: BatteryDiagnosticEvidenceKind,
): BatteryEvidenceCapabilities {
  switch (kind) {
    case BatteryDiagnosticEvidenceKind.WARNING_LIGHT_DTC:
      return {
        canAffectAssessment: false,
        canPublish: false,
        canAffectReadiness: false,
        canTriggerAlert: true,
        canCreateTask: true,
        neverHardBlock: true,
      };
    default:
      return getEvidenceCapabilities(BatteryEvidenceStrengthTier.UNKNOWN);
  }
}

function defaultFreshnessMaxAgeMs(tier: BatteryEvidenceStrengthTier): number {
  switch (tier) {
    case BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH:
      return BATTERY_FRESHNESS_THRESHOLDS_MS.providerSohObservation;
    case BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED:
    case BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED:
      return BATTERY_FRESHNESS_THRESHOLDS_MS.reportedSohObservation;
    case BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE:
    case BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL:
      return BATTERY_FRESHNESS_THRESHOLDS_MS.restMeasurementObservation;
    case BatteryEvidenceStrengthTier.ESTIMATED:
    case BatteryEvidenceStrengthTier.PROXY:
      return BATTERY_FRESHNESS_THRESHOLDS_MS.hvSessionObservation;
    case BatteryEvidenceStrengthTier.LIVE_TELEMETRY:
      return BATTERY_FRESHNESS_THRESHOLDS_MS.lvLiveObservation;
    default:
      return BATTERY_FRESHNESS_THRESHOLDS_MS.assessmentObservation;
  }
}

function isCandidateFresh(
  candidate: BatteryEvidenceConflictCandidate,
  now: Date,
): boolean {
  const maxAgeMs = candidate.freshnessMaxAgeMs ?? defaultFreshnessMaxAgeMs(candidate.tier);
  const freshness = buildObservationFreshness({
    observedAt: candidate.observedAt ?? null,
    maxAgeMs,
    now,
    hasValueCarrier: true,
  });
  return observationFreshnessIsDecisionFresh(freshness);
}

function effectiveTierScore(
  candidate: BatteryEvidenceConflictCandidate,
  now: Date,
): number {
  const base = tierRank(candidate.tier);
  if (!isCandidateFresh(candidate, now)) {
    return base - STALE_TIER_PENALTY;
  }
  return base;
}

function isWorkshopMeasurementType(type: BatteryMeasurementType): boolean {
  return WORKSHOP_TYPES.has(type);
}

function isStartProxyMeasurementType(type: BatteryMeasurementType): boolean {
  return (
    isCrankMeasurementType(type) ||
    type === BatteryMeasurementType.PRE_START_VOLTAGE ||
    type === BatteryMeasurementType.START_DIP_PROXY
  );
}

export function resolveLvMeasurementEvidenceTier(input: {
  type: BatteryMeasurementType;
  quality: BatteryMeasurementQuality;
  sourceType?: BatteryEvidenceSourceType | string | null;
  bmsVerified?: boolean;
}): BatteryEvidenceStrengthTier {
  if (input.bmsVerified || isWorkshopMeasurementType(input.type)) {
    return BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED;
  }

  if (
    input.sourceType === BatteryEvidenceSourceType.DOCUMENT_CONFIRMED ||
    input.sourceType === BatteryEvidenceSourceType.MANUAL_REPORT
  ) {
    return BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED;
  }

  if (isStartProxyMeasurementType(input.type)) {
    return BatteryEvidenceStrengthTier.PROXY;
  }

  if (
    (isRestMeasurementType(input.type) ||
      input.type === BatteryMeasurementType.REST_60M ||
      input.type === BatteryMeasurementType.REST_6H) &&
    input.quality === BatteryMeasurementQuality.VALID
  ) {
    return BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE;
  }

  if (input.quality === BatteryMeasurementQuality.VALID_PROXY) {
    return BatteryEvidenceStrengthTier.PROXY;
  }

  if (input.quality === BatteryMeasurementQuality.SHADOW) {
    return BatteryEvidenceStrengthTier.ESTIMATED;
  }

  if (input.type === BatteryMeasurementType.LIVE_VOLTAGE) {
    return BatteryEvidenceStrengthTier.LIVE_TELEMETRY;
  }

  return BatteryEvidenceStrengthTier.UNKNOWN;
}

export function resolveHvEvidenceSourceTier(input: {
  sourceType?: BatteryEvidenceSourceType | string | null;
  quality?: BatteryMeasurementQuality | string | null;
  bmsVerified?: boolean;
  providerReported?: boolean;
  shadow?: boolean;
  stableQualified?: boolean;
}): BatteryEvidenceStrengthTier {
  if (input.bmsVerified) {
    return BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED;
  }

  if (input.sourceType === BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT) {
    return BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED;
  }

  if (
    input.sourceType === BatteryEvidenceSourceType.DOCUMENT_CONFIRMED ||
    input.sourceType === BatteryEvidenceSourceType.MANUAL_REPORT
  ) {
    return BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED;
  }

  if (
    input.providerReported ||
    input.sourceType === BatteryEvidenceSourceType.PROVIDER_REPORTED
  ) {
    return BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH;
  }

  if (input.shadow || input.quality === BatteryMeasurementQuality.SHADOW) {
    return BatteryEvidenceStrengthTier.ESTIMATED;
  }

  if (input.stableQualified || input.quality === BatteryMeasurementQuality.VALID) {
    return BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE;
  }

  if (input.quality === BatteryMeasurementQuality.VALID_PROXY) {
    return BatteryEvidenceStrengthTier.PROXY;
  }

  if (input.sourceType === BatteryEvidenceSourceType.TELEMETRY_DERIVED) {
    return BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL;
  }

  if (input.sourceType === BatteryEvidenceSourceType.MODEL_DERIVED) {
    return BatteryEvidenceStrengthTier.ESTIMATED;
  }

  return BatteryEvidenceStrengthTier.UNKNOWN;
}

export function mapTierToLegacyEvidenceStrength(
  tier: BatteryEvidenceStrengthTier,
): BatteryEvidenceStrength {
  switch (tier) {
    case BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED:
    case BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED:
      return BatteryEvidenceStrength.OVERRIDE;
    case BatteryEvidenceStrengthTier.PROVIDER_OEM_SOH:
    case BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE:
      return BatteryEvidenceStrength.PRIMARY;
    case BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL:
    case BatteryEvidenceStrengthTier.ESTIMATED:
      return BatteryEvidenceStrength.SUPPLEMENTARY;
    case BatteryEvidenceStrengthTier.PROXY:
    case BatteryEvidenceStrengthTier.LIVE_TELEMETRY:
      return BatteryEvidenceStrength.DIAGNOSTIC;
    case BatteryEvidenceStrengthTier.UNKNOWN:
    default:
      return BatteryEvidenceStrength.NONE;
  }
}

export function mapLegacyEvidenceStrengthToTier(
  strength: BatteryEvidenceStrength,
): BatteryEvidenceStrengthTier {
  switch (strength) {
    case BatteryEvidenceStrength.OVERRIDE:
      return BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED;
    case BatteryEvidenceStrength.PRIMARY:
      return BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE;
    case BatteryEvidenceStrength.SUPPLEMENTARY:
      return BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_PROVISIONAL;
    case BatteryEvidenceStrength.DIAGNOSTIC:
      return BatteryEvidenceStrengthTier.PROXY;
    case BatteryEvidenceStrength.NONE:
    default:
      return BatteryEvidenceStrengthTier.UNKNOWN;
  }
}

/**
 * Resolve competing evidence within a scope. Higher tier does not win blindly:
 * freshness and scope are applied; workshop/document losers remain supplementary
 * for traceability. Proxy/shadow never hard-block.
 */
export function resolveEvidenceConflict(input: {
  candidates: BatteryEvidenceConflictCandidate[];
  scope: BatteryMeasurementScope;
  now?: Date;
}): BatteryEvidenceConflictResolution {
  const now = input.now ?? new Date();
  const diagnostics = input.candidates.filter(
    (row) => row.diagnosticKind != null,
  );
  const measurable = input.candidates.filter((row) => row.diagnosticKind == null);

  const inScope = measurable.filter((row) => row.scope === input.scope);
  const outOfScope = measurable.filter((row) => row.scope !== input.scope);

  if (inScope.length === 0) {
    return {
      policyVersion: BATTERY_EVIDENCE_STRENGTH_POLICY_VERSION,
      winner: null,
      supplementary: [],
      outOfScope,
      diagnostics,
      resolutionReason: 'NO_IN_SCOPE_CANDIDATES',
    };
  }

  const ranked = [...inScope].sort(
    (a, b) => effectiveTierScore(b, now) - effectiveTierScore(a, now),
  );
  const winner = ranked[0] ?? null;

  const supplementary = ranked.slice(1).filter((row) => {
    const caps = getEvidenceCapabilities(row.tier);
    if (caps.neverHardBlock) {
      return true;
    }
    return (
      row.tier === BatteryEvidenceStrengthTier.WORKSHOP_OR_BMS_VERIFIED ||
      row.tier === BatteryEvidenceStrengthTier.DOCUMENT_VERIFIED ||
      tierRank(row.tier) >= tierRank(BatteryEvidenceStrengthTier.QUALIFIED_TELEMETRY_STABLE)
    );
  });

  let resolutionReason = 'HIGHEST_EFFECTIVE_TIER';
  if (winner && !isCandidateFresh(winner, now)) {
    const freshCompetitor = ranked.find(
      (row, index) => index > 0 && isCandidateFresh(row, now),
    );
    if (freshCompetitor && effectiveTierScore(freshCompetitor, now) >= effectiveTierScore(winner, now)) {
      resolutionReason = 'FRESHNESS_OVERRIDES_STALE_HIGHER_TIER';
    }
  }

  return {
    policyVersion: BATTERY_EVIDENCE_STRENGTH_POLICY_VERSION,
    winner,
    supplementary,
    outOfScope,
    diagnostics,
    resolutionReason,
  };
}

export function resolveHvSohEvidenceConflict(input: {
  providerSoh?: BatteryEvidenceConflictCandidate | null;
  reportedSoh?: BatteryEvidenceConflictCandidate | null;
  capacityEstimate?: BatteryEvidenceConflictCandidate | null;
  now?: Date;
}): BatteryEvidenceConflictResolution & {
  publishedValueCandidateId: string | null;
} {
  const candidates = [
    input.providerSoh,
    input.reportedSoh,
    input.capacityEstimate,
  ].filter((row): row is BatteryEvidenceConflictCandidate => row != null);

  const resolution = resolveEvidenceConflict({
    candidates,
    scope: BatteryEvidenceScope.HV,
    now: input.now,
  });

  const publishedWinner =
    resolution.winner &&
    getEvidenceCapabilities(resolution.winner.tier).canPublish
      ? resolution.winner
      : null;

  return {
    ...resolution,
    publishedValueCandidateId: publishedWinner?.id ?? null,
  };
}
