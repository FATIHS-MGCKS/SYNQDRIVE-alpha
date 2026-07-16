/**
 * Pure misuse case lifecycle transitions (P47).
 * Telemetry never confirms cases or enables irreversible customer charging.
 */
import {
  DrivingAttributionConfidence,
  MisuseAttributionScope,
  MisuseCaseDecisionEligibility,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
  TripAssignmentStatus,
} from '@prisma/client';
import {
  MANUAL_ONLY_STATUSES,
} from './misuse-case-lifecycle.config';
import type {
  LifecycleTransitionResult,
  ManualTransitionInput,
  TelemetryLifecycleInput,
} from './misuse-case-lifecycle.types';
import {
  EVIDENCE_LEVEL_RANK,
  requiresHumanReviewForLevel,
  type TripEvidenceLevel,
} from '../../trips/trip-evidence-level.types';

const HIGH_VALUE_PROVIDER_TYPES = new Set<MisuseCaseType>([
  MisuseCaseType.DIMO_COLLISION_REPORTED,
]);

const MANUAL_EVIDENCE_SOURCES = new Set<MisuseEvidenceSourceType>([
  MisuseEvidenceSourceType.MANUAL_VERIFICATION,
]);

const PROVIDER_COLLISION_SOURCES = new Set<MisuseEvidenceSourceType>([
  MisuseEvidenceSourceType.DIMO_EVENT,
  MisuseEvidenceSourceType.DRIVING_EVENT,
]);

export function resolveAttributionConfidence(input: {
  attributionScope: MisuseAttributionScope;
  assignmentStatus: TripAssignmentStatus | null;
  isPrivateTrip: boolean;
}): DrivingAttributionConfidence {
  if (input.isPrivateTrip || input.attributionScope === MisuseAttributionScope.PRIVATE_UNASSIGNED) {
    return DrivingAttributionConfidence.LOW;
  }
  if (input.attributionScope === MisuseAttributionScope.BOOKING_CUSTOMER) {
    return input.assignmentStatus === TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER
      ? DrivingAttributionConfidence.HIGH
      : DrivingAttributionConfidence.MEDIUM;
  }
  if (input.attributionScope === MisuseAttributionScope.ASSIGNED_DRIVER) {
    return DrivingAttributionConfidence.MEDIUM;
  }
  if (input.attributionScope === MisuseAttributionScope.VEHICLE_ONLY) {
    return DrivingAttributionConfidence.MEDIUM;
  }
  return DrivingAttributionConfidence.LOW;
}

function deriveTelemetryStatus(evidenceLevel: TripEvidenceLevel): MisuseCaseStatus {
  if (evidenceLevel === 'NONE') {
    return MisuseCaseStatus.NOT_ASSESSABLE;
  }
  if (requiresHumanReviewForLevel(evidenceLevel)) {
    return MisuseCaseStatus.REVIEW_REQUIRED;
  }
  return MisuseCaseStatus.CANDIDATE;
}

function deriveDecisionEligibility(
  status: MisuseCaseStatus,
  evidenceLevel: TripEvidenceLevel,
): MisuseCaseDecisionEligibility {
  switch (status) {
    case MisuseCaseStatus.CONFIRMED:
      return MisuseCaseDecisionEligibility.OPERATIONAL_ELIGIBLE;
    case MisuseCaseStatus.DISMISSED:
    case MisuseCaseStatus.RESOLVED:
    case MisuseCaseStatus.SUPERSEDED:
    case MisuseCaseStatus.NOT_ASSESSABLE:
      return MisuseCaseDecisionEligibility.NOT_ELIGIBLE;
    case MisuseCaseStatus.REVIEW_REQUIRED:
      return MisuseCaseDecisionEligibility.REVIEW_ONLY;
    case MisuseCaseStatus.ACTIVE:
    case MisuseCaseStatus.CANDIDATE:
      if (EVIDENCE_LEVEL_RANK[evidenceLevel] >= EVIDENCE_LEVEL_RANK.MISUSE_SUSPECTED) {
        return MisuseCaseDecisionEligibility.MANUAL_CONFIRMATION_ONLY;
      }
      return MisuseCaseDecisionEligibility.INFORMATIONAL_ONLY;
    default:
      return MisuseCaseDecisionEligibility.INFORMATIONAL_ONLY;
  }
}

