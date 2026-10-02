import {
  isBatteryV2HvFallbackChargeSessionEnabled,
  isBatteryV2HvRechargeSessionEnabled,
  isBatteryV2ReconciliationEnabled,
} from '@config/battery-health-v2.config';
import { isErdRechargeProductReadDedupeEnabled } from '../erd-recharge-product-read-dedupe/erd-recharge-product-read-dedupe.config';
import {
  isErdRechargeWriteCutoverAuthorized,
  resolveErdRechargeWriteCutoverAt,
} from './erd-recharge-write-authority.config';
import {
  ERD_RECHARGE_EPISODE_WRITE_OWNER,
  ERD_RECHARGE_WRITE_AUTHORITY,
  ERD_RECHARGE_WRITE_AUTHORITY_REASON,
  ERD_RECHARGE_WRITE_CUTOVER_AT_ENV,
  type ErdRechargeEpisodeWriteOwner,
  type ErdRechargeWriteAuthority,
  type ErdRechargeWriteAuthorityReason,
} from './erd-recharge-write-authority.constants';

export interface ErdRechargeWriteAuthorityEvaluation {
  authority: ErdRechargeWriteAuthority;
  reason: ErdRechargeWriteAuthorityReason;
  cutoverAt: Date | null;
}

/**
 * Global write-authority resolver — always LEGACY or CANONICAL (never NONE).
 * Malformed / incomplete cutover configuration falls back to LEGACY.
 */
export function evaluateErdRechargeWriteAuthority(
  env: NodeJS.ProcessEnv = process.env,
): ErdRechargeWriteAuthorityEvaluation {
  const cutoverAt = resolveErdRechargeWriteCutoverAt(env);

  if (!isErdRechargeWriteCutoverAuthorized(env)) {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_NOT_AUTHORIZED,
      cutoverAt,
    };
  }

  const rawCutover = env[ERD_RECHARGE_WRITE_CUTOVER_AT_ENV];
  if (rawCutover == null || rawCutover.trim() === '') {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_AT_MISSING,
      cutoverAt: null,
    };
  }

  if (cutoverAt == null) {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_AT_INVALID,
      cutoverAt: null,
    };
  }

  if (!isBatteryV2HvRechargeSessionEnabled()) {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.CANONICAL_SESSION_RUNTIME_DISABLED,
      cutoverAt,
    };
  }

  if (!isBatteryV2HvFallbackChargeSessionEnabled()) {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.FALLBACK_SESSION_RUNTIME_DISABLED,
      cutoverAt,
    };
  }

  if (!isBatteryV2ReconciliationEnabled()) {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.RECONCILIATION_RUNTIME_DISABLED,
      cutoverAt,
    };
  }

  if (!isErdRechargeProductReadDedupeEnabled(env)) {
    return {
      authority: ERD_RECHARGE_WRITE_AUTHORITY.LEGACY,
      reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.PRODUCT_READ_DEDUPE_DISABLED,
      cutoverAt,
    };
  }

  return {
    authority: ERD_RECHARGE_WRITE_AUTHORITY.CANONICAL,
    reason: ERD_RECHARGE_WRITE_AUTHORITY_REASON.CANONICAL_AUTHORITY_READY,
    cutoverAt,
  };
}

export interface ErdRechargeEpisodeOwnershipEvaluation {
  owner: ErdRechargeEpisodeWriteOwner;
  evidenceEnd: Date;
  cutoverAt: Date | null;
  globalAuthority: ErdRechargeWriteAuthority;
}

/** Physical evidence end boundary — same semantics as RFRF promotion cutover. */
export function evaluateRechargeEpisodeWriteOwner(input: {
  physicalEvidenceEnd: Date;
  globalAuthority: ErdRechargeWriteAuthorityEvaluation;
}): ErdRechargeEpisodeOwnershipEvaluation {
  const { physicalEvidenceEnd, globalAuthority } = input;
  const { authority: global, cutoverAt } = globalAuthority;

  if (global === ERD_RECHARGE_WRITE_AUTHORITY.LEGACY || cutoverAt == null) {
    return {
      owner: ERD_RECHARGE_EPISODE_WRITE_OWNER.LEGACY,
      evidenceEnd: physicalEvidenceEnd,
      cutoverAt,
      globalAuthority: global,
    };
  }

  if (physicalEvidenceEnd.getTime() < cutoverAt.getTime()) {
    return {
      owner: ERD_RECHARGE_EPISODE_WRITE_OWNER.LEGACY,
      evidenceEnd: physicalEvidenceEnd,
      cutoverAt,
      globalAuthority: global,
    };
  }

  return {
    owner: ERD_RECHARGE_EPISODE_WRITE_OWNER.CANONICAL,
    evidenceEnd: physicalEvidenceEnd,
    cutoverAt,
    globalAuthority: global,
  };
}

export function resolveHvChargeSessionPhysicalEvidenceEnd(session: {
  endAt: Date | null;
  startAt: Date;
  isOngoing?: boolean;
}): Date | null {
  if (session.isOngoing === true) {
    return null;
  }
  if (session.endAt != null && !Number.isNaN(session.endAt.getTime())) {
    return session.endAt;
  }
  return session.startAt;
}
