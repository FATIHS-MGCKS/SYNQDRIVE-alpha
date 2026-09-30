import type { Organization, VehicleOnboardingCase, VehicleOnboardingCaseSourceRef } from '@prisma/client';
import type { ReadinessRuleResultV1 } from '../contracts/readiness-rule-result.v1';
import type { VehicleOnboardingReadinessProfileV1 } from './profiles/vehicle-onboarding-readiness-profile.v1';
import {
  parseValidatedAdminDraft,
  parseValidatedIdentityDraft,
  parseValidatedSourceSnapshot,
  parseValidatedValidationFindings,
} from '../policy/persisted-contract.validation';
import {
  assessBrakeBaselineState,
  assessHvBatteryBaselineState,
  assessTireBaselineState,
  parseTechnicalBaselineDraft,
  type BaselineSectionMaterializationState,
} from '../policy/technical-baseline-draft.validation';
import { assertSupportedActivationSourceSet } from '../policy/source-set-invariant';
import { assertCompositeVinConsistencyForActivation } from '../policy/composite-vin-consistency';
import { resolveActivationVehicleFields } from '../policy/activation-field-resolution';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { classifyPowertrainFromFuelType } from './powertrain-classification';
import type { ReadinessDecisionV2 } from '../contracts/readiness-snapshot.v2';

const RULE_VERSION = '1.0.0';

export interface ReadinessEvaluationContext {
  caseRow: VehicleOnboardingCase;
  sourceRefs: VehicleOnboardingCaseSourceRef[];
  organization: Organization;
  profile: VehicleOnboardingReadinessProfileV1;
}

function result(
  ruleId: string,
  inputClass: ReadinessRuleResultV1['inputClass'],
  status: ReadinessRuleResultV1['status'],
  blocking: boolean,
  reasonCode: string,
  evidenceRefs: string[] = [],
): ReadinessRuleResultV1 {
  return {
    ruleId,
    ruleVersion: RULE_VERSION,
    inputClass,
    status,
    blocking,
    reasonCode,
    evidenceRefs,
  };
}

