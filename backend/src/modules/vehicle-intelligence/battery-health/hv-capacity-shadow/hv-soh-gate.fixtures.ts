import {
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import { computeHvCrossSessionAssessment } from './hv-capacity-cross-session.policy';
import {
  TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT,
  TESLA_AUDIT_CROSS_SESSION_M3_CONFLICT_INPUT,
  TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
  TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
} from './hv-capacity-cross-session.fixtures';
import {
  HV_CROSS_SESSION_CONFIDENCE,
  type HvCrossSessionAssessment,
} from './hv-capacity-cross-session.types';
import type {
  HvSohGateCrossSessionInput,
  HvSohGateReferenceInput,
  HvSohGateVehicleContext,
} from './hv-soh-gate.types';
import { HV_SOH_GATE_MODEL_VERSION } from './hv-soh-gate.types';

export const TESLA_AUDIT_VERIFIED_REFERENCE_KWH = 57;
export const TESLA_AUDIT_VERIFIED_REFERENCE_ID = 'ref-cap-verified-57';

export const TESLA_AUDIT_VERIFIED_REFERENCE: HvSohGateReferenceInput = {
  id: TESLA_AUDIT_VERIFIED_REFERENCE_ID,
  capacityKwh: TESLA_AUDIT_VERIFIED_REFERENCE_KWH,
  capacityType: BatteryReferenceCapacityType.USABLE_NET,
  verificationStatus: ReferenceCapacityVerificationStatus.VERIFIED,
};

export const TESLA_AUDIT_UNVERIFIED_REFERENCE: HvSohGateReferenceInput = {
  ...TESLA_AUDIT_VERIFIED_REFERENCE,
  verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
};

export const TESLA_AUDIT_INCOMPATIBLE_REFERENCE: HvSohGateReferenceInput = {
  ...TESLA_AUDIT_VERIFIED_REFERENCE,
  capacityType: BatteryReferenceCapacityType.GROSS_NOMINAL,
};

export const TESLA_AUDIT_SOH_GATE_CONTEXT: HvSohGateVehicleContext = {
  vehicleId: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT.vehicleId,
  modelVersion: HV_SOH_GATE_MODEL_VERSION,
  currentCapabilityVersion: 3,
  sohPublicationEnabled: false,
  now: new Date('2026-06-28T12:00:00.000Z'),
};

function toCrossSessionInput(
  assessment: HvCrossSessionAssessment,
  capabilityVersion = 3,
): HvSohGateCrossSessionInput {
  return {
    shadowGatePassed: assessment.shadowGatePassed,
    estimatedUsableCapacityKwh: assessment.estimatedUsableCapacityKwh,
    sessionCount: assessment.sessionCount,
    computedAt: assessment.computedAt,
    gateReasonCodes: assessment.gateReasonCodes,
    methodAgreement: assessment.methodAgreement,
    confidence: assessment.confidence,
    idempotencyKey: assessment.idempotencyKey,
    modelVersion: assessment.modelVersion,
    capabilityVersion,
  };
}

export const TESLA_AUDIT_STABLE_CROSS_SESSION = computeHvCrossSessionAssessment({
  sessions: TESLA_AUDIT_CROSS_SESSION_STABLE_INPUT,
  context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
});

export const TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT = toCrossSessionInput(
  TESLA_AUDIT_STABLE_CROSS_SESSION,
);

export const TESLA_AUDIT_CONFLICTING_CROSS_SESSION_INPUT = toCrossSessionInput(
  computeHvCrossSessionAssessment({
    sessions: TESLA_AUDIT_CROSS_SESSION_CONFLICTING_INPUT,
    context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
  }),
);

export const TESLA_AUDIT_M3_CONFLICT_CROSS_SESSION_INPUT = toCrossSessionInput(
  computeHvCrossSessionAssessment({
    sessions: TESLA_AUDIT_CROSS_SESSION_M3_CONFLICT_INPUT,
    context: TESLA_AUDIT_CROSS_SESSION_VEHICLE_CONTEXT,
  }),
);

export const TESLA_AUDIT_INSUFFICIENT_SESSIONS_CROSS_SESSION_INPUT: HvSohGateCrossSessionInput =
  {
    ...TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
    sessionCount: 2,
    shadowGatePassed: false,
    confidence: HV_CROSS_SESSION_CONFIDENCE.INSUFFICIENT,
  };

export const TESLA_AUDIT_STALE_CROSS_SESSION_INPUT: HvSohGateCrossSessionInput = {
  ...TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
  computedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
};

export const TESLA_AUDIT_UNSTABLE_CROSS_SESSION_INPUT: HvSohGateCrossSessionInput = {
  ...TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
  shadowGatePassed: false,
  estimatedUsableCapacityKwh: null,
  confidence: HV_CROSS_SESSION_CONFIDENCE.INSUFFICIENT,
};

export const TESLA_AUDIT_CAPABILITY_CHANGED_CROSS_SESSION_INPUT: HvSohGateCrossSessionInput =
  {
    ...TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
    capabilityVersion: 2,
  };

export const TESLA_AUDIT_IMPLAUSIBLE_HIGH_CROSS_SESSION_INPUT: HvSohGateCrossSessionInput =
  {
    ...TESLA_AUDIT_STABLE_CROSS_SESSION_INPUT,
    estimatedUsableCapacityKwh: 70,
  };
