import type {
  VsiApdsReadonlyCapabilityObservationV1,
  VsiApdsShadowDecisionSnapshotV1,
} from './vsi-apds-p5.types';
import type { VsiApdsPersistedShadowDecisionV1 } from './vsi-apds-shadow-opportunity-binding';
import { parseApdsShadowDecisionAtMs } from './vsi-apds-shadow-opportunity-binding';

export function validateVsiApdsCorrelationDecisionObservationPair(input: {
  decision: VsiApdsShadowDecisionSnapshotV1;
  observation: VsiApdsReadonlyCapabilityObservationV1;
  authoritativePersistedDecision: VsiApdsPersistedShadowDecisionV1 | null;
}): { consistent: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { decision, observation } = input;

  if (decision.organizationId !== observation.organizationId) {
    reasons.push('CORRELATION_ORGANIZATION_ID_MISMATCH');
  }
  if (decision.vehicleId !== observation.vehicleId) {
    reasons.push('CORRELATION_VEHICLE_ID_MISMATCH');
  }
  if (decision.opportunityId !== observation.shadowOpportunityId) {
    reasons.push('CORRELATION_OPPORTUNITY_ID_MISMATCH');
  }
  if (
    observation.policyVersion != null &&
    decision.policyVersion !== observation.policyVersion
  ) {
    reasons.push('CORRELATION_POLICY_VERSION_MISMATCH');
  }

  const obsMs = parseApdsShadowDecisionAtMs(observation.shadowDecisionAt);
  const decMs = parseApdsShadowDecisionAtMs(decision.decisionAt);
  if (obsMs == null || decMs == null || obsMs !== decMs) {
    reasons.push('CORRELATION_DECISION_AT_MISMATCH');
  }

  const auth = input.authoritativePersistedDecision;
  if (auth) {
    if (decision.opportunityId !== auth.opportunityId) {
      reasons.push('CORRELATION_DECISION_OPPORTUNITY_NOT_AUTHORITATIVE');
    }
    if (decision.baselineDecision !== auth.decision) {
      reasons.push('CORRELATION_BASELINE_DECISION_NOT_AUTHORITATIVE');
    }
    const authMs = auth.decisionAt.getTime();
    if (decMs == null || authMs !== decMs) {
      reasons.push('CORRELATION_DECISION_AT_NOT_AUTHORITATIVE');
    }
    if (decision.policyVersion !== auth.policyVersion) {
      reasons.push('CORRELATION_POLICY_VERSION_NOT_AUTHORITATIVE');
    }
    const decEpoch = decision.activationEpochId ?? null;
    const authEpoch = auth.activationEpochId ?? null;
    if (decEpoch !== authEpoch) {
      reasons.push('CORRELATION_ACTIVATION_EPOCH_NOT_AUTHORITATIVE');
    }
  }

  return { consistent: reasons.length === 0, reasons };
}
