import {
  StationBookingRuleOutcome,
  type StationBookingRuleEvaluation,
  type StationBookingRulesSideResult,
} from './station-booking-rules.contract';
import {
  HandoverStationRulesKind,
  type HandoverStationRulesResult,
} from './handover-station-rules.contract';
import {
  StationRuleManualOverrideReferenceType,
  type StationRuleManualOverrideAuditRecord,
  type StationRuleManualOverrideInput,
  type StationRuleManualOverrideReference,
  type StationRuleManualOverrideScope,
} from './station-rule-manual-override.contract';
import {
  applyStationRuleManualOverrideToEvaluations,
  validateStationRuleManualOverrideRequest,
} from './station-rule-manual-override.policy';

function rebuildSideAfterOverride(
  side: StationBookingRulesSideResult,
  evaluations: StationBookingRuleEvaluation[],
): StationBookingRulesSideResult {
  const outcome = evaluations.reduce((current, evaluation) => {
    const severity: Record<StationBookingRuleOutcome, number> = {
      [StationBookingRuleOutcome.ALLOWED]: 0,
      [StationBookingRuleOutcome.WARNING]: 1,
      [StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED]: 2,
      [StationBookingRuleOutcome.BLOCKED]: 3,
    };
    const next = evaluation.outcome as StationBookingRuleOutcome;
    return severity[next] > severity[current] ? next : current;
  }, StationBookingRuleOutcome.ALLOWED);

  return {
    ...side,
    outcome,
    evaluations,
    reasons:
      outcome === StationBookingRuleOutcome.ALLOWED
        ? evaluations
            .filter((evaluation) => evaluation.reason.code === 'STATION_RULE_MANUAL_OVERRIDE_APPLIED')
            .map((evaluation) => evaluation.reason)
        : evaluations
            .filter((evaluation) => evaluation.outcome !== StationBookingRuleOutcome.ALLOWED)
            .map((evaluation) => evaluation.reason),
    manualOverrideApplied: true,
    adminOverrideApplied: true,
  };
}

export function buildHandoverManualOverrideScope(input: {
  organizationId: string;
  kind: HandoverStationRulesKind;
  actualStationId: string;
  plannedStationId?: string | null;
  vehicleId: string;
  evaluatedAt: string | Date;
}): StationRuleManualOverrideScope {
  const evaluatedAt =
    input.evaluatedAt instanceof Date
      ? input.evaluatedAt.toISOString()
      : input.evaluatedAt;

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    handoverKind: input.kind,
    actualStationId: input.actualStationId,
    handoverEvaluatedAt: evaluatedAt,
    pickupStationId: input.kind === HandoverStationRulesKind.PICKUP ? input.actualStationId : null,
    returnStationId: input.kind === HandoverStationRulesKind.RETURN ? input.actualStationId : null,
    pickupDateTime: input.kind === HandoverStationRulesKind.PICKUP ? evaluatedAt : null,
    returnDateTime: input.kind === HandoverStationRulesKind.RETURN ? evaluatedAt : null,
  };
}

export function buildHandoverOverrideReference(input: {
  kind: HandoverStationRulesKind;
  bookingId: string;
}): StationRuleManualOverrideReference {
  return {
    type:
      input.kind === HandoverStationRulesKind.PICKUP
        ? StationRuleManualOverrideReferenceType.HANDOVER_PICKUP
        : StationRuleManualOverrideReferenceType.HANDOVER_RETURN,
    bookingId: input.bookingId,
  };
}

export function resolveHandoverOverrideReferenceType(
  kind: HandoverStationRulesKind,
): StationRuleManualOverrideReferenceType {
  return kind === HandoverStationRulesKind.PICKUP
    ? StationRuleManualOverrideReferenceType.HANDOVER_PICKUP
    : StationRuleManualOverrideReferenceType.HANDOVER_RETURN;
}

export function assessHandoverStationRulesManualOverride(input: {
  kind: HandoverStationRulesKind;
  actualStationId: string;
  plannedStationId: string | null;
  side: StationBookingRulesSideResult;
  manualOverride?: StationRuleManualOverrideInput | null;
  actorUserId?: string | null;
  scope: StationRuleManualOverrideScope;
  evaluatedAt: string;
}): {
  manualOverrideRequired: boolean;
  manualOverrideApplied: boolean;
  result: HandoverStationRulesResult;
  validation: ReturnType<typeof validateStationRuleManualOverrideRequest>;
} {
  const validation = validateStationRuleManualOverrideRequest({
    manualOverride: input.manualOverride,
    actor: input.actorUserId
      ? {
          userId: input.actorUserId,
          permission: 'stations.override_rules',
        }
      : null,
    scope: input.scope,
    evaluations: input.side.evaluations,
  });

  const manualOverrideRequired = validation.issues.some(
    (issue) => issue.code === 'STATION_RULE_MANUAL_OVERRIDE_REQUIRED',
  );

  const base: HandoverStationRulesResult = {
    version: 1,
    evaluatedAt: input.evaluatedAt,
    kind: input.kind,
    actualStationId: input.actualStationId,
    plannedStationId: input.plannedStationId,
    outcome: input.side.outcome,
    reasons: input.side.reasons,
    evaluations: input.side.evaluations,
    evaluatedInstant: input.side.evaluatedInstant,
    manualOverrideRequired,
    manualOverrideApplied: false,
    manualOverrideAudit: null,
    replacesBookingTimeEvaluation: true,
  };

  if (!input.manualOverride || !validation.valid || !validation.reason) {
    return {
      manualOverrideRequired,
      manualOverrideApplied: false,
      validation,
      result: base,
    };
  }

  const evaluations = applyStationRuleManualOverrideToEvaluations(
    input.side.evaluations,
    validation.reason,
  );
  const overriddenSide = rebuildSideAfterOverride(input.side, evaluations);

  return {
    manualOverrideRequired: false,
    manualOverrideApplied: true,
    validation,
    result: {
      ...base,
      outcome: overriddenSide.outcome,
      reasons: overriddenSide.reasons,
      evaluations: overriddenSide.evaluations,
      manualOverrideRequired: false,
      manualOverrideApplied: true,
      manualOverrideAudit: null,
    },
  };
}

export function attachHandoverManualOverrideAudit(
  result: HandoverStationRulesResult,
  audit: StationRuleManualOverrideAuditRecord,
): HandoverStationRulesResult {
  return {
    ...result,
    manualOverrideAudit: audit,
  };
}
