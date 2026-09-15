/**
 * Authoritative freshness / observation policy for P2.5 cutover evidence.
 *
 * Sources:
 * - docs/audits/vdc-rb019-p25-cutover-activation-readiness-2026-09-15.md §5.3, §3.4
 * - VDC authority CURRENT_STATE.md (P2.5 activation-readiness semantic closure)
 */

/** Target-scope pre-seed dry-run evidence must be ≤24h old at verification time. */
export const CUTOVER_EVIDENCE_PRESEED_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** UNEXPLAINED operational proof observation window must cover ≥7 days. */
export const CUTOVER_EVIDENCE_MIN_UNEXPLAINED_OBSERVATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Signed mixed-replica deployment attestation freshness (immediately pre-cutover). */
export const CUTOVER_EVIDENCE_MIXED_REPLICA_MAX_AGE_MS = 24 * 60 * 60 * 1000;
