import { readFileSync } from 'node:fs';
import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';
import { redactPostgresDatabaseTargetV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1';
import { M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import {
  loadPhaseAProductionApprovalRecordV1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV,
  validatePhaseAProductionApprovalWindowV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';
import {
  assertPhaseAProductionApprovalNotConsumedV1,
  validatePhaseAProductionConsumptionStoreV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import {
  parsePhaseAProductionTargetSpecFromEnvV1,
  validatePhaseAProductionApprovedTargetKeyMatchV1,
  validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1,
  validatePhaseAProductionTlsUrlPolicyV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V2,
  M3_3_HV_H4_A3_PHASE_A_OPERATIONAL_READINESS_REPORT_CONTRACT_V1,
  type M3_3HvH4A3PhaseAOperationalReadinessCheckV1,
  type M3_3HvH4A3PhaseAOperationalReadinessReportV1,
  type M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1,
  type M3_3HvH4A3PhaseAProductionGoNoGoLoadedV1,
  type M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1';
import {
  normalizePhaseAAuthorizedReleaseShaV1,
  parseUtcIsoTimestampV1,
  validatePhaseAAuditCredentialExpectationsV1,
  validatePhaseAIndependentVerifierTimestampV1,
  validatePhaseAStopConditionsV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';
import { evaluatePhaseAHumanVerificationReadinessV1 } from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-governance-mode.v1';

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_PATH_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_PATH' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pushCheck(
  checks: M3_3HvH4A3PhaseAOperationalReadinessCheckV1[],
  check: M3_3HvH4A3PhaseAOperationalReadinessCheckV1,
): void {
  checks.push(check);
}

function fail(checks: M3_3HvH4A3PhaseAOperationalReadinessCheckV1[], checkId: string, reasonCode: string): void {
  pushCheck(checks, { checkId, status: 'FAIL', reasonCode });
}

function pass(checks: M3_3HvH4A3PhaseAOperationalReadinessCheckV1[], checkId: string): void {
  pushCheck(checks, { checkId, status: 'PASS' });
}

function validateIndependentAuthorizationVerificationV1(
  iv: unknown,
): { ok: true; record: M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1 } | { ok: false; reasonCode: string } {
  if (
    !iv ||
    typeof iv !== 'object' ||
    typeof (iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1).verifierIdentity !==
      'string' ||
    !(iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1).verifierIdentity.trim() ||
    typeof (iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1).verifiedAtUtc !==
      'string' ||
    !(iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1).verifiedAtUtc.trim() ||
    typeof (iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1).verificationMethod !==
      'string' ||
    !(iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1).verificationMethod.trim() ||
    (iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1)
      .attestsIndependentFromApprovalAuthor !== true
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_INDEPENDENT_VERIFICATION_INCOMPLETE' };
  }
  return { ok: true, record: iv as M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1 };
}

function validatePhaseAProductionGoNoGoOperationalBodyV1(
  parsed: Record<string, unknown>,
): { ok: true; body: M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1 } | { ok: false; reasonCode: string } {
  const operatorDecision = parsed.operatorDecision;
  if (operatorDecision !== 'GO' && operatorDecision !== 'NO_GO') {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_DECISION_INVALID' };
  }
  const recordRelease = normalizePhaseAAuthorizedReleaseShaV1(
    typeof parsed.authorizedReleaseSha === 'string' ? parsed.authorizedReleaseSha : undefined,
  );
  if (!recordRelease.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RELEASE_SHA_MALFORMED' };
  }
  if (typeof parsed.changeTicket !== 'string' || !parsed.changeTicket.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RECORD_INCOMPLETE' };
  }
  if (typeof parsed.authorizedHumanApprover !== 'string' || !parsed.authorizedHumanApprover.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RECORD_INCOMPLETE' };
  }

  const pt = parsed.productionTarget;
  if (
    !pt ||
    typeof pt !== 'object' ||
    typeof (pt as { hostname?: string }).hostname !== 'string' ||
    !(pt as { hostname: string }).hostname.trim() ||
    typeof (pt as { database?: string }).database !== 'string' ||
    !(pt as { database: string }).database.trim() ||
    typeof (pt as { auditLogin?: string }).auditLogin !== 'string' ||
    !(pt as { auditLogin: string }).auditLogin.trim() ||
    typeof (pt as { port?: number }).port !== 'number' ||
    !Number.isFinite((pt as { port: number }).port) ||
    (pt as { port: number }).port <= 0 ||
    (pt as { port: number }).port > 65535
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_TARGET_INCOMPLETE' };
  }

  const auditExpectations = validatePhaseAAuditCredentialExpectationsV1(
    parsed.auditCredentialExpectations as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['auditCredentialExpectations'],
  );
  if (!auditExpectations.ok) return auditExpectations;

  const limits = parsed.authorizationLimits;
  if (
    !limits ||
    typeof limits !== 'object' ||
    (limits as { schemaChangesAuthorized?: boolean }).schemaChangesAuthorized !== false ||
    (limits as { issuanceActivationAuthorized?: boolean }).issuanceActivationAuthorized !== false ||
    (limits as { applicationRuntimeFlagChangesAuthorized?: boolean }).applicationRuntimeFlagChangesAuthorized !==
      false ||
    (limits as { hybridLoaderActivationAuthorized?: boolean }).hybridLoaderActivationAuthorized !== false ||
    (limits as { attestationInsertOrUpdateAuthorized?: boolean }).attestationInsertOrUpdateAuthorized !== false ||
    (limits as { retentionActivationAuthorized?: boolean }).retentionActivationAuthorized !== false ||
    (limits as { reconciliationActivationAuthorized?: boolean }).reconciliationActivationAuthorized !== false ||
    (limits as { backfillActivationAuthorized?: boolean }).backfillActivationAuthorized !== false
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_LIMITS_INVALID' };
  }

  const stop = validatePhaseAStopConditionsV1(parsed.stopConditions);
  if (!stop.ok) return stop;
  if (
    typeof parsed.incidentHandling !== 'string' ||
    !parsed.incidentHandling.trim() ||
    typeof parsed.evidenceStorageDestination !== 'string' ||
    !parsed.evidenceStorageDestination.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_INCIDENT_OR_EVIDENCE_INCOMPLETE' };
  }

  const binding = parsed.approvalBinding;
  if (
    !binding ||
    typeof binding !== 'object' ||
    typeof (binding as { approvalId?: string }).approvalId !== 'string' ||
    !(binding as { approvalId: string }).approvalId.trim() ||
    typeof (binding as { executeNonce?: string }).executeNonce !== 'string' ||
    !(binding as { executeNonce: string }).executeNonce.trim() ||
    typeof (binding as { validFrom?: string }).validFrom !== 'string' ||
    !(binding as { validFrom: string }).validFrom.trim() ||
    typeof (binding as { validUntil?: string }).validUntil !== 'string' ||
    !(binding as { validUntil: string }).validUntil.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_APPROVAL_BINDING_INCOMPLETE' };
  }
  const bindingFrom = parseUtcIsoTimestampV1((binding as { validFrom: string }).validFrom);
  const bindingUntil = parseUtcIsoTimestampV1((binding as { validUntil: string }).validUntil);
  if (!bindingFrom.ok || !bindingUntil.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_APPROVAL_BINDING_TIMESTAMP_INVALID' };
  }
  if (bindingUntil.epochMs <= bindingFrom.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_APPROVAL_BINDING_WINDOW_REVERSED' };
  }

  const store = parsed.consumptionStore;
  if (
    !store ||
    typeof store !== 'object' ||
    typeof (store as { absolutePath?: string }).absolutePath !== 'string' ||
    !(store as { absolutePath: string }).absolutePath.trim() ||
    typeof (store as { operationalOwner?: string }).operationalOwner !== 'string' ||
    !(store as { operationalOwner: string }).operationalOwner.trim() ||
    (store as { markerFileName?: string }).markerFileName !==
      '.synqdrive_phase_a_production_consumption_store_v1'
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_CONSUMPTION_STORE_INCOMPLETE' };
  }

  const tls = parsed.tlsRequirements;
  if (
    !tls ||
    typeof tls !== 'object' ||
    (tls as { sslmode?: string }).sslmode !== 'verify-full' ||
    (tls as { trustedCaBundleRequired?: boolean }).trustedCaBundleRequired !== true ||
    (tls as { hostnameValidationRequired?: boolean }).hostnameValidationRequired !== true
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_TLS_REQUIREMENTS_INVALID' };
  }

  const sqlScope = parsed.readOnlySqlScope;
  if (
    !sqlScope ||
    typeof sqlScope !== 'object' ||
    (sqlScope as { approvedQueryManifestOnly?: boolean }).approvedQueryManifestOnly !== true ||
    (sqlScope as { singleSessionReadOnlyTransaction?: boolean }).singleSessionReadOnlyTransaction !== true ||
    (sqlScope as { boundedStatementTimeoutRequired?: boolean }).boundedStatementTimeoutRequired !== true
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_SQL_SCOPE_INVALID' };
  }

  const mw = parsed.maintenanceWindow;
  if (
    !mw ||
    typeof mw !== 'object' ||
    typeof (mw as { startUtc?: string }).startUtc !== 'string' ||
    !(mw as { startUtc: string }).startUtc.trim() ||
    typeof (mw as { endUtc?: string }).endUtc !== 'string' ||
    !(mw as { endUtc: string }).endUtc.trim()
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_INCOMPLETE' };
  }
  const mwStart = parseUtcIsoTimestampV1((mw as { startUtc: string }).startUtc);
  const mwEnd = parseUtcIsoTimestampV1((mw as { endUtc: string }).endUtc);
  if (!mwStart.ok || !mwEnd.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_INVALID' };
  }
  if (mwEnd.epochMs <= mwStart.epochMs) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_REVERSED' };
  }

  const body: M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1 = {
    operatorDecision: operatorDecision as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['operatorDecision'],
    authorizedReleaseSha: recordRelease.normalized,
    changeTicket: (parsed.changeTicket as string).trim(),
    authorizedHumanApprover: (parsed.authorizedHumanApprover as string).trim(),
    productionTarget: pt as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['productionTarget'],
    auditCredentialExpectations:
      parsed.auditCredentialExpectations as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['auditCredentialExpectations'],
    tlsRequirements: tls as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['tlsRequirements'],
    approvalBinding: binding as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['approvalBinding'],
    consumptionStore: store as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['consumptionStore'],
    readOnlySqlScope: sqlScope as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['readOnlySqlScope'],
    maintenanceWindow: mw as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['maintenanceWindow'],
    stopConditions: stop.conditions,
    incidentHandling: (parsed.incidentHandling as string).trim(),
    evidenceStorageDestination: (parsed.evidenceStorageDestination as string).trim(),
    authorizationLimits: limits as M3_3HvH4A3PhaseAProductionGoNoGoOperationalBodyV1['authorizationLimits'],
  };

  return { ok: true, body };
}

export function loadPhaseAProductionGoNoGoRecordV1(
  env: NodeJS.ProcessEnv,
): { ok: true; record: M3_3HvH4A3PhaseAProductionGoNoGoLoadedV1 } | { ok: false; reasonCode: string } {
  const jsonInline = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_JSON_ENV]?.trim();
  const path = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_PATH_ENV]?.trim();

  let raw: string | undefined;
  if (jsonInline) {
    raw = jsonInline;
  } else if (path) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RECORD_UNREADABLE' };
    }
  } else {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RECORD_REQUIRED' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RECORD_INVALID_JSON' };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_RECORD_INVALID_SHAPE' };
  }
  const contractVersion = parsed.contractVersion;
  if (
    contractVersion !== M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1 &&
    contractVersion !== M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V2
  ) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_CONTRACT_MISMATCH' };
  }

  const bodyValidated = validatePhaseAProductionGoNoGoOperationalBodyV1(parsed);
  if (!bodyValidated.ok) return bodyValidated;

  let governanceMode: M3_3HvH4A3PhaseAProductionGoNoGoLoadedV1['governanceMode'];
  let independentAuthorizationVerification:
    | M3_3HvH4A3PhaseAProductionGoNoGoIndependentVerificationV1
    | undefined;

  if (contractVersion === M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_CONTRACT_V1) {
    governanceMode = 'MULTI_PARTY_V1';
    const iv = validateIndependentAuthorizationVerificationV1(parsed.independentAuthorizationVerification);
    if (!iv.ok) return iv;
    independentAuthorizationVerification = iv.record;
  } else {
    const mode = parsed.governanceMode;
    if (mode !== 'MULTI_PARTY_V1' && mode !== 'SINGLE_OPERATOR_V1') {
      return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_GOVERNANCE_MODE_INVALID' };
    }
    governanceMode = mode;
    const hasIv = parsed.independentAuthorizationVerification !== undefined && parsed.independentAuthorizationVerification !== null;
    if (governanceMode === 'SINGLE_OPERATOR_V1') {
      if (hasIv) {
        return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_FABRICATED_SECOND_HUMAN_VERIFIER_FORBIDDEN' };
      }
    } else {
      const iv = validateIndependentAuthorizationVerificationV1(parsed.independentAuthorizationVerification);
      if (!iv.ok) return iv;
      independentAuthorizationVerification = iv.record;
    }
  }

  const record: M3_3HvH4A3PhaseAProductionGoNoGoLoadedV1 = {
    contractVersion,
    governanceMode,
    independentAuthorizationVerification,
    ...bodyValidated.body,
  };

  return { ok: true, record };
}

