import {
  StationBookingRuleOutcome,
  type StationBookingRuleEvaluation,
  type StationBookingRulesResult,
  type StationBookingRulesSideResult,
} from './station-booking-rules.contract';
import {
  StationRuleManualOverrideReferenceType,
  type StationRuleManualOverrideAuditRecord,
  type StationRuleManualOverrideInput,
  type StationRuleManualOverrideReference,
  type StationRuleManualOverrideScope,
} from './station-rule-manual-override.contract';
import {
  applyStationRuleManualOverrideToEvaluations,
  buildBookingRulesManualOverrideScope,
  validateStationRuleManualOverrideRequest,
} from './station-rule-manual-override.policy';

const OUTCOME_SEVERITY: Record<StationBookingRuleOutcome, number> = {
  [StationBookingRuleOutcome.ALLOWED]: 0,
  [StationBookingRuleOutcome.WARNING]: 1,
  [StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED]: 2,
  [StationBookingRuleOutcome.BLOCKED]: 3,
};

function aggregateOutcome(evaluations: StationBookingRuleEvaluation[]): StationBookingRuleOutcome {
  return evaluations.reduce((outcome, evaluation) => {
    const next = evaluation.outcome as StationBookingRuleOutcome;
    return OUTCOME_SEVERITY[next] > OUTCOME_SEVERITY[outcome] ? next : outcome;
  }, StationBookingRuleOutcome.ALLOWED);
}

function rebuildSideResult(side: StationBookingRulesSideResult): StationBookingRulesSideResult {
  const outcome = aggregateOutcome(side.evaluations);
  return {
    ...side,
    outcome,
    reasons:
      outcome === StationBookingRuleOutcome.ALLOWED
        ? side.manualOverrideApplied
          ? side.evaluations
              .filter((evaluation) => evaluation.reason.code === 'STATION_RULE_MANUAL_OVERRIDE_APPLIED')
              .map((evaluation) => evaluation.reason)
          : []
        : side.evaluations
            .filter((evaluation) => evaluation.outcome !== StationBookingRuleOutcome.ALLOWED)
            .map((evaluation) => evaluation.reason),
    manualOverrideApplied: side.manualOverrideApplied,
    adminOverrideApplied: side.manualOverrideApplied,
  };
}

export function buildBookingRulesEvaluationScope(input: {
  organizationId: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  pickupDateTime: string | Date;
  returnDateTime: string | Date;
  bookingType: string;
  vehicleId?: string | null;
}): StationRuleManualOverrideScope {
  return buildBookingRulesManualOverrideScope(input);
}

export function assessBookingRulesManualOverride(input: {
  result: StationBookingRulesResult;
  manualOverride?: StationRuleManualOverrideInput | null;
  actorUserId?: string | null;
  scope: StationRuleManualOverrideScope;
  reference?: StationRuleManualOverrideReference;
  grantedAt?: Date;
}): {
  manualOverrideRequired: boolean;
  manualOverrideApplied: boolean;
  validation: ReturnType<typeof validateStationRuleManualOverrideRequest>;
  result: StationBookingRulesResult;
} {
  const evaluations = [...input.result.pickup.evaluations, ...input.result.return.evaluations];
  const validation = validateStationRuleManualOverrideRequest({
    manualOverride: input.manualOverride,
    actor: input.actorUserId
      ? {
          userId: input.actorUserId,
          permission: 'stations.override_rules',
        }
      : null,
    scope: input.scope,
    evaluations,
    grantedAt: input.grantedAt,
  });

  const manualOverrideRequired = validation.issues.some(
    (issue) => issue.code === 'STATION_RULE_MANUAL_OVERRIDE_REQUIRED',
  );

  if (!input.manualOverride || !validation.valid || !validation.reason) {
    return {
      manualOverrideRequired,
      manualOverrideApplied: false,
      validation,
      result: {
        ...input.result,
        manualOverrideRequired,
        manualOverrideApplied: false,
        manualOverrideAudit: null,
      },
    };
  }

  const pickupEvaluations = applyStationRuleManualOverrideToEvaluations(
    input.result.pickup.evaluations,
    validation.reason,
  );
  const returnEvaluations = applyStationRuleManualOverrideToEvaluations(
    input.result.return.evaluations,
    validation.reason,
  );

  const result: StationBookingRulesResult = {
    ...input.result,
    manualOverrideRequired: false,
    manualOverrideApplied: true,
    manualOverrideAudit: null,
    pickup: rebuildSideResult({
      ...input.result.pickup,
      evaluations: pickupEvaluations,
      manualOverrideApplied: true,
    }),
    return: rebuildSideResult({
      ...input.result.return,
      evaluations: returnEvaluations,
      manualOverrideApplied: true,
    }),
  };

  return {
    manualOverrideRequired: false,
    manualOverrideApplied: true,
    validation,
    result,
  };
}

export function attachBookingRulesManualOverrideAudit(
  result: StationBookingRulesResult,
  audit: StationRuleManualOverrideAuditRecord,
): StationBookingRulesResult {
  return {
    ...result,
    manualOverrideAudit: audit,
  };
}

export function buildBookingRulesOverrideReference(input: {
  bookingId?: string | null;
}): StationRuleManualOverrideReference {
  return {
    type: StationRuleManualOverrideReferenceType.BOOKING_RULES,
    bookingId: input.bookingId ?? null,
  };
}
