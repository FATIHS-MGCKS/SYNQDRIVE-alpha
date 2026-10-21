# EED RFRF F10.6.8-B — Durable candidate recovery

Date: 2026-09-20

## Summary

Adds candidate-centric durable recovery for existing non-terminal `RawRefuelCandidate` rows:

- `computeRawRefuelCandidateRecoveryWindow` (evidence-anchored, bounded)
- `detectRawFuelRisesForPersistedSignalChannel` (recovery-only channel lock)
- `RawRefuelCandidateService.reconcileExistingCandidateById` (no insert path)
- PostgreSQL recovery fields + `FOR UPDATE SKIP LOCKED` claim batch
- `RawRefuelCandidateRecoveryService` + `RawRefuelCandidateRecoveryScheduler`
- Gate: `RAW_FUEL_REFUEL_FALLBACK_ENABLED` + `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED` + `RFRF_CANDIDATE_RECOVERY_ENABLED` (default false)

## Authority firewall

Recovery never invokes promotion, G2 handoff, or fallback `VehicleEnergyEvent` creation.

## F10.6.8-B1 closure (2026-09-20)

### Root cause — CI TypeScript failure

`RawFuelRefuelFallbackConfig` gained four F10.6.8-B fields. Explicit test `withConfigLoader(() => ({ masterEnabled, persistEnabled, cutoverAt }))` literals no longer satisfied the interface, breaking backend `tsc` and cascading into Stage-3/4 operational tooling gates.

### Fix

- Added `defaultRawFuelRefuelFallbackConfigForTests()` — recovery scheduler **OFF**, canonical numeric defaults.
- Updated RFRF runtime/di/fetch-outcome/F4-PR2 fixtures to use the helper.

### Tests added in B1

- `raw-refuel-candidate-recovery-restart-durability.postgres.integration.spec.ts` — process/service reconstruction without in-memory carryover.
- Extended `raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts` — no-data backoff, promotion firewall, terminal direct-call safety, WOB window containment, native E2E with real converged event id.

### Validation

```bash
cd backend && npx tsc --noEmit -p tsconfig.json
cd backend && bash scripts/test/rfrf-f10-stage3-authority-matrix-tests.sh
cd backend && bash scripts/test/rfrf-f10-stage4-authority-matrix-tests.sh
cd backend && npm test -- --testPathPattern='raw-refuel-candidate-recovery|raw-fuel-rise-liveness|physical-refuel-f10-6-8|raw-fuel-refuel-fallback.config'
RAW_REFUEL_CANDIDATE_RECOVERY_F10_6_8_B_INTEGRATION=1 npm test -- --testPathPattern='raw-refuel-candidate-recovery-f10-6-8-b.postgres.integration.spec.ts|raw-refuel-candidate-recovery-restart-durability.postgres.integration.spec.ts'
bash scripts/test/rfrf-f10-6-8-b-candidate-recovery-gate.sh  # isolated PG (CI Stage-4 gate)
```

### B1 follow-up — Stage-4 CI PostgreSQL matrix gate

- Added `backend/scripts/test/rfrf-f10-6-8-b-candidate-recovery-gate.sh` and wired it into `rfrf-stage4-convergence-readiness-ci-gate.sh` so §4.1–4.7 proofs execute on GitHub Actions isolated PostgreSQL (not deferrable locally without Docker).
- Gate includes resilient `db push` schema drift sync (e.g. `powertrain_type`) matching F5-PR1 isolated-DB pattern.

**B1 closure HEAD:** `1936ffb01831506a4d9fb9e36c37de854a70bc9f` — GitHub: Stage-3 SUCCESS, Stage-4 SUCCESS (incl. PG matrix), Legal Documents Typecheck SUCCESS.

## F10.6.8-B3 remediation (2026-09-20)

Independent B2 review (`de0413e4ef9a063b2fd209ccd305f115c6c5c704`) found stale-worker lease races and migration-gate false-pass risk.

### Fencing (B3)

- `recoveryAttemptCount` after claim is the monotonic **claim generation**.
- `lockRecoveryClaimForMutation` + `completeRecoveryAttemptFenced` enforce atomic compare-and-set on generation (and active lease for batch claims).
- Recovery-owned reconcile (`reconcileExistingCandidateByIdForRecoveryClaim`) and convergence (`evaluateAndApplyConvergenceById` + fence) revalidate ownership after network I/O.
- Metric: `synqdrive_rfrf_candidate_recovery_stale_claim_rejected_total`.

### Backoff (B3)

- First claimed failure schedules **5m** retry (`exponent = max(attempt-1, 0)`).

### CI migration integrity (B3)

- `verify-rfrf-f10-6-8-b-migration-contract.mjs` runs **before** any test-only `db push`.
- Negative selftest: `rfrf-f10-6-8-b-migration-contract-negative.selftest.sh`.

### Tests (B3)

- `raw-refuel-candidate-recovery-stale-lease.postgres.integration.spec.ts` — adversarial A/B lease expiry stale worker.
- `raw-refuel-candidate-recovery-backoff.spec.ts` — backoff boundaries.

**B3 closure HEAD:** `f4c4cde1a0e2d5ee248e18f0b3515ccadc2261cd`

Production: **not** deployed or mutated. Stage 5 **not** authorized.

## F10.6.8-B4 review (2026-09-21)

Read-only closure at `a77e3b03be6b6e1440aad028e0b69caa711313a4` (doc-only delta after B3 code SHA).

**Result:** `FIX_REQUIRED`

| Finding | Detail |
|--------|--------|
| Lock order | Recovery reconcile used `ROW → ADVISORY` while normal/convergence used `ADVISORY → ROW` → real deadlock cycle possible |
| Lease time | `fence.now` could be snapshotted across reconcile/convergence/completion; stale timestamp could authorize expired lease |
| Completion | Generation-only CAS; expired unreclaimed worker could still complete |
| `finishRecovery` | Several branches ignored `false` / stale completion |
| Negative selftest | Isolation guards partial vs main B gate |

## F10.6.8-B5 remediation (2026-09-21)

### Canonical lock order

All recovery mutations that need both locks: **vehicle advisory xact lock → candidate `FOR UPDATE` (recovery fence) → write**.

`reconcileExistingCandidateByIdForRecoveryClaim` reordered to match convergence and normal reconcile paths.

### Fresh lease time

- **Claim identity** (`RawRefuelCandidateRecoveryClaimIdentity`): generation + lease expectations only — no embedded clock.
- **Mutation context** (`mutationClock()`): invoked after blocking lock acquisition at each DB boundary (reconcile, convergence, completion).
- **Clock domain:** application `recoveryClock()` (overridable in PG tests); SQL lease checks use the fresh `mutationTime` parameter.

### Completion fence

`completeRecoveryAttemptFenced` requires matching generation **and** `recoveryLeaseExpiresAt > mutationTime` when `requireActiveLease`.

All `finishRecovery` callers propagate `stale_claim` when completion returns `STALE_CLAIM`.

### Tests (B5)

- `raw-refuel-candidate-recovery-f10-6-8-b5.postgres.integration.spec.ts` — post-reconcile lease expiry, READY crossed-lease, expired unreclaimed completion, stale completion propagation.
- Negative selftest: own `assert_test_db_isolation` before destructive DDL.

**B5 closure HEAD:** `0986d6efc07d04443ba083bd979fcdf171309f00`

Production: **not** deployed or mutated. Stage 5 **not** authorized.