function urlsSameTarget(a: string, b: string): boolean {
  if (a === b) return true;
  const ka = canonicalPostgresTargetKeyV1(a);
  const kb = canonicalPostgresTargetKeyV1(b);
  return Boolean(ka && kb && ka === kb);
}

/**
 * Offline operational readiness — no PostgreSQL client, no network, no approval consumption.
 */
export function evaluatePhaseAProductionOperationalReadinessV1(
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAOperationalReadinessReportV1 {
  try {
    return evaluatePhaseAProductionOperationalReadinessInnerV1(env, options);
  } catch {
    return finalizeReport([], ['PHASE_A_OPERATIONAL_READINESS_EVALUATION_ABORTED'], {}, {
      authorizedReleaseShaBinding: 'NOT_EVALUATED',
    });
  }
}

function evaluatePhaseAProductionOperationalReadinessInnerV1(
  env: NodeJS.ProcessEnv,
  options: { now?: Date } = {},
): M3_3HvH4A3PhaseAOperationalReadinessReportV1 {
  const now = options.now ?? new Date();
  const checks: M3_3HvH4A3PhaseAOperationalReadinessCheckV1[] = [];
  const blockers: string[] = [];
  let releaseBinding: M3_3HvH4A3PhaseAOperationalReadinessReportV1['authorizedReleaseShaBinding'] =
    'NOT_EVALUATED';

  const goLoaded = loadPhaseAProductionGoNoGoRecordV1(env);
  if (!goLoaded.ok) {
    fail(checks, 'GO_NO_GO_RECORD', goLoaded.reasonCode);
    blockers.push(goLoaded.reasonCode);
    return finalizeReport(checks, blockers, {}, { authorizedReleaseShaBinding: releaseBinding });
  }
  pass(checks, 'GO_NO_GO_RECORD');
  const go = goLoaded.record;

  const auditRuntime = validatePhaseAAuditCredentialExpectationsV1(go.auditCredentialExpectations);
  if (!auditRuntime.ok) {
    fail(checks, 'AUDIT_CREDENTIAL_EXPECTATIONS', auditRuntime.reasonCode);
    blockers.push(auditRuntime.reasonCode);
  } else {
    pass(checks, 'AUDIT_CREDENTIAL_EXPECTATIONS');
  }

  if (go.operatorDecision !== 'GO') {
    fail(checks, 'GO_NO_GO_OPERATOR_DECISION', 'PHASE_A_GO_NO_GO_OPERATOR_DECISION_NO_GO');
    blockers.push('PHASE_A_GO_NO_GO_OPERATOR_DECISION_NO_GO');
  } else {
    pass(checks, 'GO_NO_GO_OPERATOR_DECISION');
  }

  const releaseShaParsed = normalizePhaseAAuthorizedReleaseShaV1(
    env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA_ENV],
  );
  if (!releaseShaParsed.ok) {
    fail(checks, 'AUTHORIZED_RELEASE_SHA', releaseShaParsed.reasonCode);
    blockers.push(releaseShaParsed.reasonCode);
  } else if (releaseShaParsed.normalized !== go.authorizedReleaseSha) {
    fail(checks, 'AUTHORIZED_RELEASE_SHA', 'PHASE_A_GO_NO_GO_RELEASE_SHA_MISMATCH');
    blockers.push('PHASE_A_GO_NO_GO_RELEASE_SHA_MISMATCH');
    releaseBinding = 'CONFIGURATION_CONSISTENCY_ONLY';
  } else {
    pass(checks, 'AUTHORIZED_RELEASE_SHA');
    releaseBinding = 'CONFIGURATION_CONSISTENCY_ONLY';
  }
  pushCheck(checks, {
    checkId: 'AUTHORIZED_RELEASE_SHA_DEPLOYED_EXECUTABLE',
    status: 'SKIP',
    reasonCode: 'PHASE_A_RELEASE_SHA_BINDING_CONFIGURATION_ONLY_NOT_DEPLOYED_EXECUTABLE',
  });

  const approvalLoaded = loadPhaseAProductionApprovalRecordV1(env);
  if (!approvalLoaded.ok) {
    fail(checks, 'APPROVAL_RECORD', approvalLoaded.reasonCode);
    blockers.push(approvalLoaded.reasonCode);
  } else {
    pass(checks, 'APPROVAL_RECORD');
    const approval = approvalLoaded.record;
    if (approval.changeTicket !== go.changeTicket) {
      fail(checks, 'CHANGE_TICKET_ALIGNMENT', 'PHASE_A_GO_NO_GO_CHANGE_TICKET_MISMATCH');
      blockers.push('PHASE_A_GO_NO_GO_CHANGE_TICKET_MISMATCH');
    } else {
      pass(checks, 'CHANGE_TICKET_ALIGNMENT');
    }
    if (approval.approvalId !== go.approvalBinding.approvalId) {
      fail(checks, 'APPROVAL_ID_ALIGNMENT', 'PHASE_A_GO_NO_GO_APPROVAL_ID_MISMATCH');
      blockers.push('PHASE_A_GO_NO_GO_APPROVAL_ID_MISMATCH');
    } else {
      pass(checks, 'APPROVAL_ID_ALIGNMENT');
    }
    if (approval.executeNonce !== go.approvalBinding.executeNonce) {
      fail(checks, 'EXECUTE_NONCE_ALIGNMENT', 'PHASE_A_GO_NO_GO_EXECUTE_NONCE_MISMATCH');
      blockers.push('PHASE_A_GO_NO_GO_EXECUTE_NONCE_MISMATCH');
    } else {
      pass(checks, 'EXECUTE_NONCE_ALIGNMENT');
    }
    if (
      approval.validFrom !== go.approvalBinding.validFrom ||
      approval.validUntil !== go.approvalBinding.validUntil
    ) {
      fail(checks, 'APPROVAL_WINDOW_ALIGNMENT', 'PHASE_A_GO_NO_GO_APPROVAL_WINDOW_MISMATCH');
      blockers.push('PHASE_A_GO_NO_GO_APPROVAL_WINDOW_MISMATCH');
    } else {
      pass(checks, 'APPROVAL_WINDOW_ALIGNMENT');
    }

    const approvalFromUtc = parseUtcIsoTimestampV1(approval.validFrom);
    const approvalUntilUtc = parseUtcIsoTimestampV1(approval.validUntil);
    if (!approvalFromUtc.ok) {
      fail(checks, 'APPROVAL_RECORD_TIMESTAMP_UTC', approvalFromUtc.reasonCode);
      blockers.push(approvalFromUtc.reasonCode);
    } else if (!approvalUntilUtc.ok) {
      fail(checks, 'APPROVAL_RECORD_TIMESTAMP_UTC', approvalUntilUtc.reasonCode);
      blockers.push(approvalUntilUtc.reasonCode);
    } else {
      pass(checks, 'APPROVAL_RECORD_TIMESTAMP_UTC');
    }

    const window = validatePhaseAProductionApprovalWindowV1(approval, now);
    if (!window.ok) {
      fail(checks, 'APPROVAL_WINDOW_CURRENT', window.reasonCode);
      blockers.push(window.reasonCode);
    } else {
      pass(checks, 'APPROVAL_WINDOW_CURRENT');
    }

    if (go.governanceMode === 'MULTI_PARTY_V1') {
      const iv = go.independentAuthorizationVerification;
      if (!iv) {
        fail(checks, 'INDEPENDENT_HUMAN_VERIFICATION', 'PHASE_A_GO_NO_GO_INDEPENDENT_VERIFICATION_INCOMPLETE');
        blockers.push('PHASE_A_GO_NO_GO_INDEPENDENT_VERIFICATION_INCOMPLETE');
      } else {
        const humanVerification = evaluatePhaseAHumanVerificationReadinessV1(env, {
          verifierIdentity: iv.verifierIdentity,
          approvingAuthority: approval.approvingAuthority,
          authorizedHumanApprover: go.authorizedHumanApprover,
          changeTicket: go.changeTicket,
          governanceModeFromGoRecord: go.governanceMode,
          now,
        });
        if (!humanVerification.ok) {
          fail(checks, 'INDEPENDENT_HUMAN_VERIFICATION', humanVerification.reasonCode);
          blockers.push(humanVerification.reasonCode);
        } else {
          pass(checks, 'INDEPENDENT_HUMAN_VERIFICATION');
          const verifierTs = validatePhaseAIndependentVerifierTimestampV1(
            iv.verifiedAtUtc,
            now,
            go.approvalBinding.validFrom,
          );
          if (!verifierTs.ok) {
            fail(checks, 'INDEPENDENT_VERIFIER_TIMESTAMP', verifierTs.reasonCode);
            blockers.push(verifierTs.reasonCode);
          } else {
            pass(checks, 'INDEPENDENT_VERIFIER_TIMESTAMP');
          }
        }
      }
      pushCheck(checks, {
        checkId: 'SINGLE_OPERATOR_POLICY_AND_RISK_ACCEPTANCE',
        status: 'SKIP',
        reasonCode: 'PHASE_A_SINGLE_OPERATOR_POLICY_NOT_APPLICABLE_MULTI_PARTY',
      });
    } else {
      pushCheck(checks, {
        checkId: 'INDEPENDENT_HUMAN_VERIFICATION',
        status: 'SKIP',
        reasonCode: 'PHASE_A_SECOND_HUMAN_VERIFICATION_NOT_APPLICABLE_SINGLE_OPERATOR',
      });
      pushCheck(checks, {
        checkId: 'INDEPENDENT_VERIFIER_TIMESTAMP',
        status: 'SKIP',
        reasonCode: 'PHASE_A_SECOND_HUMAN_VERIFICATION_NOT_APPLICABLE_SINGLE_OPERATOR',
      });
      const pathB = evaluatePhaseAHumanVerificationReadinessV1(env, {
        approvingAuthority: approval.approvingAuthority,
        authorizedHumanApprover: go.authorizedHumanApprover,
        changeTicket: go.changeTicket,
        approvalBinding: go.approvalBinding,
        maintenanceWindow: go.maintenanceWindow,
        governanceModeFromGoRecord: go.governanceMode,
        now,
      });
      if (!pathB.ok) {
        fail(checks, 'SINGLE_OPERATOR_POLICY_AND_RISK_ACCEPTANCE', pathB.reasonCode);
        blockers.push(pathB.reasonCode);
      } else {
        pass(checks, 'SINGLE_OPERATOR_POLICY_AND_RISK_ACCEPTANCE');
      }
    }
  }

  pushCheck(checks, {
    checkId: 'EXTERNAL_HUMAN_AUTHORIZATION_AUTHENTICATION',
    status: 'SKIP',
    reasonCode: 'PHASE_A_EXTERNAL_HUMAN_AUTHORIZATION_UNVERIFIED',
  });

  const specParsed = parsePhaseAProductionTargetSpecFromEnvV1(env);
  if (!specParsed.ok) {
    fail(checks, 'TARGET_SPEC', specParsed.reasonCode);
    blockers.push(specParsed.reasonCode);
  } else {
    pass(checks, 'TARGET_SPEC');
    const spec = specParsed.spec;
    const pt = go.productionTarget;
    if (
      spec.hostname !== pt.hostname ||
      spec.port !== pt.port ||
      spec.database !== pt.database ||
      spec.expectedAuditLogin !== pt.auditLogin
    ) {
      fail(checks, 'TARGET_SPEC_ALIGNMENT', 'PHASE_A_GO_NO_GO_TARGET_SPEC_MISMATCH');
      blockers.push('PHASE_A_GO_NO_GO_TARGET_SPEC_MISMATCH');
    } else {
      pass(checks, 'TARGET_SPEC_ALIGNMENT');
    }
  }

  const databaseUrl = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) {
    fail(checks, 'PRODUCTION_DATABASE_URL_PRESENT', 'PHASE_A_PRODUCTION_DATABASE_URL_REQUIRED');
    blockers.push('PHASE_A_PRODUCTION_DATABASE_URL_REQUIRED');
  } else {
    pass(checks, 'PRODUCTION_DATABASE_URL_PRESENT');
    const tls = validatePhaseAProductionTlsUrlPolicyV1(databaseUrl);
    if (!tls.ok) {
      fail(checks, 'TLS_URL_POLICY', tls.reasonCode);
      blockers.push(tls.reasonCode);
    } else {
      pass(checks, 'TLS_URL_POLICY');
    }
    if (specParsed.ok) {
      const target = validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1(databaseUrl, specParsed.spec);
      if (!target.ok) {
        fail(checks, 'DATABASE_URL_TARGET_MATCH', target.reasonCode);
        blockers.push(target.reasonCode);
      } else {
        pass(checks, 'DATABASE_URL_TARGET_MATCH');
        const approvedKey = validatePhaseAProductionApprovedTargetKeyMatchV1(
          target.canonicalTargetKey,
          approvalLoaded.ok ? approvalLoaded.record.approvedTargetKey : '',
        );
        if (!approvedKey.ok) {
          fail(checks, 'APPROVED_TARGET_KEY', approvedKey.reasonCode);
          blockers.push(approvedKey.reasonCode);
        } else {
          pass(checks, 'APPROVED_TARGET_KEY');
        }
      }
    }
    const genericUrl = env.DATABASE_URL?.trim();
    if (genericUrl && urlsSameTarget(databaseUrl, genericUrl)) {
      fail(checks, 'CREDENTIAL_ISOLATION_APP', 'PHASE_A_CANNOT_REUSE_DATABASE_URL');
      blockers.push('PHASE_A_CANNOT_REUSE_DATABASE_URL');
    } else {
      pass(checks, 'CREDENTIAL_ISOLATION_APP');
    }
    const issuerUrl = env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV]?.trim();
    if (issuerUrl && urlsSameTarget(databaseUrl, issuerUrl)) {
      fail(checks, 'CREDENTIAL_ISOLATION_ISSUER', 'PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL');
      blockers.push('PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL');
    } else {
      pass(checks, 'CREDENTIAL_ISOLATION_ISSUER');
    }
  }

  const consumptionDirEnv = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]?.trim();
  const storePath = consumptionDirEnv || go.consumptionStore.absolutePath.trim();
  if (consumptionDirEnv && consumptionDirEnv !== go.consumptionStore.absolutePath.trim()) {
    fail(checks, 'CONSUMPTION_STORE_ALIGNMENT', 'PHASE_A_GO_NO_GO_CONSUMPTION_PATH_MISMATCH');
    blockers.push('PHASE_A_GO_NO_GO_CONSUMPTION_PATH_MISMATCH');
  } else {
    pass(checks, 'CONSUMPTION_STORE_ALIGNMENT');
  }
  let resolvedConsumptionPath = storePath;
  const store = validatePhaseAProductionConsumptionStoreV1(storePath);
  if (!store.ok) {
    fail(checks, 'CONSUMPTION_STORE', store.reasonCode);
    blockers.push(store.reasonCode);
  } else {
    resolvedConsumptionPath = store.resolvedPath;
    pass(checks, 'CONSUMPTION_STORE');
    if (approvalLoaded.ok) {
      const notConsumed = assertPhaseAProductionApprovalNotConsumedV1(
        store.resolvedPath,
        approvalLoaded.record.approvalId,
      );
      if (!notConsumed.ok) {
        fail(checks, 'APPROVAL_NOT_CONSUMED', notConsumed.reasonCode);
        blockers.push(notConsumed.reasonCode);
      } else {
        pass(checks, 'APPROVAL_NOT_CONSUMED');
      }
    }
  }

  const mwStart = parseUtcIsoTimestampV1(go.maintenanceWindow.startUtc);
  const mwEnd = parseUtcIsoTimestampV1(go.maintenanceWindow.endUtc);
  if (!mwStart.ok || !mwEnd.ok) {
    fail(checks, 'MAINTENANCE_WINDOW', 'PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_INVALID');
    blockers.push('PHASE_A_GO_NO_GO_MAINTENANCE_WINDOW_INVALID');
  } else {
    const ts = now.getTime();
    if (ts < mwStart.epochMs || ts > mwEnd.epochMs) {
      fail(checks, 'MAINTENANCE_WINDOW', 'PHASE_A_GO_NO_GO_OUTSIDE_MAINTENANCE_WINDOW');
      blockers.push('PHASE_A_GO_NO_GO_OUTSIDE_MAINTENANCE_WINDOW');
    } else {
      pass(checks, 'MAINTENANCE_WINDOW');
    }
  }

  pushCheck(checks, {
    checkId: 'QUERY_MANIFEST_SCOPE',
    status: 'PASS',
    reasonCode: `MANIFEST_QUERY_COUNT_${Object.keys(M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1).length}`,
  });

  const approvedTargetKeyRedacted =
    databaseUrl && specParsed.ok ? redactPostgresDatabaseTargetV1(databaseUrl) : undefined;

  return finalizeReport(
    checks,
    blockers,
    {
      changeTicket: go.changeTicket,
      approvalId: go.approvalBinding.approvalId,
      authorizedReleaseSha: go.authorizedReleaseSha,
      approvedTargetKeyRedacted,
      consumptionStorePath: resolvedConsumptionPath,
      evidenceStorageDestination: go.evidenceStorageDestination,
    },
    { authorizedReleaseShaBinding: releaseBinding },
  );
}