export function evaluateReadinessRules(ctx: ReadinessEvaluationContext): {
  ruleResults: ReadinessRuleResultV1[];
  schemaRequiredFieldsMet: boolean;
  decision: ReadinessDecisionV2;
  blockingFailureCount: number;
  reviewRequiredCount: number;
  deferredCount: number;
  unknownAllowedCount: number;
} {
  const results: ReadinessRuleResultV1[] = [];

  results.push(
    result(
      'VO-RDY-IDENTITY-001',
      'MANDATORY_FOR_IDENTITY',
      ctx.caseRow.organizationId === ctx.organization.id ? 'PASS' : 'FAIL',
      true,
      ctx.caseRow.organizationId === ctx.organization.id ? 'ORG_SCOPE_OK' : 'ORG_SCOPE_MISMATCH',
    ),
  );

  const primary = ctx.sourceRefs.find((r) => r.isPrimary) ?? ctx.sourceRefs[0];
  results.push(
    result(
      'VO-RDY-IDENTITY-002',
      'MANDATORY_FOR_IDENTITY',
      primary ? 'PASS' : 'FAIL',
      true,
      primary ? 'PRIMARY_SOURCE_PRESENT' : 'PRIMARY_SOURCE_MISSING',
    ),
  );

  try {
    assertSupportedActivationSourceSet(ctx.sourceRefs);
    results.push(
      result(
        'VO-RDY-IDENTITY-003',
        'MANDATORY_FOR_IDENTITY',
        'PASS',
        true,
        'SOURCE_SET_SUPPORTED',
      ),
    );
  } catch (e) {
    const code = e instanceof VehicleOnboardingError ? e.code : 'SOURCE_SET_INVALID';
    results.push(
      result(
        'VO-RDY-IDENTITY-003',
        'MANDATORY_FOR_IDENTITY',
        code === 'SOURCE_SET_REQUIRES_REVIEW' ? 'REVIEW_REQUIRED' : 'FAIL',
        code !== 'SOURCE_SET_REQUIRES_REVIEW',
        String(code),
      ),
    );
  }

  let identity = parseValidatedIdentityDraft(ctx.caseRow);
  try {
    assertCompositeVinConsistencyForActivation(identity, ctx.sourceRefs);
    results.push(
      result(
        'VO-RDY-IDENTITY-004',
        'MANDATORY_FOR_IDENTITY',
        'PASS',
        true,
        'NO_SOURCE_IDENTITY_CONTRADICTION',
      ),
    );
  } catch {
    results.push(
      result(
        'VO-RDY-IDENTITY-004',
        'MANDATORY_FOR_IDENTITY',
        'REVIEW_REQUIRED',
        true,
        'SOURCE_IDENTITY_CONTRADICTION',
      ),
    );
  }

  results.push(
    result(
      'VO-RDY-IDENTITY-005',
      'MANDATORY_FOR_IDENTITY',
      'PASS',
      true,
      'CONTRACT_VERSIONS_SUPPORTED',
    ),
  );

  let schemaRequiredFieldsMet = false;
  try {
    const admin = parseValidatedAdminDraft(ctx.caseRow);
    resolveActivationVehicleFields(identity, admin);
    schemaRequiredFieldsMet = true;
    results.push(
      result(
        'VO-RDY-IDENTITY-006',
        'MANDATORY_FOR_IDENTITY',
        'PASS',
        true,
        'SCHEMA_FIELDS_RESOLVABLE',
      ),
    );
  } catch {
    results.push(
      result(
        'VO-RDY-IDENTITY-006',
        'MANDATORY_FOR_IDENTITY',
        'FAIL',
        true,
        'SCHEMA_FIELDS_MISSING',
      ),
    );
  }

  const vinState = identity.vinVerificationState;
  if (vinState === 'CONFLICT') {
    results.push(
      result(
        'VO-RDY-IDENTITY-007',
        'MANDATORY_FOR_IDENTITY',
        'REVIEW_REQUIRED',
        true,
        'VIN_CONFLICT',
      ),
    );
  } else {
    results.push(
      result(
        'VO-RDY-IDENTITY-007',
        'MANDATORY_FOR_IDENTITY',
        'PASS',
        false,
        'VIN_STATE_OK',
      ),
    );
  }

  const findings = parseValidatedValidationFindings(ctx.caseRow);
  const blockingFinding = findings.findings.find((f) => f.severity === 'BLOCKING');
  if (blockingFinding) {
    results.push(
      result(
        'VO-RDY-VALIDATION-001',
        'MANDATORY_FOR_IDENTITY',
        'FAIL',
        true,
        blockingFinding.code,
        [blockingFinding.code],
      ),
    );
  } else {
    results.push(
      result(
        'VO-RDY-VALIDATION-001',
        'MANDATORY_FOR_IDENTITY',
        'PASS',
        false,
        'NO_BLOCKING_FINDINGS',
      ),
    );
  }

  const vinPolicy = ctx.profile.vin;
  const sourceMode = ctx.caseRow.sourceMode;
  let vinRuleStatus: ReadinessRuleResultV1['status'] = 'PASS';
  let vinBlocking = false;
  let vinReason = 'VIN_POLICY_SATISFIED';
  if (sourceMode === 'MANUAL' && vinPolicy.manualRequired && !identity.vin?.trim()) {
    vinRuleStatus = 'FAIL';
    vinBlocking = true;
    vinReason = 'MANUAL_VIN_REQUIRED';
  } else if (
    (sourceMode === 'DIMO' || sourceMode === 'COMPOSITE') &&
    !identity.vin?.trim() &&
    !vinPolicy.providerDiscoveredNullable
  ) {
    vinRuleStatus = 'FAIL';
    vinBlocking = true;
    vinReason = 'PROVIDER_VIN_REQUIRED';
  }
  results.push(
    result(
      'VO-RDY-VIN-001',
      'MANDATORY_FOR_SELECTED_PRODUCT',
      vinRuleStatus,
      vinBlocking,
      vinReason,
    ),
  );

  const admin = parseValidatedAdminDraft(ctx.caseRow);
  const plate = admin?.licensePlate?.trim();
  if (ctx.profile.licensePlate === 'REQUIRED' && !plate) {
    results.push(
      result(
        'VO-RDY-PLATE-001',
        'MANDATORY_FOR_SELECTED_PRODUCT',
        'FAIL',
        true,
        'LICENSE_PLATE_REQUIRED',
      ),
    );
  } else {
    results.push(
      result(
        'VO-RDY-PLATE-001',
        'MANDATORY_FOR_SELECTED_PRODUCT',
        plate ? 'PASS' : 'UNKNOWN_ALLOWED',
        false,
        'LICENSE_PLATE_OPTIONAL',
      ),
    );
  }

  const stationId = admin?.stationId?.trim();
  if (ctx.profile.station === 'REQUIRED' && !stationId) {
    results.push(
      result(
        'VO-RDY-STATION-001',
        'MANDATORY_FOR_TENANT_ASSIGNMENT',
        'FAIL',
        true,
        'STATION_REQUIRED',
      ),
    );
  } else if (ctx.profile.station === 'OPTIONAL') {
    results.push(
      result(
        'VO-RDY-STATION-001',
        'MANDATORY_FOR_TENANT_ASSIGNMENT',
        stationId ? 'PASS' : 'UNKNOWN_ALLOWED',
        false,
        'STATION_OPTIONAL',
      ),
    );
  } else {
    results.push(
      result(
        'VO-RDY-STATION-001',
        'MANDATORY_FOR_TENANT_ASSIGNMENT',
        'NOT_APPLICABLE',
        false,
        'STATION_NOT_APPLICABLE',
      ),
    );
  }

  const powertrain = classifyPowertrainFromFuelType(identity.fuelType);
  const technicalParsed = parseTechnicalBaselineDraft(ctx.caseRow);
  const tirePolicy = ctx.profile.tireBaseline;
  results.push(
    evaluateBaselineMaterializationRule(
      'VO-RDY-TIRE-001',
      tirePolicy,
      assessTireBaselineState(technicalParsed, ctx.caseRow),
      'TIRE_REFERENCE',
    ),
  );

  const brakePolicy = ctx.profile.brakeBaseline;
  results.push(
    evaluateBaselineMaterializationRule(
      'VO-RDY-BRAKE-001',
      brakePolicy,
      assessBrakeBaselineState(technicalParsed, ctx.caseRow),
      'BRAKE_REFERENCE',
    ),
  );

  const hvPolicy = ctx.profile.hvBatteryByPowertrain[powertrain];
  results.push(
    evaluateBaselineMaterializationRule(
      'VO-RDY-HV-BATTERY-001',
      hvPolicy,
      assessHvBatteryBaselineState(technicalParsed, ctx.caseRow),
      'HV_BATTERY_REFERENCE',
      'MANDATORY_FOR_SELECTED_PRODUCT',
    ),
  );

  const hmPrimary =
    ctx.caseRow.sourceMode === 'HIGH_MOBILITY' ||
    primary?.provider === 'HIGH_MOBILITY';
  if (hmPrimary && ctx.profile.hmClearanceWhenHmPrimary) {
    const hmRef = ctx.sourceRefs.find((r) => r.provider === 'HIGH_MOBILITY');
    let clearance = 'UNKNOWN';
    if (hmRef) {
      try {
        const snap = parseValidatedSourceSnapshot(hmRef);
        clearance = String(snap.sourceEvidence.clearanceStatus ?? 'UNKNOWN');
      } catch {
        clearance = 'INVALID_SNAPSHOT';
      }
    }
    const approved = clearance === 'APPROVED';
    results.push(
      result(
        'VO-RDY-HM-001',
        'MANDATORY_FOR_SELECTED_PRODUCT',
        approved ? 'PASS' : 'FAIL',
        true,
        approved ? 'HM_CLEARANCE_APPROVED' : 'HM_CLEARANCE_INSUFFICIENT',
        hmRef ? [`hm:${hmRef.sourceMirrorId}`] : [],
      ),
    );
  } else {
    results.push(
      result(
        'VO-RDY-HM-001',
        'CAPABILITY_UNKNOWN_ALLOWED',
        'NOT_APPLICABLE',
        false,
        'HM_NOT_PRIMARY',
      ),
    );
  }

  results.push(
    result(
      'VO-RDY-TELEMETRY-001',
      'OPTIONAL_ENRICHMENT',
      ctx.profile.providerTelemetryPending === 'DEFERRED' ? 'DEFERRED' : 'UNKNOWN_ALLOWED',
      false,
      'TELEMETRY_PENDING_NON_BLOCKING',
    ),
  );

  results.push(
    result(
      'VO-RDY-DIMO-001',
      'MANDATORY_FOR_IDENTITY',
      'PASS',
      false,
      'DIMO_MIRROR_NOT_TENANT_OWNERSHIP_PROOF',
    ),
  );

  const blockingFailureCount = results.filter(
    (r) => r.blocking && (r.status === 'FAIL' || r.status === 'REVIEW_REQUIRED'),
  ).length;
  const reviewRequiredCount = results.filter((r) => r.status === 'REVIEW_REQUIRED').length;
  const deferredCount = results.filter((r) => r.status === 'DEFERRED').length;
  const unknownAllowedCount = results.filter((r) => r.status === 'UNKNOWN_ALLOWED').length;

  let decision: ReadinessDecisionV2 = 'NOT_READY';
  if (results.some((r) => r.status === 'REVIEW_REQUIRED')) {
    decision = 'REVIEW_REQUIRED';
  } else if (
    schemaRequiredFieldsMet &&
    !results.some((r) => r.blocking && r.status === 'FAIL')
  ) {
    decision = 'READY';
  }

  return {
    ruleResults: results,
    schemaRequiredFieldsMet,
    decision,
    blockingFailureCount,
    reviewRequiredCount,
    deferredCount,
    unknownAllowedCount,
  };
}