function isManualLockedStatus(status: MisuseCaseStatus): boolean {
  return MANUAL_ONLY_STATUSES.has(status as (typeof MANUAL_ONLY_STATUSES extends Set<infer T> ? T : never));
}

export function hasHigherValueEvidenceForConfirmation(input: {
  caseType: MisuseCaseType;
  evidenceLevel: TripEvidenceLevel;
  evidenceSources: MisuseEvidenceSourceType[];
}): boolean {
  if (input.evidenceSources.some((s) => MANUAL_EVIDENCE_SOURCES.has(s))) {
    return true;
  }
  if (
    HIGH_VALUE_PROVIDER_TYPES.has(input.caseType) &&
    input.evidenceSources.some((s) => PROVIDER_COLLISION_SOURCES.has(s))
  ) {
    return true;
  }
  return EVIDENCE_LEVEL_RANK[input.evidenceLevel] >= EVIDENCE_LEVEL_RANK.CRITICAL_DAMAGE_RISK;
}

export function canConfirmMisuseCase(input: {
  caseType: MisuseCaseType;
  evidenceLevel: TripEvidenceLevel;
  evidenceSources: MisuseEvidenceSourceType[];
  status: MisuseCaseStatus;
}): boolean {
  if (
    input.status === MisuseCaseStatus.DISMISSED ||
    input.status === MisuseCaseStatus.RESOLVED ||
    input.status === MisuseCaseStatus.SUPERSEDED ||
    input.status === MisuseCaseStatus.NOT_ASSESSABLE ||
    input.status === MisuseCaseStatus.CONFIRMED
  ) {
    return false;
  }
  return hasHigherValueEvidenceForConfirmation(input);
}

function baseTelemetryResult(
  input: TelemetryLifecycleInput,
  status: MisuseCaseStatus,
): LifecycleTransitionResult {
  const attributionConfidence = resolveAttributionConfidence({
    attributionScope: input.attributionScope,
    assignmentStatus: input.assignmentStatus,
    isPrivateTrip: input.isPrivateTrip,
  });
  const decisionEligibility = deriveDecisionEligibility(status, input.evidenceLevel);

  return {
    status,
    decisionEligibility,
    informationalOnly: decisionEligibility !== MisuseCaseDecisionEligibility.OPERATIONAL_ELIGIBLE,
    attributionConfidence,
    resolvedAt: null,
    resolutionReason: null,
  };
}

/**
 * Derive lifecycle fields for telemetry-driven upsert.
 * Preserves manual terminal decisions; never auto-confirms.
 */
