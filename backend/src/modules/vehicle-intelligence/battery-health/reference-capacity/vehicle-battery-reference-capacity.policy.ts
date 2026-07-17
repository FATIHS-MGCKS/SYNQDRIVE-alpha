import {
  BATTERY_REFERENCE_CAPACITY_ALLOWED_SOURCES,
  BATTERY_REFERENCE_CAPACITY_ASSESSMENT_COMPATIBLE_TYPES,
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';

export const REFERENCE_CAPACITY_CHANGE_ACTIONS = {
  CREATED: 'CREATED',
  SUPERSEDED: 'SUPERSEDED',
  VERIFIED: 'VERIFIED',
  NOTES_UPDATED: 'NOTES_UPDATED',
} as const;

export type ReferenceCapacityChangeAction =
  (typeof REFERENCE_CAPACITY_CHANGE_ACTIONS)[keyof typeof REFERENCE_CAPACITY_CHANGE_ACTIONS];

export const REFERENCE_CAPACITY_POLICY_REASONS = {
  SOURCE_NOT_ALLOWED: 'SOURCE_NOT_ALLOWED',
  CAPACITY_NOT_POSITIVE: 'CAPACITY_NOT_POSITIVE',
  CAPACITY_TYPE_NOT_ASSESSMENT_COMPATIBLE: 'CAPACITY_TYPE_NOT_ASSESSMENT_COMPATIBLE',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  NOT_ACTIVE: 'NOT_ACTIVE',
  MISSING_EVIDENCE_FOR_VERIFY: 'MISSING_EVIDENCE_FOR_VERIFY',
  AUTO_VERIFY_FORBIDDEN: 'AUTO_VERIFY_FORBIDDEN',
} as const;

export type ReferenceCapacityPolicyReasonCode =
  (typeof REFERENCE_CAPACITY_POLICY_REASONS)[keyof typeof REFERENCE_CAPACITY_POLICY_REASONS];

export interface ReferenceCapacityCreateInput {
  capacityKwh: number;
  capacityType: BatteryReferenceCapacityType;
  source: BatteryReferenceCapacitySource;
  documentId?: string | null;
  serviceEventId?: string | null;
  notes?: string | null;
}

export interface ReferenceCapacityPolicyEvaluation {
  ok: boolean;
  reasonCodes: ReferenceCapacityPolicyReasonCode[];
}

export function isAllowedReferenceCapacitySource(
  source: BatteryReferenceCapacitySource,
): boolean {
  return (BATTERY_REFERENCE_CAPACITY_ALLOWED_SOURCES as readonly string[]).includes(
    source,
  );
}

export function isAssessmentCompatibleCapacityType(
  capacityType: BatteryReferenceCapacityType,
): boolean {
  return (
    BATTERY_REFERENCE_CAPACITY_ASSESSMENT_COMPATIBLE_TYPES as readonly string[]
  ).includes(capacityType);
}

export function evaluateReferenceCapacityCreate(
  input: ReferenceCapacityCreateInput,
): ReferenceCapacityPolicyEvaluation {
  const reasonCodes: ReferenceCapacityPolicyReasonCode[] = [];

  if (!isAllowedReferenceCapacitySource(input.source)) {
    reasonCodes.push(REFERENCE_CAPACITY_POLICY_REASONS.SOURCE_NOT_ALLOWED);
  }
  if (!Number.isFinite(input.capacityKwh) || input.capacityKwh <= 0) {
    reasonCodes.push(REFERENCE_CAPACITY_POLICY_REASONS.CAPACITY_NOT_POSITIVE);
  }
  if (!isAssessmentCompatibleCapacityType(input.capacityType)) {
    reasonCodes.push(
      REFERENCE_CAPACITY_POLICY_REASONS.CAPACITY_TYPE_NOT_ASSESSMENT_COMPATIBLE,
    );
  }

  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function resolveInitialVerificationStatus(): ReferenceCapacityVerificationStatus {
  return ReferenceCapacityVerificationStatus.UNVERIFIED;
}

export function evaluateReferenceCapacityVerify(input: {
  isActive: boolean;
  verificationStatus: ReferenceCapacityVerificationStatus;
  source: BatteryReferenceCapacitySource;
  documentId?: string | null;
  serviceEventId?: string | null;
}): ReferenceCapacityPolicyEvaluation {
  const reasonCodes: ReferenceCapacityPolicyReasonCode[] = [];

  if (!input.isActive) {
    reasonCodes.push(REFERENCE_CAPACITY_POLICY_REASONS.NOT_ACTIVE);
  }
  if (input.verificationStatus === ReferenceCapacityVerificationStatus.VERIFIED) {
    reasonCodes.push(REFERENCE_CAPACITY_POLICY_REASONS.ALREADY_VERIFIED);
  }
  if (!isAllowedReferenceCapacitySource(input.source)) {
    reasonCodes.push(REFERENCE_CAPACITY_POLICY_REASONS.SOURCE_NOT_ALLOWED);
  }

  const requiresEvidence =
    input.source === BatteryReferenceCapacitySource.WORKSHOP_DOCUMENT ||
    input.source === BatteryReferenceCapacitySource.BMS_REPORT ||
    input.source === BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED;

  if (requiresEvidence && !input.documentId && !input.serviceEventId) {
    reasonCodes.push(REFERENCE_CAPACITY_POLICY_REASONS.MISSING_EVIDENCE_FOR_VERIFY);
  }

  return { ok: reasonCodes.length === 0, reasonCodes };
}