function finalizeReport(
  checks: M3_3HvH4A3PhaseAOperationalReadinessCheckV1[],
  blockers: string[],
  sanitizedBinding: M3_3HvH4A3PhaseAOperationalReadinessReportV1['sanitizedBinding'],
  options: {
    authorizedReleaseShaBinding?: M3_3HvH4A3PhaseAOperationalReadinessReportV1['authorizedReleaseShaBinding'];
  } = {},
): M3_3HvH4A3PhaseAOperationalReadinessReportV1 {
  const uniqueBlockers = [...new Set(blockers)];
  const decision: M3_3HvH4A3PhaseAOperationalReadinessReportV1['decision'] =
    uniqueBlockers.length === 0 ? 'READY' : 'NO_GO';

  return {
    contractVersion: M3_3_HV_H4_A3_PHASE_A_OPERATIONAL_READINESS_REPORT_CONTRACT_V1,
    decision,
    productionPhaseAExecuted: false,
    productionNetworkAccessAttempted: false,
    postgresClientInstantiated: false,
    approvalConsumed: false,
    externalHumanAuthorizationAuthentication: 'UNVERIFIED',
    authorizedReleaseShaBinding: options.authorizedReleaseShaBinding ?? 'NOT_EVALUATED',
    auditCredentialExpectationsDeclaredOnly: true,
    checks,
    blockers: uniqueBlockers,
    sanitizedBinding,
  };
}