export function applyTelemetryLifecycle(input: TelemetryLifecycleInput): LifecycleTransitionResult {
  const nextStatus = deriveTelemetryStatus(input.evidenceLevel);
  const attributionConfidence = resolveAttributionConfidence({
    attributionScope: input.attributionScope,
    assignmentStatus: input.assignmentStatus,
    isPrivateTrip: input.isPrivateTrip,
  });

  if (!input.existing) {
    return baseTelemetryResult(input, nextStatus);
  }

  const existing = input.existing;

  if (isManualLockedStatus(existing.status)) {
    return {
      status: existing.status,
      decisionEligibility: existing.decisionEligibility,
      informationalOnly: existing.informationalOnly,
      attributionConfidence,
      resolvedAt: existing.resolvedAt,
      resolutionReason: existing.resolutionReason,
    };
  }

  if (existing.status === MisuseCaseStatus.SUPERSEDED) {
    return {
      status: MisuseCaseStatus.SUPERSEDED,
      decisionEligibility: MisuseCaseDecisionEligibility.NOT_ELIGIBLE,
      informationalOnly: true,
      attributionConfidence,
      resolvedAt: existing.resolvedAt,
      resolutionReason: existing.resolutionReason,
    };
  }

  const fingerprintChanged =
    existing.inputFingerprint !== input.inputFingerprint ||
    existing.modelVersion !== input.modelVersion;

  let status = nextStatus;
  if (
    fingerprintChanged &&
    existing.status !== MisuseCaseStatus.NOT_ASSESSABLE &&
    nextStatus !== MisuseCaseStatus.NOT_ASSESSABLE
  ) {
    status =
      nextStatus === MisuseCaseStatus.REVIEW_REQUIRED
        ? MisuseCaseStatus.REVIEW_REQUIRED
        : MisuseCaseStatus.CANDIDATE;
  } else if (
    input.evidenceCount > existing.evidenceCount &&
    nextStatus !== MisuseCaseStatus.NOT_ASSESSABLE
  ) {
    status =
      nextStatus === MisuseCaseStatus.REVIEW_REQUIRED
        ? MisuseCaseStatus.REVIEW_REQUIRED
        : MisuseCaseStatus.ACTIVE;
  } else if (existing.status === MisuseCaseStatus.ACTIVE && nextStatus === MisuseCaseStatus.CANDIDATE) {
    status = MisuseCaseStatus.ACTIVE;
  }

  const decisionEligibility = deriveDecisionEligibility(status, input.evidenceLevel);

  return {
    status,
    decisionEligibility,
    informationalOnly: decisionEligibility !== MisuseCaseDecisionEligibility.OPERATIONAL_ELIGIBLE,
    attributionConfidence,
    resolvedAt: null,
    resolutionReason: null,
  };
}

export function applyManualLifecycleTransition(
  input: ManualTransitionInput,
): LifecycleTransitionResult {
  const now = new Date();
  const attributionConfidence = input.existing.attributionConfidence;

  switch (input.action) {
    case 'CONFIRM': {
      if (
        !canConfirmMisuseCase({
          caseType: input.caseType,
          evidenceLevel: input.evidenceLevel,
          evidenceSources: input.evidenceSources,
          status: input.existing.status,
        })
      ) {
        throw new Error(
          'CONFIRMED requires manual verification or higher-value provider evidence',
        );
      }
      return {
        status: MisuseCaseStatus.CONFIRMED,
        decisionEligibility: MisuseCaseDecisionEligibility.OPERATIONAL_ELIGIBLE,
        informationalOnly: false,
        attributionConfidence,
        resolvedAt: null,
        resolutionReason: input.operatorNote ?? input.resolutionReason ?? 'Manuell bestätigt',
      };
    }
    case 'DISMISS':
      return {
        status: MisuseCaseStatus.DISMISSED,
        decisionEligibility: MisuseCaseDecisionEligibility.NOT_ELIGIBLE,
        informationalOnly: true,
        attributionConfidence,
        resolvedAt: now,
        resolutionReason: input.resolutionReason ?? 'Manuell verworfen',
      };
    case 'RESOLVE':
      return {
        status: MisuseCaseStatus.RESOLVED,
        decisionEligibility: MisuseCaseDecisionEligibility.NOT_ELIGIBLE,
        informationalOnly: true,
        attributionConfidence,
        resolvedAt: now,
        resolutionReason: input.resolutionReason ?? 'Erledigt',
      };
    case 'DOWNGRADE':
      return {
        status: MisuseCaseStatus.REVIEW_REQUIRED,
        decisionEligibility: MisuseCaseDecisionEligibility.REVIEW_ONLY,
        informationalOnly: true,
        attributionConfidence,
        resolvedAt: null,
        resolutionReason: input.resolutionReason ?? 'Herabgestuft — erneute Prüfung',
      };
    case 'SUPERSEDE':
      return {
        status: MisuseCaseStatus.SUPERSEDED,
        decisionEligibility: MisuseCaseDecisionEligibility.NOT_ELIGIBLE,
        informationalOnly: true,
        attributionConfidence,
        resolvedAt: now,
        resolutionReason: input.resolutionReason ?? 'Durch neuere Analyse ersetzt',
      };
    default:
      throw new Error(`Unknown manual transition: ${input.action satisfies never}`);
  }
}
