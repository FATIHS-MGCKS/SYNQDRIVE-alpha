# EXP-021 S4F-1 — Dormant observability, reconciliation, activation-readiness foundation

**Slice:** S4F-1  
**Base main:** `c5cc0da85c2efe0d7fffbc124791645493f3a705`  
**Status:** Engineering complete (dormant — no AppModule, no activation)

## Scope

| Concept | Implementation |
|---------|----------------|
| Bounded read-only reconciliation | `s4f-observability/di-v0-s4f-reconciliation.service.ts` |
| Observability snapshot contract | `DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1` |
| Activation-readiness evaluator | `di-v0-s4f-activation-readiness.ts` (fail-closed) |
| Beyond 10d drift horizon | `di-v0-s4f-beyond-horizon.ts` — report only, no T11 |
| Provider backpressure audit | `di-v0-s4f-provider-backpressure-audit.ts` → **OPEN_CONFIRMED** |
| Location retention governance | `design/s4f/S4F_LOCATION_RETENTION_GOVERNANCE_NOTE.md` |
| Executor liveness | Replica-local registry signal; gap `DI-GAP-S4F-GLOBAL-EXECUTOR-LIVENESS-001` |

## Hard boundaries preserved

- No deploy, no S4 activation, no AppModule registration, no provider calls, no canonical trip writes.
- No `s4a-contract.v2.json` amendment.

## Tests

- Unit: `di-v0-s4f.unit.spec.ts`, `di-v0-s4f-dormant-audit.spec.ts`
- PostgreSQL: `di-v0-s4f.postgres.integration.spec.ts` (F01–F14)
- CI: `npm run test:di:s4f` / `test:di:s4f:postgres` wired in `s4a-postgres-integration.yml`

## Activation gates (evaluator defaults)

| Gate | S4F-1 result |
|------|----------------|
| Replay deserializer | SATISFIED (gap closed in S4D) |
| Snapshot rehash | SATISFIED |
| Provider backpressure | NOT_SATISFIED (gap OPEN) |
| Location retention governance note | Artifact present; operator/privacy scale-up still required |
| Explicit operator authorization | NOT_SATISFIED (human gate) |
| **TINY_ACTIVATION_READY** | **NO** (evaluator requires explicit per-gate evidence; empty input → all gates UNKNOWN/NOT_SATISFIED) |

---

## Independent pre-merge audit remediation (PR #1853)

**Prior PR head:** `e4d8fe26f47d7860e79c1478c653c7dd9c524386`

| ID | Fix |
|----|-----|
| P1-A | Activation readiness requires explicit `DiV0S4fTinyActivationGateEvidence`; no hardcoded SATISFIED |
| P1-B | Contract splits `diagnosticReconciliation.bounded=true` vs `operationalAggregates.bounded=false` (FULL_TABLE_AGGREGATE) |
| P1-C | `t10ExhaustedCandidateCount` matches T10 predicate (LEASED + expired lease + attempts ≥ max); retryable due excludes exhausted |
| P1-D | Beyond-horizon uses S4E scope corruption + canonical `trip_vehicle_id` fingerprint |
| P1-E | F32 uses interactive tx `SET TRANSACTION READ ONLY` + `buildObservabilitySnapshotOnDb(tx)` |
| P1-F | Retired pipeline metrics: CLASS A violation, valid/expired lease, provenance-unknown (no fake legacy label) |
| P1-G | Control plane via `evaluateDiV0S4KillRow` — MISSING/MALFORMED/UNREADABLE fail-closed |

Tests extended: **F01–F36** (F25–F36 remediation matrix).

---

## Final evidence hardening (H1–H4)

| ID | Proof |
|----|--------|
| H1 | Unit tests drive real `acquireDiV0HistoricalPositions` + `DiV0S4cExecutor` with transport-thrown `DimoProviderBudgetError` / `DimoRateLimitedError` (zero HTTP) → `mapDiV0S4cPositionFailure` → `RETRYABLE_RELEASE` → `repository.failRetryable` |
| H2 | Keyset cursor freezes population via `scanWatermarkCreatedAt` (`clock_timestamp()` on first page); filter `wi.created_at <= watermark`; authority `SCAN_WATERMARK_CREATED_AT_THEN_SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID`; Postgres H2-A/B/C |
| H3 | `DiV0S4fReadDb = Pick<PrismaClient, '$queryRaw'>`; dormant audit covers all production `.ts` files; F32 sets `READ ONLY` on tx client before S4F |
| H4 | Operational aggregate index audit from `20260927200000_di_v0_s4a_dormant_foundation/migration.sql` — `OPERATIONAL_AGGREGATE_INDEX_BLOCKER=NO` (no merge-critical defect; no new migration) |
