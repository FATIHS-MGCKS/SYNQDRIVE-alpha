# RFRF F9 — Independent-replica PostgreSQL + Redis integration closure

**Date:** 2026-09-15  
**Branch:** `cursor/eed-rfrf-f9-multi-replica-integration-closure-f21f`  
**Base:** `main` @ `bcd64c0a2dc9e2f984ee74473ff1348073421cec` (F8 merge #1658)

## Scope rebase

Original F1 F9 scope was generic “PostgreSQL + multi-replica integration tests.” F5/F6/F7/F8 already pulled most of that forward:

| Prior phase | What it already proves |
|-------------|------------------------|
| F5-PR2 | Atomic promotion transaction; concurrent calls on **one** promotion service / Prisma stack (P3) |
| F5-PR3.1 | Real PG+Redis post-commit G2 handoff; P19 three concurrent handoffs → one BullMQ job |
| F7/F7.1 | Two recovery runtimes + two schedulers; same-vehicle convergence; 3/3 multi-replica PG+Redis |
| F8 | Current-head recertification + observability only |

**F9 closes only the remaining gap:** production multi-replica execution uses **independent** PrismaClient + promotion/G2 runtime stacks per replica. DB advisory lock authority must survive that process boundary.

## Main delta review (since F8 merge)

| SHA | Change | RFRF overlap |
|-----|--------|--------------|
| `bcd64c0a2` | F8/F8.1/F8.2 merge (#1658) | Observability only — no promotion/convergence semantics |
| `7f7fa0f45` | EXP-021 evidence (#1659) | None |

No conflicting RFRF/G2 integration changes on current `origin/main`.

## Coverage matrix

| Original F9 requirement | Existing proof | Exact test/gate | Real infra | Independent replicas? | Current-head execution | Remaining gap before F9 |
|-------------------------|----------------|-----------------|------------|----------------------|------------------------|-------------------------|
| Same candidate concurrent promotion | F5-PR2 P3 | `raw-fuel-refuel-fallback-f5-pr2-promotion.postgres.integration.spec.ts` | Real PG | **No** — single `buildRuntimeStack(prisma)` | PASS via F5-PR2 gate | **Yes** |
| SAME native concurrent convergence | F5-PR1 concurrent convergence | F5-PR1 spec | Real PG | No | PASS | **Yes** at promotion boundary |
| DISTINCT native + promotion | F5-PR2 P11 | F5-PR2 spec | Real PG | No | PASS | **Yes** at promotion boundary |
| INSUFFICIENT fail-closed race | F5-PR2 P8 | F5-PR2 spec | Real PG | No | PASS | **Yes** at promotion boundary |
| Different vehicles parallel | F5-PR2 P4 | F5-PR2 spec | Real PG | No | PASS | **Yes** at promotion boundary |
| Post-commit G2 handoff concurrency | F5-PR3 P19 | F5-PR3.1 gate | Real PG+Redis | **No** — single `g2Handoff` instance | 30/30 PASS | **Yes** — independent G2 stacks |
| Recovery multi-replica | F7 multi-replica spec | `physical-refuel-multi-replica-recovery.postgres-redis.integration.spec.ts` | Real PG+Redis | Yes (runtime A/B) | 3/3 PASS | **No** — reuse F9-P7 |
| F5-PR2 regression | F5-PR2 gate | `rfrf-f5-pr2-atomic-promotion-gate.sh` | Real PG | N/A | Required on F9 head | Re-run only |
| F5-PR3.1 regression | F5-PR3 gate | `rfrf-f5-pr3-g2-handoff-gate.sh` | Real PG+Redis | N/A | Required on F9 head | Re-run only |

## F9 implementation (TEST + GOVERNANCE only)

| Flag | Value |
|------|-------|
| RUNTIME_CODE_CHANGED | NO |
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| F9_IMPLEMENTATION_REQUIRED | TEST_ONLY |
| F9_ALREADY_SATISFIED_BY_PRIOR_PHASES | NO |

### Net-new artifacts

| Artifact | Purpose |
|----------|---------|
| `testing/f9-multi-replica.integration.harness.ts` | Independent replica builders + identity assertions + pipeline invariants |
| `raw-fuel-refuel-fallback-f9-multi-replica.postgres.integration.spec.ts` | F9-P1..P6, P10 |
| `backend/scripts/test/rfrf-f9-multi-replica-integration-gate.sh` | Consolidated F9 gate + prior authoritative regressions |

### Replica identity proof (mandatory)

Each F9 promotion/G2 case asserts:

- `replicaA.prisma !== replicaB.prisma`
- `replicaA.promotion !== replicaB.promotion` (promotion cases)
- `replicaA.runtimeStack !== replicaB.runtimeStack` (promotion cases)
- `replicaA.g2Handoff !== replicaB.g2Handoff` (P6)
- `replicaA.g2Runtime !== replicaB.g2Runtime` (P6)

### F9 test matrix

| Case | Contract | Result (local gate) |
|------|----------|----------------------|
| F9-P1 | Same candidate, two independent promotion replicas → 1 fallback VEE, 1 PROMOTED | PASS |
| F9-P2 | SAME native sibling → CONVERGED_NATIVE, 0 fallback VEE | PASS |
| F9-P3 | DISTINCT native → 1 fallback VEE, both forensic rows | PASS |
| F9-P4 | INSUFFICIENT native → fail-closed, 0 promotion | PASS |
| F9-P5 | Different vehicles parallel → both promote, no global serialization | PASS |
| F9-P6 | Independent G2 handoff/runtime stacks → ≤1 reconciliation owner, 1 effective BullMQ job | PASS |
| F9-P7 | Existing F7 multi-replica recovery 3/3 (reference) | Required in gate |
| F9-P8 | F5-PR2 regression | Required in gate |
| F9-P9 | F5-PR3.1 30/30 regression | Required in gate |
| F9-P10 | Pipeline invariant audit helper | PASS |

### F9-P6 boundary note

`RawRefuelG2HandoffService` holds no Prisma client; independence is proven on underlying `PhysicalRefuelReconciliationRuntimeService` + producer pairs (separate PrismaClient A/B, shared process-external BullMQ queue). `RuntimeStatusRegistry.setWorkersEnabled(true)` required for enqueue (same as F5-PR3).

## Consolidated gate

Script: `backend/scripts/test/rfrf-f9-multi-replica-integration-gate.sh`

Orchestrates: net-new F9 tests → F7 multi-replica (P7) → F5-PR2 (P8) → F5-PR3.1 (P9) → F7/F6/F5-PR1/F8/G2 Jest/metrics → build → prisma validate → EED graph → module registry → `git diff --check`.

Env flags: `RAW_FUEL_REFUEL_F9_INTEGRATION=1`, `RAW_FUEL_REFUEL_F9_POSTGRES_REQUIRED=1`, `RAW_FUEL_REFUEL_F9_REDIS_REQUIRED=1`.

## Evidence

**EED-EV-0062** — RFRF F9 independent-replica integration closure (TEST_ONLY, no runtime semantics change).

## Closure

| Field | Value |
|------|-------|
| NEW_F9_INTEGRATION_TESTS_REQUIRED | YES |
| NEW_F9_INTEGRATION_TEST_COUNT | 7 (P1–P6, P10 in one spec) |
| EXISTING_TESTS_REUSED | F7 multi-replica 3/3; F5-PR2; F5-PR3.1; F6; F7 PG; F8; G2.1b/c/d Jest; RFRF metrics |
| PR_REQUIRED_FOR_F9 | YES |
| F10_START_AUTHORIZED_AFTER_F9_MERGE | NO until F9 merge + green CI |
