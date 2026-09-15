# VDC RB-019 Phase 2 P2.5 — Authority Cutover Runtime Foundation

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Baseline main** | `5bd1b266c06c9ce0989dbac0b23c3d5b27cb8e07` (post-#1650 entry-gate audit) |
| **Epistemic** | **P2_5_IMPLEMENTATION_PRESENT** — cutover activation **NOT_PROVEN** |
| **Production** | **NOT_DEPLOYED / NOT_ENABLED / NOT_CUTOVER** |

## Explicit non-claims

- P2.5 cutover activation = **NO** (`P2_5_CUTOVER_ACTIVATION_READY=NOT_PROVEN`)
- `AUTHORITY_MODE_IN_PRODUCTION` = **LEGACY** (unchanged)
- Feature flags enabled = **NO**
- Production authority latch mutated = **NO**
- Production side effects executed = **NO**
- Production mutated = **NO**
- Production deployed = **NO**

## BEFORE

P2.4 provided pre-seed tooling and transactional pre-cutover guards, but no runtime path could latch `LEGACY → PHYSICAL`, route webhook/snapshot exclusively through physical authority when latched, or enforce mixed-replica / activation-evidence gates.

## WHY

P2.5 implementation must make scoped authority cutover **possible** under the frozen lock contract while preserving safe defaults: flags ≠ authority, forward-only latch, legacy write exclusion under PHYSICAL, and fail-closed activation gates.

## IMPLEMENTATION

| Component | Path |
|-----------|------|
| Cutover types + eligibility | `physical-state-authority-cutover.types.ts`, `physical-state-authority-cutover.eligibility.ts` |
| Authority latch service | `physical-state-authority-cutover.service.ts` |
| Repository latch mutation | `device-connection-physical-authority-cutover.repository.ts` (`latchLegacyToPhysicalInTransaction`) |
| Mixed-replica interlock | `physical-state-cutover-mixed-replica-interlock.ts` |
| Webhook PHYSICAL routing + legacy guard | `device-connection-webhook.service.ts` |
| Snapshot legacy episode exclusion | `dimo-snapshot.processor.ts` |
| Writer/orchestrator POST_CUTOVER routing | `physical-state-evidence-writer.service.ts`, `physical-state-snapshot-evidence-orchestrator.service.ts` |
| PG proof P25-A..R | `device-connection-physical-authority-cutover-p25.postgres.integration.spec.ts` |

### Authority latch contract

1. Cutover eligibility evaluated **before** mutation; `NOT_PROVEN` activation evidence blocks latch.
2. Mutation runs in one transaction: advisory lock (`buildPhysicalStateAuthorityLockKey`) + `SELECT … FOR UPDATE` + forward-only `LEGACY → PHYSICAL`.
3. Repeated latch → `ALREADY_PHYSICAL` (idempotent).
4. `PHYSICAL → LEGACY` forbidden by state machine.

### Flags vs authority

When persisted authority is `PHYSICAL`, disabling master/sub-flags does **not** restore legacy write authority. `physicalGateAuthoritative` remains true; legacy OBD persistence is structurally excluded (`persistDeviceConnectionEvent` guard + snapshot episode resolver skip).

### Mixed-replica interlock (application-side)

`SYNQDRIVE_BUILD_ID` / `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` / optional `SYNQDRIVE_REPLICA_PEER_BUILD_IDS` — deployment orchestration must still prove uniform replica rollout before production cutover.

## VALIDATION (repository)

| Suite | Result |
|-------|--------|
| P25 unit (eligibility, mixed-replica, webhook routing) | PASS (local) |
| Physical-state unit (excl. PG) | PASS (local) |
| Typecheck | PASS |
| Prisma validate | PASS |
| Module registry | PASS |
| VDC graph validator | PASS |
| P25 PG integration (P25-A..R) | **PASS** — CI run `34910625008` @ `dfdfac9a`: 96/96 tests, 9/9 suites |

## REMAINING ACTIVATION GATES (operational — NOT_PROVEN)

- `P24_TARGET_DATA_DRY_RUN_GATE` — **PASS** (2026-09-15 Production read-only dry-run, 4 scopes, zero mutations) — see [activation-readiness audit](../../../docs/audits/vdc-rb019-p25-cutover-activation-readiness-2026-09-15.md)
- `UNEXPLAINED_CORRECTNESS_CRITICAL_DIVERGENCES` — operational shadow observations (**NOT_PROVEN** — STATEFUL_SHADOW not enabled)
- `MIXED_REPLICA_OPERATIONAL_PROOF` — full fleet replica uniformity at cutover time (**NOT_PROVEN** — Production deploy behind main; no build identity env)
- `ACTIVATION_EVIDENCE_PROVENANCE` — signed evidence bundle required (**FAIL** — caller-supplied booleans today)
