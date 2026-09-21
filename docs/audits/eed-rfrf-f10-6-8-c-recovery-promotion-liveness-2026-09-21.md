# EED — RFRF F10.6.8-C recovered-READY → promotion liveness

## Gap

Stage 5 enabled fallback promotion on the rolling runtime path only. `RawRefuelCandidateRecoveryService.recoverReadyCandidate()` applied authoritative convergence but always finished with `PENDING_NATIVE_RECONCILIATION` when no SAME native existed — it never invoked `RawRefuelPromotionService`. A READY candidate reachable only via the durable recovery scheduler therefore lacked a guaranteed promotion path (rolling scan is probabilistic, not a liveness contract).

## Fix

After convergence handling, recovery invokes canonical `RawRefuelPromotionService.evaluateAndApplyPromotionById()` with optional recovery claim mutation context:

- ADVISORY(vehicle) → fresh mutation time → recovery-generation row lock → promotion evaluation → VEE insert + lifecycle in one transaction
- Lease re-checked immediately before VEE insert
- Outcome `SUCCESS_PROMOTED` added for recovery completion semantics

Stage 6 / G2 handoff unchanged and not invoked from recovery.

## Evidence

- `raw-refuel-candidate-recovery-f10-6-8-c.postgres.integration.spec.ts`
- `backend/scripts/test/rfrf-f10-6-8-c-recovery-promotion-gate.sh`
