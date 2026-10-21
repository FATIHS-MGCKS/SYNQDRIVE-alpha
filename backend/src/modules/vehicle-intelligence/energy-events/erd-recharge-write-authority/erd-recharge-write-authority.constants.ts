export const ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED_ENV =
  'ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED';

export const ERD_RECHARGE_WRITE_CUTOVER_AT_ENV = 'ERD_RECHARGE_WRITE_CUTOVER_AT';

export const ERD_RECHARGE_WRITE_AUTHORITY = {
  LEGACY: 'legacy',
  CANONICAL: 'canonical',
} as const;

export type ErdRechargeWriteAuthority =
  (typeof ERD_RECHARGE_WRITE_AUTHORITY)[keyof typeof ERD_RECHARGE_WRITE_AUTHORITY];

export const ERD_RECHARGE_WRITE_AUTHORITY_REASON = {
  CUTOVER_NOT_AUTHORIZED: 'cutover_not_authorized',
  CUTOVER_AT_MISSING: 'cutover_at_missing',
  CUTOVER_AT_INVALID: 'cutover_at_invalid',
  CANONICAL_SESSION_RUNTIME_DISABLED: 'canonical_session_runtime_disabled',
  FALLBACK_SESSION_RUNTIME_DISABLED: 'fallback_session_runtime_disabled',
  RECONCILIATION_RUNTIME_DISABLED: 'reconciliation_runtime_disabled',
  PRODUCT_READ_DEDUPE_DISABLED: 'product_read_dedupe_disabled',
  CANONICAL_AUTHORITY_READY: 'canonical_authority_ready',
} as const;

export type ErdRechargeWriteAuthorityReason =
  (typeof ERD_RECHARGE_WRITE_AUTHORITY_REASON)[keyof typeof ERD_RECHARGE_WRITE_AUTHORITY_REASON];

export const ERD_RECHARGE_EPISODE_WRITE_OWNER = {
  LEGACY: 'legacy',
  CANONICAL: 'canonical',
} as const;

export type ErdRechargeEpisodeWriteOwner =
  (typeof ERD_RECHARGE_EPISODE_WRITE_OWNER)[keyof typeof ERD_RECHARGE_EPISODE_WRITE_OWNER];

export const ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME = {
  LEGACY_OWNED: 'legacy_owned',
  SKIPPED_CANONICAL_AUTHORITY: 'post_cutover_suppressed',
  CANONICAL_ROW_PROTECTED: 'canonical_row_protected',
} as const;

export type ErdRechargeLegacyWriteGateOutcome =
  (typeof ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME)[keyof typeof ERD_RECHARGE_LEGACY_WRITE_GATE_OUTCOME];

export const ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME = {
  SKIPPED_LEGACY_AUTHORITY: 'skipped_legacy_authority',
  SKIPPED_PRE_CUTOVER: 'pre_cutover',
  NOT_PROJECTABLE: 'not_projectable',
  CREATED: 'created',
  RECONCILED: 'reconciled',
  NO_OP: 'no_op',
  HANDOFF_COMPLETED: 'handoff_completed',
  CONFLICT: 'conflict',
  FAILED_ISOLATED: 'failed_isolated',
} as const;

export type ErdRechargeProjectionRuntimeOutcome =
  (typeof ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME)[keyof typeof ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME];
