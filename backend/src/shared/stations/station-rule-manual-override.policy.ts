import { createHash } from 'crypto';
import { StationBookingRuleOutcome } from './station-booking-rules.contract';
import {
  STATION_RULE_MANUAL_OVERRIDE_DEFAULT_TTL_MS,
  STATION_RULE_MANUAL_OVERRIDE_MAX_TTL_MS,
  STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH,
  STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
  StationRuleManualOverrideReasonCode,
  type StationRuleManualOverrideActor,
  type StationRuleManualOverrideInput,
  type StationRuleManualOverrideReference,
  type StationRuleManualOverrideRuleResultSnapshot,
  type StationRuleManualOverrideScope,
} from './station-rule-manual-override.contract';

export interface StationRuleManualOverrideEvaluationLike {
  ruleId?: string;
  outcome: StationBookingRuleOutcome | string;
  reason?: { code?: string; message: string };
  field?: string;
  stationId?: string | null;
}

export interface StationRuleManualOverrideIssue {
  code: StationRuleManualOverrideReasonCode | string;
  message: string;
}

const HARD_BLOCK_OUTCOMES = new Set<string>([StationBookingRuleOutcome.BLOCKED]);

export function isOverridableStationRuleOutcome(
  outcome: StationBookingRuleOutcome | string,
): boolean {
  return (
    outcome === StationBookingRuleOutcome.WARNING ||
    outcome === StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED
  );
}

export function snapshotStationRuleResults(
  evaluations: StationRuleManualOverrideEvaluationLike[],
): StationRuleManualOverrideRuleResultSnapshot[] {
  return evaluations.map((evaluation) => ({
    ruleId: evaluation.ruleId,
    outcome: evaluation.outcome,
    code: evaluation.reason?.code,
    message: evaluation.reason?.message ?? 'Station rule evaluation',
    field: evaluation.field,
    stationId: evaluation.stationId ?? null,
  }));
}

export function buildStationRuleManualOverrideScopeFingerprint(
  scope: StationRuleManualOverrideScope,
): string {
  const payload = {
    organizationId: scope.organizationId,
    pickupStationId: scope.pickupStationId ?? null,
    returnStationId: scope.returnStationId ?? null,
    pickupDateTime: normalizeInstant(scope.pickupDateTime),
    returnDateTime: normalizeInstant(scope.returnDateTime),
    bookingType: scope.bookingType ?? null,
    vehicleId: scope.vehicleId ?? null,
    transferVehicleId: scope.transferVehicleId ?? null,
    transferFromStationId: scope.transferFromStationId ?? null,
    transferToStationId: scope.transferToStationId ?? null,
    plannedAt: normalizeInstant(scope.plannedAt),
    expectedArrivalAt: normalizeInstant(scope.expectedArrivalAt),
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeInstant(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function resolveStationRuleManualOverrideExpiry(
  input: StationRuleManualOverrideInput,
  grantedAt: Date,
): Date {
  if (input.expiresAt) {
    const expiresAt =
      input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
    return expiresAt;
  }
  return new Date(grantedAt.getTime() + STATION_RULE_MANUAL_OVERRIDE_DEFAULT_TTL_MS);
}

export function validateStationRuleManualOverrideRequest(input: {
  manualOverride?: StationRuleManualOverrideInput | null;
  actor?: StationRuleManualOverrideActor | null;
  scope: StationRuleManualOverrideScope;
  expectedScopeFingerprint?: string | null;
  evaluations: StationRuleManualOverrideEvaluationLike[];
  grantedAt?: Date;
}): {
  valid: boolean;
  issues: StationRuleManualOverrideIssue[];
  reason?: string;
  expiresAt?: Date;
  scopeFingerprint?: string;
  originalRuleResults?: StationRuleManualOverrideRuleResultSnapshot[];
} {
  const issues: StationRuleManualOverrideIssue[] = [];
  const scopeFingerprint = buildStationRuleManualOverrideScopeFingerprint(input.scope);

  if (input.expectedScopeFingerprint && input.expectedScopeFingerprint !== scopeFingerprint) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_SCOPE_MISMATCH,
      message: 'Manual override scope no longer matches the evaluated stations or times.',
    });
    return { valid: false, issues, scopeFingerprint };
  }

  if (!input.manualOverride) {
    const needsOverride = input.evaluations.some((evaluation) =>
      isOverridableStationRuleOutcome(evaluation.outcome),
    );
    if (needsOverride) {
      issues.push({
        code: StationRuleManualOverrideReasonCode.OVERRIDE_REQUIRED,
        message: 'Manual override with reason is required for warning or confirmation outcomes.',
      });
    }
    return { valid: !needsOverride, issues, scopeFingerprint };
  }

  if (!input.actor?.userId) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_PERMISSION_DENIED,
      message: 'Authenticated actor is required for manual override.',
    });
    return { valid: false, issues, scopeFingerprint };
  }

  if (input.actor.permission !== STATION_RULE_MANUAL_OVERRIDE_PERMISSION) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_PERMISSION_DENIED,
      message: `Missing permission ${STATION_RULE_MANUAL_OVERRIDE_PERMISSION}.`,
    });
    return { valid: false, issues, scopeFingerprint };
  }

  const reason = input.manualOverride.reason?.trim() ?? '';
  if (reason.length < STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_INVALID_REASON,
      message: `Override reason must be at least ${STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH} characters.`,
    });
    return { valid: false, issues, scopeFingerprint };
  }

  const grantedAt = input.grantedAt ?? new Date();
  const expiresAt = resolveStationRuleManualOverrideExpiry(input.manualOverride, grantedAt);
  if (expiresAt.getTime() <= grantedAt.getTime()) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_INVALID_EXPIRY,
      message: 'Override expiry must be in the future.',
    });
    return { valid: false, issues, scopeFingerprint };
  }
  if (expiresAt.getTime() - grantedAt.getTime() > STATION_RULE_MANUAL_OVERRIDE_MAX_TTL_MS) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_INVALID_EXPIRY,
      message: 'Override expiry exceeds the configured maximum validity window.',
    });
    return { valid: false, issues, scopeFingerprint };
  }

  const blocked = input.evaluations.filter((evaluation) =>
    HARD_BLOCK_OUTCOMES.has(String(evaluation.outcome)),
  );
  if (blocked.length > 0) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_BLOCKED_OUTCOME,
      message: 'Blocked station rule outcomes cannot be overridden.',
    });
    return { valid: false, issues, scopeFingerprint };
  }

  const overridable = input.evaluations.filter((evaluation) =>
    isOverridableStationRuleOutcome(evaluation.outcome),
  );
  if (overridable.length === 0) {
    issues.push({
      code: StationRuleManualOverrideReasonCode.OVERRIDE_NOT_REQUESTED,
      message: 'No warning or manual-confirmation outcomes are present to override.',
    });
    return { valid: false, issues, scopeFingerprint };
  }

  return {
    valid: true,
    issues,
    reason,
    expiresAt,
    scopeFingerprint,
    originalRuleResults: snapshotStationRuleResults(overridable),
  };
}

