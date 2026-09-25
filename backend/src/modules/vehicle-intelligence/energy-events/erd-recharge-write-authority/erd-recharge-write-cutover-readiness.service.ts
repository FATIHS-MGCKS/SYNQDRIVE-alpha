import { Injectable } from '@nestjs/common';
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
import { evaluateErdRechargeWriteAuthority } from './erd-recharge-write-authority.policy';
import {
  ERD_RECHARGE_WRITE_AUTHORITY,
  ERD_RECHARGE_WRITE_AUTHORITY_REASON,
  type ErdRechargeWriteAuthorityReason,
} from './erd-recharge-write-authority.constants';

export interface ErdRechargeWriteCutoverReadinessReport {
  cutoverAuthorized: boolean;
  cutoverAt: string | null;
  hvRechargeSessionEnabled: boolean;
  fallbackSessionEnabled: boolean;
  reconciliationEnabled: boolean;
  productReadDedupeEnabled: boolean;
  effectiveWriteAuthority: typeof ERD_RECHARGE_WRITE_AUTHORITY.LEGACY | typeof ERD_RECHARGE_WRITE_AUTHORITY.CANONICAL;
  blockingReasons: ErdRechargeWriteAuthorityReason[];
}

@Injectable()
export class ErdRechargeWriteCutoverReadinessService {
  evaluate(env: NodeJS.ProcessEnv = process.env): ErdRechargeWriteCutoverReadinessReport {
    const evaluation = evaluateErdRechargeWriteAuthority(env);
    const cutoverAt = resolveErdRechargeWriteCutoverAt(env);
    const blockingReasons: ErdRechargeWriteAuthorityReason[] = [];

    if (!isErdRechargeWriteCutoverAuthorized(env)) {
      blockingReasons.push(ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_NOT_AUTHORIZED);
    }
    if (isErdRechargeWriteCutoverAuthorized(env) && cutoverAt == null) {
      blockingReasons.push(ERD_RECHARGE_WRITE_AUTHORITY_REASON.CUTOVER_AT_MISSING);
    }
    if (!isBatteryV2HvRechargeSessionEnabled()) {
      blockingReasons.push(
        ERD_RECHARGE_WRITE_AUTHORITY_REASON.CANONICAL_SESSION_RUNTIME_DISABLED,
      );
    }
    if (!isBatteryV2HvFallbackChargeSessionEnabled()) {
      blockingReasons.push(
        ERD_RECHARGE_WRITE_AUTHORITY_REASON.FALLBACK_SESSION_RUNTIME_DISABLED,
      );
    }
    if (!isBatteryV2ReconciliationEnabled()) {
      blockingReasons.push(ERD_RECHARGE_WRITE_AUTHORITY_REASON.RECONCILIATION_RUNTIME_DISABLED);
    }
    if (!isErdRechargeProductReadDedupeEnabled(env)) {
      blockingReasons.push(ERD_RECHARGE_WRITE_AUTHORITY_REASON.PRODUCT_READ_DEDUPE_DISABLED);
    }

    return {
      cutoverAuthorized: isErdRechargeWriteCutoverAuthorized(env),
      cutoverAt: cutoverAt?.toISOString() ?? null,
      hvRechargeSessionEnabled: isBatteryV2HvRechargeSessionEnabled(),
      fallbackSessionEnabled: isBatteryV2HvFallbackChargeSessionEnabled(),
      reconciliationEnabled: isBatteryV2ReconciliationEnabled(),
      productReadDedupeEnabled: isErdRechargeProductReadDedupeEnabled(env),
      effectiveWriteAuthority: evaluation.authority,
      blockingReasons,
    };
  }
}
