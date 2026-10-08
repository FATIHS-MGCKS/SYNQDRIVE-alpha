import { canonicalPostgresTargetKeyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';
import { M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV } from './m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1';
import { M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.isolated-target.v1';
import {
  assertPhaseAProductionApprovalNotConsumedV1,
  markPhaseAProductionApprovalConsumedV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval-consumption.v1';
import {
  loadPhaseAProductionApprovalRecordV1,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV,
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV,
  validatePhaseAProductionApprovalWindowV1,
  validatePhaseAProductionExecuteAckV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1';
import type { M3_3HvH4A3PhaseAProductionAdmissionEvidenceV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';
import {
  parsePhaseAProductionTargetSpecFromEnvV1,
  validatePhaseAProductionApprovedTargetKeyMatchV1,
  validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1';

export type M3_3HvH4A3PhaseAProductionAdmissionResultV1 =
  | { ok: true; evidence: M3_3HvH4A3PhaseAProductionAdmissionEvidenceV1 }
  | { ok: false; reasonCode: string };

function urlsRepresentSameTargetV1(a: string, b: string): boolean {
  if (a === b) return true;
  const keyA = canonicalPostgresTargetKeyV1(a);
  const keyB = canonicalPostgresTargetKeyV1(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

function isTruthyEnabled(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Production Phase-A admission — default DENY. Documented human approval + deliberate execute ack + one-time consumption.
 * Does not use isolated-test harness bypass. Does not authorize from ENABLED alone.
 */
export function evaluatePhaseAPreflightProductionAdmissionV1(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: Date; consumeApproval?: boolean } = {},
): M3_3HvH4A3PhaseAProductionAdmissionResultV1 {
  const now = options.now ?? new Date();

  const harnessActive = env[M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE_ENV]?.trim();
  const harnessOn =
    harnessActive === '1' || harnessActive?.toLowerCase() === 'true' || harnessActive?.toLowerCase() === 'yes';
  if (harnessOn) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_INTEGRATION_HARNESS_FORBIDDEN' };
  }

  if (!isTruthyEnabled(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV])) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_PREFLIGHT_DISABLED' };
  }

  const recordLoaded = loadPhaseAProductionApprovalRecordV1(env);
  if (!recordLoaded.ok) return recordLoaded;

  const window = validatePhaseAProductionApprovalWindowV1(recordLoaded.record, now);
  if (!window.ok) return window;

  const execute = validatePhaseAProductionExecuteAckV1(recordLoaded.record, env);
  if (!execute.ok) return execute;

  const specParsed = parsePhaseAProductionTargetSpecFromEnvV1(env);
  if (!specParsed.ok) return specParsed;

  const target = validatePhaseAProductionDatabaseUrlAgainstTargetSpecV1(databaseUrl, specParsed.spec);
  if (!target.ok) return target;

  const approvedKey = validatePhaseAProductionApprovedTargetKeyMatchV1(
    target.canonicalTargetKey,
    recordLoaded.record.approvedTargetKey,
  );
  if (!approvedKey.ok) return approvedKey;

  const genericUrl = env.DATABASE_URL?.trim();
  if (genericUrl && urlsRepresentSameTargetV1(databaseUrl, genericUrl)) {
    return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_DATABASE_URL' };
  }

  const issuerUrl = env[M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL_ENV]?.trim();
  if (issuerUrl && urlsRepresentSameTargetV1(databaseUrl, issuerUrl)) {
    return { ok: false, reasonCode: 'PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL' };
  }

  const consumptionDir = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV]?.trim();
  const notConsumed = assertPhaseAProductionApprovalNotConsumedV1(
    consumptionDir,
    recordLoaded.record.approvalId,
  );
  if (!notConsumed.ok) return notConsumed;

  if (options.consumeApproval !== false && consumptionDir) {
    try {
      markPhaseAProductionApprovalConsumedV1(
        consumptionDir,
        recordLoaded.record.approvalId,
        recordLoaded.record.executeNonce,
        now,
      );
    } catch {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_ALREADY_CONSUMED' };
    }
  }

  return {
    ok: true,
    evidence: {
      admissionChannel: 'PRODUCTION_AUTHORIZED_R4_2A',
      approvalId: recordLoaded.record.approvalId,
      changeTicket: recordLoaded.record.changeTicket,
      approvingAuthority: recordLoaded.record.approvingAuthority,
      approvedTargetKey: recordLoaded.record.approvedTargetKey,
      authenticationKind: recordLoaded.record.authenticationKind,
      cryptographicAuthentication: false,
      executeConsumedAt: now.toISOString(),
    },
  };
}