export function applyStationRuleManualOverrideToEvaluations<
  T extends StationRuleManualOverrideEvaluationLike,
>(evaluations: T[], reason: string): T[] {
  const overridden = evaluations.map((evaluation) => {
    if (!isOverridableStationRuleOutcome(evaluation.outcome)) {
      return evaluation;
    }
    return {
      ...evaluation,
      outcome: StationBookingRuleOutcome.ALLOWED,
      reason: {
        code: StationRuleManualOverrideReasonCode.OVERRIDE_APPLIED,
        message: reason,
      },
    };
  });

  return overridden;
}

export function buildBookingRulesManualOverrideScope(input: {
  organizationId: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  pickupDateTime?: string | Date | null;
  returnDateTime?: string | Date | null;
  bookingType?: string | null;
  vehicleId?: string | null;
}): StationRuleManualOverrideScope {
  return {
    organizationId: input.organizationId,
    pickupStationId: input.pickupStationId ?? null,
    returnStationId: input.returnStationId ?? null,
    pickupDateTime: normalizeInstant(input.pickupDateTime),
    returnDateTime: normalizeInstant(input.returnDateTime),
    bookingType: input.bookingType ?? null,
    vehicleId: input.vehicleId ?? null,
  };
}

export function buildTransferPlanManualOverrideScope(input: {
  organizationId: string;
  vehicleId: string;
  fromStationId?: string | null;
  toStationId: string;
  plannedAt?: string | Date | null;
  expectedArrivalAt?: string | Date | null;
}): StationRuleManualOverrideScope {
  return {
    organizationId: input.organizationId,
    transferVehicleId: input.vehicleId,
    transferFromStationId: input.fromStationId ?? null,
    transferToStationId: input.toStationId,
    plannedAt: normalizeInstant(input.plannedAt),
    expectedArrivalAt: normalizeInstant(input.expectedArrivalAt),
  };
}

export function mapTransferWarningsToOverrideEvaluations(
  warnings: Array<{ code: string; message: string }>,
): StationRuleManualOverrideEvaluationLike[] {
  return warnings.map((warning) => ({
    ruleId: warning.code,
    outcome:
      warning.code.includes('MANUAL_CONFIRMATION') ||
      warning.code.includes('CAPACITY_MANUAL')
        ? StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED
        : StationBookingRuleOutcome.WARNING,
    reason: { code: warning.code, message: warning.message },
    field: 'transfer',
  }));
}

export function buildManualOverrideReference(
  reference: StationRuleManualOverrideReference,
): StationRuleManualOverrideReference {
  return reference;
}
