/**
 * Replay semantics for Phase-A governance evidence (P1B1-A1-H1).
 *
 * - In-memory `Set` instances passed into offline cryptographic verifiers are **ephemeral**:
 *   they only dedupe within a single verification call chain and are **not** durable replay protection.
 * - Rebuilding a verifier creates fresh sets; that must never be represented as execution-grade replay safety.
 * - R4.2A production execution still relies on approval execute nonce + consumption store (unchanged).
 */

export type M3_3HvH4A3GovernanceEphemeralNonceDedupScopeV1 = 'SINGLE_VERIFICATION_INVOCATION_ONLY';

export type M3_3HvH4A3GovernanceDurableReplayStoreContractV1 = {
  contractVersion: 'M3_3_HV_H4_A3_GOVERNANCE_DURABLE_REPLAY_STORE_V1';
  /** Future integration — not activated in A1/H1. */
  activationStatus: 'NOT_ACTIVATED';
  intendedUse: 'ONE_TIME_ACCEPTANCE_AND_PROBE_NONCE_CONSUMPTION';
};

export const M3_3_HV_H4_A3_GOVERNANCE_DURABLE_REPLAY_STORE_INERT_V1: M3_3HvH4A3GovernanceDurableReplayStoreContractV1 =
  {
    contractVersion: 'M3_3_HV_H4_A3_GOVERNANCE_DURABLE_REPLAY_STORE_V1',
    activationStatus: 'NOT_ACTIVATED',
    intendedUse: 'ONE_TIME_ACCEPTANCE_AND_PROBE_NONCE_CONSUMPTION',
  };

export function describeGovernanceEphemeralNonceDedupScopeV1(): M3_3HvH4A3GovernanceEphemeralNonceDedupScopeV1 {
  return 'SINGLE_VERIFICATION_INVOCATION_ONLY';
}