function evaluateBaselineMaterializationRule(
  ruleId: string,
  policy: VehicleOnboardingReadinessProfileV1['tireBaseline'],
  state: BaselineSectionMaterializationState,
  reasonPrefix: string,
  inputClass: ReadinessRuleResultV1['inputClass'] = 'MANDATORY_FOR_SELECTED_PRODUCT',
): ReadinessRuleResultV1 {
  if (policy === 'NOT_APPLICABLE') {
    return result(ruleId, inputClass, 'NOT_APPLICABLE', false, `${reasonPrefix}_N/A`);
  }

  if (state === 'invalid') {
    return result(
      ruleId,
      inputClass,
      policy === 'DEFERRED_ALLOWED' ? 'FAIL' : 'FAIL',
      true,
      `${reasonPrefix}_INVALID`,
    );
  }

  if (state === 'v1_opaque_only') {
    if (policy === 'REQUIRED') {
      return result(
        ruleId,
        inputClass,
        'FAIL',
        true,
        `${reasonPrefix}_CONTRACT_UPGRADE_REQUIRED`,
      );
    }
    return result(
      ruleId,
      inputClass,
      policy === 'DEFERRED_ALLOWED' ? 'DEFERRED' : 'UNKNOWN_ALLOWED',
      false,
      `${reasonPrefix}_V1_OPAQUE_NOT_MATERIALIZABLE`,
    );
  }

  const materializable = state === 'materializable';

  if (policy === 'REQUIRED') {
    return result(
      ruleId,
      inputClass,
      materializable ? 'PASS' : 'FAIL',
      true,
      materializable ? `${reasonPrefix}_MATERIALIZABLE` : `${reasonPrefix}_MISSING`,
    );
  }
  if (policy === 'DEFERRED_ALLOWED') {
    return result(
      ruleId,
      inputClass,
      materializable ? 'PASS' : 'DEFERRED',
      false,
      materializable ? `${reasonPrefix}_MATERIALIZABLE` : `${reasonPrefix}_DEFERRED`,
    );
  }
  return result(
    ruleId,
    inputClass,
    materializable ? 'PASS' : 'UNKNOWN_ALLOWED',
    false,
    materializable ? `${reasonPrefix}_MATERIALIZABLE` : `${reasonPrefix}_OPTIONAL`,
  );
}
