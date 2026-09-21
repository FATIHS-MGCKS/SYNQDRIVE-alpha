# EED — RFRF F10.6.8-C recovered-READY → promotion liveness

## Gap

Stage 5 enabled fallback promotion on the rolling runtime path only. `RawRefuelCandidateRecoveryService.recoverReadyCandidate()` applied authoritative convergence but always finished with `PENDING_NATIVE_RECONCILIATION` when no SAME native existed — it never invoked `RawRefuelPromotionService`. A READY candidate reachable only via the durable recovery scheduler therefore lacked a guaranteed promotion path (rolling scan is probabilistic, not a liveness contract).

## Fix

After convergence handling, recovery invokes canonical `RawRefuelPromotionService.evaluateAndApplyPromotionById()` with optional recovery claim mutation context:

- ADVISORY(vehicle) → fresh mutation time → recovery-generation row lock → promotion evaluation → VEE insert + lifecycle in one transaction
- Lease re-checked immediately before VEE insert
- Outcome `SUCCESS_PROMOTED` added for recovery completion semantics

## F10.6.8-C1 — atomic recovery completion

Recovery-owned successful promotion now commits `SUCCESS_PROMOTED` recovery terminal metadata (`recoveryLastOutcome`, cleared lease, null next attempt) in the **same** promotion transaction as fallback VEE + `lifecycleState=PROMOTED`. No second `finishRecovery` is required after `PROMOTED` when `recoveryOwnedPromotionFinalized=true`.

Transaction hooks cannot bypass recovery lease/generation validation (hook runs first, fence runs independently before VEE insert and before lifecycle write).

## F10.6.8-C2 — stale-generation proof + governance closure

Two legitimate stale cases (not concurrent reclaim while promotion holds the candidate row lock):

1. **Expired lease before side effect** — current generation, `mutationClock` after lease expiry → `SKIPPED_NO_ACTION` / `recovery_claim_stale`; no VEE, no `PROMOTED`, no `SUCCESS_PROMOTED`.
2. **Superseded generation** — worker A generation N lease expires without holding promotion row lock; worker B reclaims N+1 and atomically promotes; A’s captured gen-N recovery context cannot mutate VEE, lifecycle, or B’s lease/metadata.

Independent-replica proof uses two `PrismaClient` stacks (`prismaA !== prismaB`). Invariant: exactly one fallback VEE and one canonical `sourceEventKey`, terminal `PROMOTED` + `SUCCESS_PROMOTED`; one or two caller `SUCCESS_PROMOTED` outcomes are valid when the loser idempotently read-backs after the winner commits.

Production remains Stage 5 (promotion ON, candidate recovery ON, G2 OFF). Stage 6 / direct recovery→G2 handoff is out of scope.

## Evidence

- `raw-refuel-candidate-recovery-f10-6-8-c.postgres.integration.spec.ts`
- `backend/scripts/test/rfrf-f10-6-8-c-recovery-promotion-gate.sh`
- `rfrf-stage4-convergence-readiness-ci-gate.sh` orchestrates the C gate on PR CI (PostgreSQL service)
- Migration `20260921140000_rfrf_f10_6_8_c_recovery_success_promoted` (additive `SUCCESS_PROMOTED` enum)
