import { readFileSync } from 'node:fs';
import { assertPhaseAProductionApprovalIdSafeV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1';
import {
  M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1,
  type M3_3HvH4A3PhaseAProductionApprovalRecordV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.types.v1';

/** Maximum bounded validity window for a single production Phase-A approval (72 hours). */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_MAX_LIFETIME_MS = 72 * 60 * 60 * 1000;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED' as const;

/** Deliberate execution ack — insufficient alone; requires matching approval record + nonce. */
export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_PATH_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_PATH' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_DATABASE_URL' as const;

export const M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON_ENV =
  'M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON' as const;

function isTruthy(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function loadPhaseAProductionApprovalRecordV1(
  env: NodeJS.ProcessEnv,
): { ok: true; record: M3_3HvH4A3PhaseAProductionApprovalRecordV1 } | { ok: false; reasonCode: string } {
  const jsonInline = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON_ENV]?.trim();
  const path = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_PATH_ENV]?.trim();

  let raw: string | undefined;
  if (jsonInline) {
    raw = jsonInline;
  } else if (path) {
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_UNREADABLE' };
    }
  } else {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_REQUIRED' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_INVALID_JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_INVALID_SHAPE' };
  }
  const record = parsed as M3_3HvH4A3PhaseAProductionApprovalRecordV1;
  if (record.contractVersion !== M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONTRACT_V1) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_CONTRACT_MISMATCH' };
  }
  if (
    typeof record.approvalId !== 'string' ||
    typeof record.changeTicket !== 'string' ||
    typeof record.approvingAuthority !== 'string' ||
    typeof record.approvedTargetKey !== 'string' ||
    typeof record.validFrom !== 'string' ||
    typeof record.validUntil !== 'string' ||
    typeof record.executeNonce !== 'string'
  ) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_INVALID_TYPES' };
  }
  const idSafe = assertPhaseAProductionApprovalIdSafeV1(record.approvalId);
  if (!idSafe.ok) return idSafe;

  if (!record.changeTicket.trim() || !record.approvingAuthority.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_INCOMPLETE' };
  }
  if (!record.approvedTargetKey.trim() || !record.executeNonce.trim()) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_RECORD_INCOMPLETE' };
  }
  if (record.authenticationKind !== 'DOCUMENTED_HUMAN_APPROVAL') {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_AUTH_KIND_UNSUPPORTED' };
  }

  return { ok: true, record };
}

export function validatePhaseAProductionApprovalWindowV1(
  record: M3_3HvH4A3PhaseAProductionApprovalRecordV1,
  now: Date,
): { ok: true } | { ok: false; reasonCode: string } {
  const from = Date.parse(record.validFrom);
  const until = Date.parse(record.validUntil);
  if (Number.isNaN(from) || Number.isNaN(until)) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_VALIDITY_INVALID' };
  }
  if (until <= from) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_VALIDITY_REVERSED' };
  }
  if (until - from > M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_MAX_LIFETIME_MS) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_LIFETIME_EXCEEDED' };
  }
  const ts = now.getTime();
  if (ts < from) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_NOT_YET_VALID' };
  }
  if (ts > until) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_APPROVAL_EXPIRED' };
  }
  return { ok: true };
}

export function validatePhaseAProductionExecuteAckV1(
  record: M3_3HvH4A3PhaseAProductionApprovalRecordV1,
  env: NodeJS.ProcessEnv,
): { ok: true } | { ok: false; reasonCode: string } {
  if (!isTruthy(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV])) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_EXECUTE_ACK_REQUIRED' };
  }

  const approvalId = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_ENV]?.trim();
  const nonce = env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_NONCE_ENV]?.trim();

  if (!approvalId || !nonce) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_EXECUTE_BINDING_INCOMPLETE' };
  }
  if (approvalId !== record.approvalId) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_EXECUTE_APPROVAL_ID_MISMATCH' };
  }
  if (nonce !== record.executeNonce) {
    return { ok: false, reasonCode: 'PHASE_A_PRODUCTION_EXECUTE_NONCE_MISMATCH' };
  }

  return { ok: true };
}

/** Enabled flag alone must not authorize production execution. */
export function productionEnabledWithoutExecuteAckWouldAuthorizeV1(env: NodeJS.ProcessEnv): boolean {
  if (!isTruthy(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED_ENV])) {
    return false;
  }
  return !isTruthy(env[M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK_ENV]);
}
